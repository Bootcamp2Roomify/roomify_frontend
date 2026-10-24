import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DetectionReview } from "../src/features/room/DetectionReview";
import { AnalysisPanel } from "../src/features/room/AnalysisPanel";
import { NormalizedDetection, ProjectContext } from "../src/types/room";
import * as api from "../src/services/api";

vi.mock("../src/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/api")>();
  return { ...actual, updateFurnitureDecision: vi.fn(), addRoomObject: vi.fn(), relabelRoomObject: vi.fn(), removeRoomObject: vi.fn() };
});

const projectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const chair: NormalizedDetection = { id: "a1111111-1111-4111-8111-111111111111", label: "chair", confidence: 0.83,
  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, decision: "UNSURE", source: "CV" };
const props = { projectId, imageUrl: "https://example.com/room.jpg", imageWidth: 1200, imageHeight: 800,
  detections: [chair], onRetry: vi.fn(), onContinue: vi.fn() };

beforeEach(() => { vi.mocked(api.addRoomObject).mockReset(); vi.mocked(api.relabelRoomObject).mockReset(); vi.mocked(api.removeRoomObject).mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("MVP Feature 4: correct the furniture list", () => {
  it("adds a missed item as user-confirmed, with no box", async () => {
    vi.mocked(api.addRoomObject).mockResolvedValueOnce({ id: "b2222222-2222-4222-8222-222222222222", label: "bookshelf",
      confidence: 1, box: null, decision: "KEEP", source: "MANUAL" });
    render(<DetectionReview {...props} />);
    fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "  bookshelf " } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(await screen.findByRole("button", { name: "Inspect bookshelf · Added by you" })).toBeInTheDocument();
    expect(api.addRoomObject).toHaveBeenCalledWith(projectId, "bookshelf", "KEEP");
    expect(screen.queryByTestId("detection-box-b2222222-2222-4222-8222-222222222222")).not.toBeInTheDocument();
  });

  it("renames and removes items, and reports failures without losing the list", async () => {
    vi.mocked(api.relabelRoomObject).mockResolvedValueOnce({ ...chair, label: "armchair", confidence: 1, source: "MANUAL" });
    vi.mocked(api.removeRoomObject).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(undefined);
    render(<DetectionReview {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename chair" }));
    fireEvent.change(screen.getByLabelText("New name for chair"), { target: { value: "armchair" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Inspect armchair · Added by you" })).toBeInTheDocument();
    expect(api.relabelRoomObject).toHaveBeenCalledWith(projectId, chair.id, "armchair");

    fireEvent.click(screen.getByRole("button", { name: "Remove armchair from the list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove the item");
    expect(screen.getByRole("button", { name: "Inspect armchair · Added by you" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove armchair from the list" }));
    expect(await screen.findByText("No Objects Detected")).toBeInTheDocument();
  });

  it("lets people build the list from an empty analysis", async () => {
    vi.mocked(api.addRoomObject).mockResolvedValueOnce({ id: "c3333333-3333-4333-8333-333333333333", label: "desk",
      confidence: 1, box: null, decision: "REPLACE", source: "MANUAL" });
    render(<DetectionReview {...props} detections={[]} />);
    fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "desk" } });
    fireEvent.change(screen.getByLabelText("Decision for the new item"), { target: { value: "REPLACE" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const item = await screen.findByRole("listitem");
    expect(within(item).getByRole("radio", { name: /replace/i })).toBeChecked();
  });

  it("flags low-confidence detections and still rejects CV items without a box", () => {
    const { unmount } = render(<DetectionReview {...props} detections={[{ ...chair, confidence: 0.42 }]} />);
    expect(screen.getByText(/Low confidence — please check this is a chair/)).toBeInTheDocument();
    unmount();
    render(<DetectionReview {...props} detections={[{ ...chair, box: null }]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("missing bounding box geometry");
  });
});

describe("MVP Feature 3: continue manually after a failed analysis", () => {
  it("offers manual entry and another upload", async () => {
    const context: ProjectContext = { projectId, image: { projectId, imageId: "101", imageUrl: "https://example.com/room.jpg", width: 1200, height: 800 } };
    render(<AnalysisPanel projectId={projectId} projectContext={context}
      analysis={{ status: "failed", result: null, error: "We could not analyze this image. Try again.", isAnalyzing: false, start: vi.fn(), retry: vi.fn() }} />);
    expect(screen.getByRole("link", { name: "Upload a different photo" })).toHaveAttribute("href", `/projects/${projectId}/upload`);
    fireEvent.click(screen.getByRole("button", { name: "Add items manually" }));
    expect(await screen.findByRole("heading", { name: "List your furniture" })).toBeInTheDocument();
    expect(screen.getByLabelText("Item name")).toBeInTheDocument();
  });
});

describe("stored analysis with hand-added items", () => {
  it("accepts a MANUAL item without a box and rejects a CV one", async () => {
    const response = (bbox: unknown, source: string) => Response.json({ projectId, objects: [
      { objectId: chair.id, imageId: 101, label: "desk", confidence: 1, bbox, modelVersion: "manual", decision: "KEEP", source }] });
    const { getStoredAnalysis } = await vi.importActual<typeof import("../src/services/api")>("../src/services/api");
    vi.stubGlobal("fetch", vi.fn(async () => response(null, "MANUAL")));
    const result = await getStoredAnalysis(projectId);
    expect(result.detections[0]).toMatchObject({ box: null, source: "MANUAL", decision: "KEEP" });
    vi.stubGlobal("fetch", vi.fn(async () => response(null, "CV")));
    await expect(getStoredAnalysis(projectId)).rejects.toThrow("invalid bbox");
  });
});
