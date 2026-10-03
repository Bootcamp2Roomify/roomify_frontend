import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisPanel } from "../src/features/room/AnalysisPanel";
import { useRoomAnalysis, UseRoomAnalysisReturn } from "../src/features/room/useRoomAnalysis";
import { getStoredAnalysis } from "../src/services/api";
import { ProjectContext } from "../src/types/room";

const projectId = "00000000-0000-0000-0000-000000000079";
const objectId = "00000000-0000-0000-0000-000000000081";
const context: ProjectContext = { projectId, image: { projectId, imageId: "101", imageUrl: "/room.png", width: 800, height: 600 } };
const stored = (label = "Chair", imageId: unknown) => ({ projectId, objects: [{ objectId, imageId, label, confidence: .83, bbox: { x: .1, y: .2, w: .3, h: .4 }, modelVersion: "room-model-v1" }] });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const calls: string[] = [];

beforeEach(() => { calls.length = 0; window.localStorage.clear(); vi.stubEnv("NEXT_PUBLIC_API_URL", ""); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Spring project API integration", () => {
  it("starts analysis before loading saved UUID objects, even when the same image ID has older detections", async () => {
    let analyzed = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method || "GET";
      calls.push(`${method} ${url}`);
      if (method === "POST") { analyzed = true; return response({ projectId, status: "ANALYZED", objects: [{ id: 7, label: "Chair", confidence: .83, bbox: { xMin: .1, yMin: .2, xMax: .4, yMax: .6 }, decision: "UNSURE" }] }); }
      return response(stored(analyzed ? "Current chair" : "Old sofa", 101));
    }));
    render(<AnalysisPanel projectId={projectId} projectContext={context} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /current chair · 83%/i })).toBeInTheDocument());
    expect(screen.queryByText("Old sofa")).not.toBeInTheDocument();
    expect(calls).toEqual([`POST /api/projects/${projectId}/analysis`, `GET /api/projects/${projectId}/analysis`]);
    const image = screen.getByRole("img", { name: /room preview/i });
    Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 600, configurable: true });
    fireEvent.load(image);
    expect(screen.getByTestId(`detection-box-${objectId}`)).toBeInTheDocument();
  });

  it("retries a failed analysis without recreating or uploading the project", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method || "GET";
      calls.push(`${method} ${url}`);
      if (method === "POST") return ++attempts === 1 ? response({ message: "private stack trace" }, 503) : response({ projectId, status: "ANALYZED", objects: [] });
      return response({ projectId, objects: [] });
    }));
    render(<AnalysisPanel projectId={projectId} projectContext={context} />);
    await waitFor(() => expect(screen.getByTestId("analysis-error-alert")).toHaveTextContent("We could not analyze this image. Try again."));
    fireEvent.click(screen.getByRole("button", { name: /retry analysis/i }));
    await waitFor(() => expect(screen.getByText(/0 objects detected/i)).toBeInTheDocument());
    expect(calls).toEqual([`POST /api/projects/${projectId}/analysis`, `POST /api/projects/${projectId}/analysis`, `GET /api/projects/${projectId}/analysis`]);
    expect(screen.queryByText(/private stack trace/)).not.toBeInTheDocument();
  });

  it("never calls backend for an injected local preview", async () => {
    const fetchSpy = vi.fn(async (_url: string) => response({ projectId, objects: [] })); vi.stubGlobal("fetch", fetchSpy);
    const preview: UseRoomAnalysisReturn = { status: "ready", result: null, error: null, isAnalyzing: false, start: async () => {}, retry: async () => {} };
    render(<AnalysisPanel projectId={projectId} projectContext={context} analysis={preview} />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not start backend writes when no render-ready room context is available", async () => {
    const fetchSpy = vi.fn(async (_url: string) => response({ projectId, objects: [] })); vi.stubGlobal("fetch", fetchSpy);
    render(<AnalysisPanel projectId={projectId} projectContext={null} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("link", { name: /upload a room image to start over/i })).toHaveAttribute("href", "/new-room");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, "undefined", -1])("rejects malformed persisted image identity %s", async (imageId) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(stored("Chair", imageId))));
    await expect(getStoredAnalysis(projectId)).rejects.toThrow(/invalid imageId/);
  });

  it("cancels analysis when the active image changes within a project", async () => {
    let firstSignal: AbortSignal | null | undefined;
    let resolveOld: (response: Response) => void = () => {};
    let postCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST" && ++postCount === 1) {
        firstSignal = init.signal;
        return new Promise<Response>(resolve => { resolveOld = resolve; });
      }
      return init?.method === "POST" ? response({ projectId, status: "ANALYZED", objects: [] }) : response(stored("New chair", 102));
    }));
    const { result, rerender } = renderHook(({ image }) => useRoomAnalysis(projectId, image), { initialProps: { image: "101" } });
    await waitFor(() => expect(postCount).toBe(1));
    rerender({ image: "102" });
    await waitFor(() => expect(result.current.result?.imageId).toBe("102"));
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => { resolveOld(response({ projectId, status: "ANALYZED", objects: [] })); });
    expect(result.current.result?.detections[0].label).toBe("New chair");
  });

  it("uses a same-origin API proxy so preview ports do not depend on backend CORS", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8080");
    const fetchSpy = vi.fn(async (_url: string) => response({ projectId, objects: [] })); vi.stubGlobal("fetch", fetchSpy);
    await getStoredAnalysis(projectId, "101");
    expect(fetchSpy.mock.calls[0][0]).toBe(`/api/projects/${projectId}/analysis`);
  });
});
