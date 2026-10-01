import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnalysisPanel } from "../src/features/room/AnalysisPanel";
import { DetectionReview } from "../src/features/room/DetectionReview";
import * as api from "../src/services/api";
import { ProjectContext, NormalizedDetection, AnalysisResult } from "../src/types/room";
import { UseRoomAnalysisReturn } from "../src/features/room/useRoomAnalysis";

// Mock API layer to verify retry adapter boundaries and ensure no unauthorized calls
vi.mock("../src/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/api")>();
  return {
    ...actual,
    analyzeRoom: vi.fn(),
    createProject: vi.fn(),
    uploadRoomImage: vi.fn(),
  };
});

const TEST_PROJECT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const TEST_IMAGE_ID = "img-00000000-0081";
const TEST_PREVIEW_URL = "blob:http://localhost:3000/test-preview-blob-uuid";

const validContext: ProjectContext = {
  projectId: TEST_PROJECT_ID,
  image: {
    projectId: TEST_PROJECT_ID,
    imageId: TEST_IMAGE_ID,
    imageUrl: "https://example.com/cdn/valid-room.jpg",
    width: 1200,
    height: 800,
  },
  previewUrl: TEST_PREVIEW_URL,
};

const sampleDetections: NormalizedDetection[] = [
  {
    id: "det-chair-1",
    label: "Modern Chair",
    confidence: 0.92,
    box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  },
  {
    id: "det-table-1",
    label: "Coffee Table",
    confidence: 0.88,
    box: { x: 0.5, y: 0.5, width: 0.4, height: 0.3 },
  },
];

