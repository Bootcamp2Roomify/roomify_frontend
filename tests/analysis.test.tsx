import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, renderHook } from "@testing-library/react";
import {
  useRoomAnalysis,
  sanitizeAnalysisError,
  FALLBACK_ERROR_MESSAGE,
  type UseRoomAnalysisReturn,
} from "../src/features/room/useRoomAnalysis";
import { AnalysisPanel } from "../src/features/room/AnalysisPanel";
import AnalyzePage from "../src/app/projects/[id]/analyze/page";
import * as api from "../src/services/api";
import { ProjectContext } from "../src/types/room";
import { saveProjectContext, clearProjectContext } from "../src/features/room/projectContext";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Spy on API service
vi.mock("../src/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/api")>();
  return {
    ...actual,
    getStoredAnalysis: vi.fn(),
    createProject: vi.fn(),
    uploadRoomImage: vi.fn(),
  };
});

const sampleContext: ProjectContext = {
  projectId: "123",
  image: {
    projectId: "123",
    imageId: "img-5678-uuid",
    imageUrl: "https://example.com/room.jpg",
    width: 1024,
    height: 768,
  },
  previewUrl: "blob:http://localhost/sample-preview-blob",
};

describe("ROOM-80: Room Analysis Hook, Panel, and Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProjectContext("proj-1234-uuid");
    clearProjectContext("proj-5678-uuid");
    clearProjectContext("proj-9999-other");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. delayed promise shows analyzing text/spinner with aria-live status", async () => {
    let resolveAnalysis: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveAnalysis = resolve;
    });

    vi.mocked(api.analyzeRoom).mockImplementation(() => pendingPromise as any);

    render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={sampleContext}
      />
    );

    // Initial state: ready
    const startButton = screen.getByRole("button", { name: /start analysis/i });
    expect(startButton).toBeInTheDocument();

    // Click start
    fireEvent.click(startButton);

    // Should immediately show analyzing state, spinner, and aria-live status
    const statusRegion = screen.getByRole("status");
    expect(statusRegion).toBeInTheDocument();
    expect(statusRegion).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/analyzing room interior/i)).toBeInTheDocument();

    // Spinner or progress indicator is visible
    expect(screen.getByTestId("analysis-spinner")).toBeInTheDocument();

    // Resolve the promise
    await act(async () => {
      resolveAnalysis({
        projectId: "proj-1234-uuid",
        imageId: "img-5678-uuid",
        detections: [],
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("analysis-spinner")).not.toBeInTheDocument();
    });
  });

  it("2. two immediate clicks result in exactly one analysis call and button remains disabled while pending", async () => {
    let resolveAnalysis: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveAnalysis = resolve;
    });

    vi.mocked(api.analyzeRoom).mockImplementation(() => pendingPromise as any);

    render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={sampleContext}
      />
    );

    const startButton = screen.getByRole("button", { name: /start analysis/i });

    // Double-click rapidly
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    // Exactly one call triggered
    expect(api.analyzeRoom).toHaveBeenCalledTimes(1);

    // Button remains in the DOM and is disabled while pending
    expect(startButton).toBeInTheDocument();
    expect(startButton).toBeDisabled();
    expect(startButton).toHaveTextContent(/analyzing/i);

    // Clean up promise
    await act(async () => {
      resolveAnalysis({
        projectId: "proj-1234-uuid",
        imageId: "img-5678-uuid",
        detections: [],
      });
    });
  });

  it("3. failed analysis shows 'We could not analyze this image. Try again.' and retains image/project", async () => {
    vi.mocked(api.analyzeRoom).mockRejectedValueOnce(
      new Error("Vision model internal timeout")
    );

    render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={sampleContext}
      />
    );

    const startButton = screen.getByRole("button", { name: /start analysis/i });
    fireEvent.click(startButton);

    // Wait for failure
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute("aria-live", "assertive");
      // MUST show exact fallback and NOT leak unvetted "Vision model internal timeout"
      expect(alert).toHaveTextContent("We could not analyze this image. Try again.");
      expect(alert).not.toHaveTextContent("Vision model internal timeout");
    });

    // Original uploaded image MUST be retained in DOM
    const roomImage = screen.getByRole("img", { name: /room image|uploaded room/i });
    expect(roomImage).toBeInTheDocument();
    expect(roomImage).toHaveAttribute(
      "src",
      "blob:http://localhost/sample-preview-blob"
    );

    // Project context is preserved, retry button is offered
    const retryButton = screen.getByRole("button", { name: /retry analysis/i });
    expect(retryButton).toBeInTheDocument();
  });

  it("4. Retry succeeds with two analysis calls total and no create/upload calls", async () => {
    vi.mocked(api.analyzeRoom)
      .mockRejectedValueOnce(new Error("Transient network failure"))
      .mockResolvedValueOnce({
        projectId: "proj-1234-uuid",
        imageId: "img-5678-uuid",
        detections: [
          {
            id: "det-1",
            label: "Chair",
            confidence: 0.95,
            box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          },
        ],
      });

    render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={sampleContext}
      />
    );

    // 1st attempt -> fails
    const startButton = screen.getByRole("button", { name: /start analysis/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // 2nd attempt -> retry
    const retryButton = screen.getByRole("button", { name: /retry analysis/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText(/analysis complete/i)).toBeInTheDocument();
    });

    // Exactly 2 analyzeRoom calls
    expect(api.analyzeRoom).toHaveBeenCalledTimes(2);

    // NO project creation or image upload calls during retry
    expect(api.createProject).not.toHaveBeenCalled();
    expect(api.uploadRoomImage).not.toHaveBeenCalled();
  });

  it("5. malformed or unsafe server message is not rendered as HTML/internal details", async () => {
    const maliciousPayload = "<script>alert('xss')</script><b onmouseover='alert(1)'>Crash</b> Traceback: /var/secrets/key.pem";
    vi.mocked(api.analyzeRoom).mockRejectedValueOnce(new Error(maliciousPayload));

    render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={sampleContext}
      />
    );

    const startButton = screen.getByRole("button", { name: /start analysis/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      // Safe fallback MUST be shown
      expect(alert).toHaveTextContent("We could not analyze this image. Try again.");
    });

    // Verify raw malicious HTML/internal details are not present in DOM
    expect(document.querySelector("script")).toBeNull();
    expect(document.body.innerHTML).not.toContain("<b onmouseover=");
    expect(document.body.innerHTML).not.toContain("/var/secrets/key.pem");
  });

  it("6. unmount/project change aborts or ignores an older response without service-failure banner", async () => {
    let rejectPromise: (err: any) => void = () => {};
    const abortablePromise = new Promise((_, reject) => {
      rejectPromise = reject;
    });

    vi.mocked(api.analyzeRoom).mockImplementation((_projId, signal) => {
      if (signal) {
        signal.addEventListener("abort", () => {
          const abortError = new Error("This operation was aborted");
          abortError.name = "AbortError";
          rejectPromise(abortError);
        });
      }
      return abortablePromise as any;
    });

    const { unmount } = render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={sampleContext}
      />
    );

    const startButton = screen.getByRole("button", { name: /start analysis/i });
    fireEvent.click(startButton);

    // Unmount while analyzing
    unmount();

    // Wait microtask
    await act(async () => {
      await Promise.resolve();
    });

    // Alert banner should never exist on unmounted component
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("7. absent/corrupt/wrong-project context shows recovery to /new-room", () => {
    // 7a. Absent context
    const { rerender } = render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={null}
      />
    );

    expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();
    const recoveryLink = screen.getByRole("link", { name: /upload a room image to start over/i });
    expect(recoveryLink).toBeInTheDocument();
    expect(recoveryLink).toHaveAttribute("href", "/new-room");

    // 7b. Wrong-project context (mismatched projectId)
    const wrongContext: ProjectContext = {
      projectId: "proj-9999-other",
      image: {
        projectId: "proj-9999-other",
        imageId: "img-other",
        imageUrl: "https://example.com/other.jpg",
      },
    };

    rerender(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={wrongContext}
      />
    );

    // Should NOT show wrong project's image
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upload a room image to start over/i })).toHaveAttribute("href", "/new-room");
  });

  it("8. empty detections is successful analysis, not an error", async () => {
    vi.mocked(api.analyzeRoom).mockResolvedValueOnce({
      projectId: "proj-1234-uuid",
      imageId: "img-5678-uuid",
      detections: [],
    });

    render(
      <AnalysisPanel
        projectId="proj-1234-uuid"
        projectContext={sampleContext}
      />
    );

    const startButton = screen.getByRole("button", { name: /start analysis/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText(/analysis complete/i)).toBeInTheDocument();
      expect(screen.getByText(/0 objects detected/i)).toBeInTheDocument();
    });
  });

  it("9. AnalyzePage route integration renders matching context and recovery on missing context", async () => {
    // Case A: Missing context in storage
    const paramsPromiseA = Promise.resolve({ id: "proj-1234-uuid" });
    let unmountA: (() => void) | undefined;

    await act(async () => {
      const rendered = render(<AnalyzePage params={paramsPromiseA} />);
      unmountA = rendered.unmount;
      await paramsPromiseA;
    });

    await waitFor(() => {
      expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();
    });

    await act(async () => {
      unmountA?.();
    });

    // Case B: Seeded matching context in storage
    saveProjectContext(sampleContext);
    const paramsPromiseB = Promise.resolve({ id: "proj-1234-uuid" });
    let unmountB: (() => void) | undefined;

    await act(async () => {
      const rendered = render(<AnalyzePage params={paramsPromiseB} />);
      unmountB = rendered.unmount;
      await paramsPromiseB;
    });

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /uploaded room image/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start analysis/i })).toBeInTheDocument();
    });

    await act(async () => {
      unmountB?.();
    });
  });

  // Focused Regression Tests
  describe("Focused Regressions", () => {
    it("strictly maps all service failures to exact fallback copy without technical jargon", () => {
      expect(
        sanitizeAnalysisError(
          new Error("Vision service unavailable (503). Analysis could not be completed; please retry.")
        )
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(
        sanitizeAnalysisError(
          new Error("Invalid project state or missing active image for analysis (409 Conflict).")
        )
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(sanitizeAnalysisError(new Error("Vision model internal timeout"))).toBe(FALLBACK_ERROR_MESSAGE);
      expect(sanitizeAnalysisError(new Error("Database connection pool exhausted"))).toBe(FALLBACK_ERROR_MESSAGE);
      expect(sanitizeAnalysisError(new Error("500 Internal Server Error"))).toBe(FALLBACK_ERROR_MESSAGE);
      expect(sanitizeAnalysisError(new Error("Unknown error"))).toBe(FALLBACK_ERROR_MESSAGE);
      expect(sanitizeAnalysisError(null)).toBe(FALLBACK_ERROR_MESSAGE);
    });

    it("projectId change resets ready/result/error and prevents stale promises across project switches (A -> B -> A)", async () => {
      let resolveA: (val: any) => void = () => {};
      const promiseA = new Promise((resolve) => {
        resolveA = resolve;
      });

      vi.mocked(api.analyzeRoom).mockImplementation((projectId) => {
        if (projectId === "proj-1234-uuid") {
          return promiseA as any;
        }
        return Promise.resolve({
          projectId: "proj-5678-uuid",
          imageId: "img-9999-uuid",
          detections: [],
        }) as any;
      });

      const { result, rerender } = renderHook(
        ({ id }) => useRoomAnalysis(id),
        { initialProps: { id: "proj-1234-uuid" } }
      );

      // 1. Start analysis for project A
      act(() => {
        void result.current.start();
      });
      expect(result.current.status).toBe("analyzing");
      expect(result.current.isAnalyzing).toBe(true);

      // 2. Switch to project B while project A is in flight
      rerender({ id: "proj-5678-uuid" });

      // Immediate state reset for new project
      expect(result.current.status).toBe("ready");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isAnalyzing).toBe(false);

      // 3. Resolve stale project A promise
      await act(async () => {
        resolveA({
          projectId: "proj-1234-uuid",
          imageId: "img-5678-uuid",
          detections: [
            {
              id: "det-stale",
              label: "Stale Bed",
              confidence: 0.99,
              box: { x: 0, y: 0, width: 0.5, height: 0.5 },
            },
          ],
        });
      });

      // Project B state must NOT receive Project A's stale result
      expect(result.current.status).toBe("ready");
      expect(result.current.result).toBeNull();

      // 4. Switch back to project A (A -> B -> A)
      rerender({ id: "proj-1234-uuid" });
      expect(result.current.status).toBe("ready");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("Finding 5 Regressions: Image Load & Recovery in AnalysisPanel", () => {
    function triggerImageError(img: HTMLElement) {
      Object.defineProperty(img, "naturalWidth", {
        value: 0,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(img, "naturalHeight", {
        value: 0,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(img, "complete", {
        value: true,
        configurable: true,
        writable: true,
      });
      fireEvent.error(img);
    }

    function triggerImageLoad(img: HTMLElement, width = 1024, height = 768) {
      Object.defineProperty(img, "naturalWidth", {
        value: width,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(img, "naturalHeight", {
        value: height,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(img, "complete", {
        value: true,
        configurable: true,
        writable: true,
      });
      fireEvent.load(img);
    }

    it("broken image in ready state displays recovery UI rather than broken photo", () => {
      render(
        <AnalysisPanel
          projectId="proj-1234-uuid"
          projectContext={sampleContext}
        />
      );

      const img = screen.getByRole("img", { name: /uploaded room image/i });
      triggerImageError(img);

      expect(screen.getByTestId("image-recovery-alert")).toBeInTheDocument();
      expect(
        screen.getByText(/unable to load image preview|image preview error/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /reload image/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /upload a new room image/i })
      ).toBeInTheDocument();
    });

    it("broken image in failed analysis state displays recovery UI rather than broken photo", () => {
      const mockAnalysis: UseRoomAnalysisReturn = {
        status: "failed",
        result: null,
        error: "We could not analyze this image. Try again.",
        isAnalyzing: false,
        start: vi.fn(),
        retry: vi.fn(),
      };

      render(
        <AnalysisPanel
          projectId="proj-1234-uuid"
          projectContext={sampleContext}
          analysis={mockAnalysis}
        />
      );

      const img = screen.getByRole("img", { name: /uploaded room image/i });
      triggerImageError(img);

      expect(screen.getByTestId("image-recovery-alert")).toBeInTheDocument();
      expect(
        screen.getByText(/unable to load image preview|image preview error/i)
      ).toBeInTheDocument();
      expect(screen.getByTestId("analysis-error-alert")).toBeInTheDocument();
    });

    it("reload same URL recovery clears error alert upon successful re-load", () => {
      render(
        <AnalysisPanel
          projectId="proj-1234-uuid"
          projectContext={sampleContext}
        />
      );

      const img = screen.getByRole("img", { name: /uploaded room image/i });
      triggerImageError(img);

      expect(screen.getByTestId("image-recovery-alert")).toBeInTheDocument();

      // Click Reload image
      const reloadButton = screen.getByRole("button", { name: /reload image/i });
      fireEvent.click(reloadButton);

      // A re-keyed img element is rendered
      const reloadedImg = screen.getByRole("img", { name: /uploaded room image/i });
      triggerImageLoad(reloadedImg, 1024, 768);

      // Recovery alert must be cleared
      expect(screen.queryByTestId("image-recovery-alert")).not.toBeInTheDocument();
      expect(reloadedImg).toHaveClass("opacity-100");
    });

    it("missing-to-valid context transition maintains stable hook call order without throwing", () => {
      const { rerender } = render(
        <AnalysisPanel
          projectId="proj-1234-uuid"
          projectContext={null}
        />
      );

      expect(screen.getByText(/no active room image found/i)).toBeInTheDocument();

      // Transition to valid context
      rerender(
        <AnalysisPanel
          projectId="proj-1234-uuid"
          projectContext={sampleContext}
        />
      );

      // Hook order must not throw and valid panel must render
      expect(screen.getByRole("img", { name: /uploaded room image/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start analysis/i })).toBeInTheDocument();
    });
  });
});