describe("Integration: Room Analysis & DetectionReview Mount Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. matching success mounts linked boxes and list with honest unavailable continuation", () => {
    const mockRetry = vi.fn();
    const successfulAnalysis: UseRoomAnalysisReturn = {
      status: "succeeded",
      result: {
        projectId: TEST_PROJECT_ID,
        imageId: TEST_IMAGE_ID,
        detections: sampleDetections,
      },
      error: null,
      isAnalyzing: false,
      start: vi.fn(),
      retry: mockRetry,
    };

    render(
      <AnalysisPanel
        projectId={TEST_PROJECT_ID}
        projectContext={validContext}
        analysis={successfulAnalysis}
      />
    );

    // Verified success status announcements
    expect(screen.getByText(/analysis complete! results ready/i)).toBeInTheDocument();
    expect(screen.getByText(/2 objects detected/i)).toBeInTheDocument();

    // DetectionReview container is mounted
    expect(screen.getByTestId("detection-review")).toBeInTheDocument();

    // List buttons render formatted labels and confidences
    const chairItem = screen.getByRole("button", { name: /modern chair · 92%/i });
    const tableItem = screen.getByRole("button", { name: /coffee table · 88%/i });
    expect(chairItem).toBeInTheDocument();
    expect(tableItem).toBeInTheDocument();

    // Simulate successful image load matching fixture dimensions (1200x800)
    const img = screen.getByRole("img", { name: /room/i });
    Object.defineProperty(img, "naturalWidth", {
      value: 1200,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "naturalHeight", {
      value: 800,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "complete", {
      value: true,
      configurable: true,
      writable: true,
    });
    fireEvent.load(img);

    // Overlay boxes exist with accessible attributes
    const chairBox = screen.getByTestId("detection-box-det-chair-1");
    const tableBox = screen.getByTestId("detection-box-det-table-1");
    expect(chairBox).toBeInTheDocument();
    expect(tableBox).toBeInTheDocument();

    // Initial unselected state
    expect(chairItem).toHaveAttribute("aria-pressed", "false");
    expect(chairBox).toHaveAttribute("aria-pressed", "false");

    // Click list item -> links and selects both list item and overlay box
    fireEvent.click(chairItem);
    expect(chairItem).toHaveAttribute("aria-pressed", "true");
    expect(chairBox).toHaveAttribute("aria-pressed", "true");

    // Click overlay box -> toggles selection off
    fireEvent.click(chairBox);
    expect(chairItem).toHaveAttribute("aria-pressed", "false");
    expect(chairBox).toHaveAttribute("aria-pressed", "false");

    // Selection of table box selects table list item
    fireEvent.click(tableBox);
    expect(tableItem).toHaveAttribute("aria-pressed", "true");
    expect(tableBox).toHaveAttribute("aria-pressed", "true");

    // Absent continuation destination displays truthful unavailable state without dead links
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /next step unavailable: furniture selection destination is not yet configured/i
      )
    ).toBeInTheDocument();
  });

  it("2. mismatch rejects: result projectId or imageId mismatch triggers recovery and refuses to mount DetectionReview", () => {
    // 2a. Result Project ID Mismatch
    const mismatchedProjectAnalysis: UseRoomAnalysisReturn = {
      status: "succeeded",
      result: {
        projectId: "wrong-project-uuid-9999",
        imageId: TEST_IMAGE_ID,
        detections: sampleDetections,
      },
      error: null,
      isAnalyzing: false,
      start: vi.fn(),
      retry: vi.fn(),
    };

    const { rerender } = render(
      <AnalysisPanel
        projectId={TEST_PROJECT_ID}
        projectContext={validContext}
        analysis={mismatchedProjectAnalysis}
      />
    );

    // Mismatched project ID must render recovery UI
    expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /upload a room image to start over/i })
    ).toHaveAttribute("href", "/new-room");
    expect(screen.queryByTestId("detection-review")).not.toBeInTheDocument();

    // 2b. Result Image ID Mismatch (same project, previous image results)
    const mockRetryImage = vi.fn();
    const mismatchedImageAnalysis: UseRoomAnalysisReturn = {
      status: "succeeded",
      result: {
        projectId: TEST_PROJECT_ID,
        imageId: "wrong-image-uuid-8888",
        detections: sampleDetections,
      },
      error: null,
      isAnalyzing: false,
      start: vi.fn(),
      retry: mockRetryImage,
    };

    rerender(
      <AnalysisPanel
        projectId={TEST_PROJECT_ID}
        projectContext={validContext}
        analysis={mismatchedImageAnalysis}
      />
    );

    // Mismatched image ID in same project must render stale-results recovery UI and no stale boxes
    expect(screen.getByText(/results belong to a previous room image/i)).toBeInTheDocument();
    expect(screen.queryByTestId("detection-review")).not.toBeInTheDocument();

    // 'Analyze current image' button invokes injectedAnalysis retry callback
    const analyzeCurrentBtn = screen.getByRole("button", { name: /analyze current image/i });
    expect(analyzeCurrentBtn).toBeInTheDocument();
    fireEvent.click(analyzeCurrentBtn);
    expect(mockRetryImage).toHaveBeenCalledTimes(1);

    // Recovery provides /new-room link
    expect(
      screen.getByRole("link", { name: /upload a new room image/i })
    ).toHaveAttribute("href", "/new-room");
  });

  it("3. missing preview/dims recovery (no API): renders recovery and disables analysis without calling backend", () => {
    // 3a. Context with no previewUrl and no image.imageUrl (e.g. reload after temporary blob loss)
    const contextWithoutUsableUrl: ProjectContext = {
      projectId: TEST_PROJECT_ID,
      image: {
        projectId: TEST_PROJECT_ID,
        imageId: TEST_IMAGE_ID,
        width: 1200,
        height: 800,
      },
    };

    const { rerender } = render(
      <AnalysisPanel
        projectId={TEST_PROJECT_ID}
        projectContext={contextWithoutUsableUrl}
      />
    );

    expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /upload a room image to start over/i })
    ).toHaveAttribute("href", "/new-room");
    expect(screen.queryByRole("button", { name: /start analysis/i })).not.toBeInTheDocument();

    // 3b. Context with non-positive dimensions (width = 0)
    const contextWithZeroDims: ProjectContext = {
      projectId: TEST_PROJECT_ID,
      image: {
        projectId: TEST_PROJECT_ID,
        imageId: TEST_IMAGE_ID,
        width: 0,
        height: 800,
        imageUrl: "https://example.com/room.jpg",
      },
      previewUrl: TEST_PREVIEW_URL,
    };

    rerender(
      <AnalysisPanel
        projectId={TEST_PROJECT_ID}
        projectContext={contextWithZeroDims}
      />
    );

    expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start analysis/i })).not.toBeInTheDocument();

    // 3c. Context with negative dimensions
    const contextWithNegativeDims: ProjectContext = {
      projectId: TEST_PROJECT_ID,
      image: {
        projectId: TEST_PROJECT_ID,
        imageId: TEST_IMAGE_ID,
        width: 1200,
        height: -100,
      },
      previewUrl: TEST_PREVIEW_URL,
    };

    rerender(
      <AnalysisPanel
        projectId={TEST_PROJECT_ID}
        projectContext={contextWithNegativeDims}
      />
    );

    expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();

    // Verify zero API calls were made across all non-render-ready conditions
    expect(api.createProject).not.toHaveBeenCalled();
    expect(api.uploadRoomImage).not.toHaveBeenCalled();
    expect(api.analyzeRoom).not.toHaveBeenCalled();
  });

  it("4. retry adapter only: retries only analysis without invoking project creation or image upload", async () => {
    // 1st attempt fails, 2nd attempt succeeds
    const successResult: AnalysisResult = {
      projectId: TEST_PROJECT_ID,
      imageId: TEST_IMAGE_ID,
      detections: sampleDetections,
    };

    vi.mocked(api.analyzeRoom)
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValueOnce(successResult);

    render(
      <AnalysisPanel
        projectId={TEST_PROJECT_ID}
        projectContext={validContext}
      />
    );

    // Initial ready state: trigger first analysis
    const startButton = screen.getByRole("button", { name: /start analysis/i });
    fireEvent.click(startButton);

    // First attempt fails with curated safe fallback
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("We could not analyze this image. Try again.");
    });

    const retryButton = screen.getByRole("button", { name: /retry analysis/i });
    expect(retryButton).toBeInTheDocument();

    // Trigger retry
    fireEvent.click(retryButton);

    // Second attempt succeeds and mounts DetectionReview
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("detection-review")).toBeInTheDocument();
      expect(screen.getByText(/modern chair · 92%/i)).toBeInTheDocument();
    });

    // Verification: exactly two analyzeRoom calls, and ZERO calls to createProject or uploadRoomImage
    expect(api.analyzeRoom).toHaveBeenCalledTimes(2);
    expect(api.createProject).not.toHaveBeenCalled();
    expect(api.uploadRoomImage).not.toHaveBeenCalled();
  });

  it("5. finding 3 regression: real normalizeDetections output for edge geometry (640x480, x=5, y=0, w=635, h=480) renders edge box without geometry alert", () => {
    const rawDetections = [
      {
        id: "det-edge-1",
        label: "Edge Shelf",
        confidence: 0.89,
        bounding_box: {
          x: 5,
          y: 0,
          width: 635,
          height: 480,
        },
      },
    ];

    const normalized = api.normalizeDetections(
      rawDetections,
      { width: 640, height: 480 },
      "pixel"
    );

    render(
      <DetectionReview
        imageUrl="https://example.com/edge-room.jpg"
        imageWidth={640}
        imageHeight={480}
        detections={normalized}
        onRetry={vi.fn()}
      />
    );

    // Simulate matching natural image load (640x480)
    const img = screen.getByRole("img", { name: /room/i });
    Object.defineProperty(img, "naturalWidth", {
      value: 640,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "naturalHeight", {
      value: 480,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "complete", {
      value: true,
      configurable: true,
      writable: true,
    });
    fireEvent.load(img);

    // Assert no geometry alert
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Assert edge box is visible and rendered
    const edgeBox = screen.getByTestId("detection-box-det-edge-1");
    expect(edgeBox).toBeInTheDocument();
    expect(edgeBox).toBeVisible();
  });
});
