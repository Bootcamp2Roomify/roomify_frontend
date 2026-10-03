import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  renderHook,
} from "@testing-library/react";
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
import {
  saveProjectContext,
  clearProjectContext,
} from "../src/features/room/projectContext";

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
    requestAnalysis: vi.fn(),
    createProject: vi.fn(),
    uploadRoomImage: vi.fn(),
  };
});

const sampleContext: ProjectContext = {
  projectId: "123",
  image: {
    projectId: "123",
    imageId: "5678",
    imageUrl: "https://example.com/room.jpg",
    width: 1024,
    height: 768,
  },
  previewUrl: "blob:http://localhost/sample-preview-blob",
};

describe("ROOM-80: Room Analysis Hook, Panel, and Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.getStoredAnalysis).mockReset();
    vi.mocked(api.createProject).mockReset();
    vi.mocked(api.uploadRoomImage).mockReset();

    // Default pending request keeps unrelated UI tests stable.
    // Individual analysis tests override this as needed.
    vi.mocked(api.getStoredAnalysis).mockImplementation(
      () => new Promise(() => {}) as any
    );

    clearProjectContext("123");
    clearProjectContext("567");
    clearProjectContext("999");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. delayed promise shows analyzing text/spinner with aria-live status", async () => {
    let resolveAnalysis: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveAnalysis = resolve;
    });

    vi.mocked(api.getStoredAnalysis).mockImplementation(
      () => pendingPromise as any
    );

    render(
      <AnalysisPanel
        projectId="123"
        projectContext={sampleContext}
      />
    );

    await waitFor(() => {
      expect(api.getStoredAnalysis).toHaveBeenCalledTimes(1);
    });

    const statusRegion = screen.getByRole("status");
    expect(statusRegion).toBeInTheDocument();
    expect(statusRegion).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByText(/analyzing room interior/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("analysis-spinner")).toBeInTheDocument();

    await act(async () => {
      resolveAnalysis({
        projectId: "123",
        imageId: "5678",
        detections: [],
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("analysis-spinner")
      ).not.toBeInTheDocument();
    });
  });

  it("2. auto-load issues exactly one stored-analysis request while pending", async () => {
    let resolveAnalysis: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveAnalysis = resolve;
    });

    vi.mocked(api.getStoredAnalysis).mockImplementation(
      () => pendingPromise as any
    );

    render(
      <AnalysisPanel
        projectId="123"
        projectContext={sampleContext}
      />
    );

    await waitFor(() => {
      expect(api.getStoredAnalysis).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("analysis-spinner")).toBeInTheDocument();
    expect(
      screen.getByText(/analyzing room interior/i)
    ).toBeInTheDocument();

    await act(async () => {
      resolveAnalysis({
        projectId: "123",
        imageId: "5678",
        detections: [
          {
            id: "det-1",
            label: "Chair",
            confidence: 0.95,
            box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
            decision: "UNSURE",
          },
        ],
      });
    });

    expect(api.getStoredAnalysis).toHaveBeenCalledTimes(1);
    expect(api.requestAnalysis).not.toHaveBeenCalled();
  });

  it("3. failed analysis shows 'We could not analyze this image. Try again.' and retains image/project", async () => {
    vi.mocked(api.getStoredAnalysis).mockRejectedValueOnce(
      new Error("Vision model internal timeout")
    );

    render(
      <AnalysisPanel
        projectId="123"
        projectContext={sampleContext}
      />
    );

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute("aria-live", "assertive");
      expect(alert).toHaveTextContent(
        "We could not analyze this image. Try again."
      );
      expect(alert).not.toHaveTextContent(
        "Vision model internal timeout"
      );
    });

    const roomImage = screen.getByRole("img", {
      name: /room image|uploaded room/i,
    });

    expect(roomImage).toBeInTheDocument();
    expect(roomImage).toHaveAttribute(
      "src",
      "blob:http://localhost/sample-preview-blob"
    );

    const retryButton = screen.getByRole("button", {
      name: /retry analysis/i,
    });

    expect(retryButton).toBeInTheDocument();
  });

  it("4. Retry succeeds with two stored-analysis calls total and no create/upload calls", async () => {
    vi.mocked(api.getStoredAnalysis)
      .mockRejectedValueOnce(new Error("Transient network failure"))
      .mockResolvedValueOnce({
        projectId: "123",
        imageId: "5678",
        detections: [
          {
            id: "det-1",
            label: "Chair",
            confidence: 0.95,
            box: {
              x: 0.1,
              y: 0.2,
              width: 0.3,
              height: 0.4,
            },
            decision: "UNSURE",
          },
        ],
      });

    render(
      <AnalysisPanel
        projectId="123"
        projectContext={sampleContext}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", {
      name: /retry analysis/i,
    });

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByText(/analysis complete/i)
      ).toBeInTheDocument();
    });

    expect(api.getStoredAnalysis).toHaveBeenCalledTimes(2);
    expect(api.createProject).not.toHaveBeenCalled();
    expect(api.uploadRoomImage).not.toHaveBeenCalled();
  });

  it("5. malformed or unsafe server message is not rendered as HTML/internal details", async () => {
    const maliciousPayload =
      "<script>alert('xss')</script><b onmouseover='alert(1)'>Crash</b> Traceback: /var/secrets/key.pem";

    vi.mocked(api.getStoredAnalysis).mockRejectedValueOnce(
      new Error(maliciousPayload)
    );

    render(
      <AnalysisPanel
        projectId="123"
        projectContext={sampleContext}
      />
    );

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(
        "We could not analyze this image. Try again."
      );
    });

    expect(document.querySelector("script")).toBeNull();
    expect(document.body.innerHTML).not.toContain(
      "<b onmouseover="
    );
    expect(document.body.innerHTML).not.toContain(
      "/var/secrets/key.pem"
    );
  });

  it("6. unmount/project change aborts or ignores an older response without service-failure banner", async () => {
    let rejectPromise: (err: any) => void = () => {};

    const abortablePromise = new Promise((_, reject) => {
      rejectPromise = reject;
    });

    vi.mocked(api.getStoredAnalysis).mockImplementation(
      (_projectId, _expectedImageId, signal) => {
        if (signal) {
          signal.addEventListener("abort", () => {
            const abortError = new Error(
              "This operation was aborted"
            );
            abortError.name = "AbortError";
            rejectPromise(abortError);
          });
        }

        return abortablePromise as any;
      }
    );

    const { unmount } = render(
      <AnalysisPanel
        projectId="123"
        projectContext={sampleContext}
      />
    );

    await waitFor(() => {
      expect(api.getStoredAnalysis).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("7. absent/corrupt/wrong-project context shows recovery to /new-room", () => {
    // 7a. Absent context
    const { rerender } = render(
      <AnalysisPanel
        projectId="123"
        projectContext={null}
      />
    );

    expect(
      screen.getByText(/no active room image found/i)
    ).toBeInTheDocument();

    const recoveryLink = screen.getByRole("link", {
      name: /upload a room image to start over/i,
    });

    expect(recoveryLink).toBeInTheDocument();
    expect(recoveryLink).toHaveAttribute("href", "/new-room");

    // 7b. Wrong-project context
    const wrongContext: ProjectContext = {
      projectId: "999",
      image: {
        projectId: "999",
        imageId: "9999",
        imageUrl: "https://example.com/other.jpg",
      },
    };

    rerender(
      <AnalysisPanel
        projectId="123"
        projectContext={wrongContext}
      />
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByText(/no active room image found/i)
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: /upload a room image to start over/i,
      })
    ).toHaveAttribute("href", "/new-room");
  });

  it("8. empty detections is successful analysis, not an error", async () => {
    // Nothing stored before or after the backend analysis run.
    vi.mocked(api.getStoredAnalysis).mockResolvedValue({
      projectId: "123",
      imageId: "5678",
      detections: [],
    });

    render(
      <AnalysisPanel
        projectId="123"
        projectContext={sampleContext}
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByText(/analysis complete/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/0 objects detected/i)
      ).toBeInTheDocument();
    });

    expect(api.requestAnalysis).toHaveBeenCalledTimes(1);
  });

  it("9. AnalyzePage route integration renders matching context and recovery on missing context", async () => {
    // Case A: Missing context in storage
    const paramsPromiseA = Promise.resolve({ id: "123" });
    let unmountA: (() => void) | undefined;

    await act(async () => {
      const rendered = render(
        <AnalyzePage params={paramsPromiseA} />
      );

      unmountA = rendered.unmount;
      await paramsPromiseA;
    });

    await waitFor(() => {
      expect(
        screen.getByText(/no active room image found/i)
      ).toBeInTheDocument();
    });

    await act(async () => {
      unmountA?.();
    });

    // Case B: Seeded matching context in storage
    saveProjectContext(sampleContext);

    vi.mocked(api.getStoredAnalysis).mockResolvedValue({
      projectId: "123",
      imageId: "5678",
      detections: [],
    });

    const paramsPromiseB = Promise.resolve({ id: "123" });
    let unmountB: (() => void) | undefined;

    await act(async () => {
      const rendered = render(
        <AnalyzePage params={paramsPromiseB} />
      );

      unmountB = rendered.unmount;
      await paramsPromiseB;
    });

    await waitFor(() => {
      expect(
        screen.getByText(/analysis complete/i)
      ).toBeInTheDocument();

      expect(
        screen.getByRole("img", { name: /room preview/i })
      ).toHaveAttribute("src", sampleContext.previewUrl);
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
          new Error(
            "Vision service unavailable (503). Analysis could not be completed; please retry."
          )
        )
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(
        sanitizeAnalysisError(
          new Error(
            "Invalid project state or missing active image for analysis (409 Conflict)."
          )
        )
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(
        sanitizeAnalysisError(
          new Error("Vision model internal timeout")
        )
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(
        sanitizeAnalysisError(
          new Error("Database connection pool exhausted")
        )
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(
        sanitizeAnalysisError(
          new Error("500 Internal Server Error")
        )
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(
        sanitizeAnalysisError(new Error("Unknown error"))
      ).toBe(FALLBACK_ERROR_MESSAGE);

      expect(sanitizeAnalysisError(null)).toBe(
        FALLBACK_ERROR_MESSAGE
      );
    });

    it("projectId change resets state and prevents stale promises across project switches (A -> B -> A)", async () => {
      let resolveA1: (val: any) => void = () => {};
      let resolveA2: (val: any) => void = () => {};
      let projectACalls = 0;

      const promiseA1 = new Promise((resolve) => {
        resolveA1 = resolve;
      });

      const promiseA2 = new Promise((resolve) => {
        resolveA2 = resolve;
      });

      vi.mocked(api.getStoredAnalysis).mockImplementation(
        (projectId) => {
          if (projectId === "123") {
            projectACalls += 1;
            return (
              projectACalls === 1
                ? promiseA1
                : promiseA2
            ) as any;
          }

          return Promise.resolve({
            projectId: "567",
            imageId: "9999",
            detections: [],
          }) as any;
        }
      );

      const { result, rerender } = renderHook(
        ({ id }) => useRoomAnalysis(id),
        {
          initialProps: {
            id: "123",
          },
        }
      );

      // 1. Project A auto-load begins
      await waitFor(() => {
        expect(result.current.status).toBe("analyzing");
        expect(result.current.isAnalyzing).toBe(true);
      });

      // 2. Switch to project B while project A is in flight
      rerender({ id: "567" });

      await waitFor(() => {
        expect(result.current.status).toBe("succeeded");
        expect(result.current.result?.projectId).toBe("567");
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isAnalyzing).toBe(false);

      // 3. Resolve stale project A request
      await act(async () => {
        resolveA1({
          projectId: "123",
          imageId: "5678",
          detections: [
            {
              id: "det-stale",
              label: "Stale Bed",
              confidence: 0.99,
              box: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.5,
              },
              decision: "UNSURE",
            },
          ],
        });
      });

      // Project B result must remain active
      expect(result.current.status).toBe("succeeded");
      expect(result.current.result?.projectId).toBe("567");
      expect(
        result.current.result?.detections
      ).toHaveLength(0);

      // 4. Switch back to project A
      rerender({ id: "123" });

      await waitFor(() => {
        expect(result.current.status).toBe("analyzing");
      });

      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();

      // Resolve the new A request to cleanly finish the test
      await act(async () => {
        resolveA2({
          projectId: "123",
          imageId: "5678",
          detections: [],
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe("succeeded");
        expect(result.current.result?.projectId).toBe("123");
      });
    });
  });

  describe(
    "Finding 5 Regressions: Image Load & Recovery in AnalysisPanel",
    () => {
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

      function triggerImageLoad(
        img: HTMLElement,
        width = 1024,
        height = 768
      ) {
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
            projectId="123"
            projectContext={sampleContext}
          />
        );

        const img = screen.getByRole("img", {
          name: /uploaded room image/i,
        });

        triggerImageError(img);

        expect(
          screen.getByTestId("image-recovery-alert")
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            /unable to load image preview|image preview error/i
          )
        ).toBeInTheDocument();

        expect(
          screen.getByRole("button", {
            name: /reload image/i,
          })
        ).toBeInTheDocument();

        expect(
          screen.getByRole("link", {
            name: /upload a new room image/i,
          })
        ).toBeInTheDocument();
      });

      it("broken image in failed analysis state displays recovery UI rather than broken photo", () => {
        const mockAnalysis: UseRoomAnalysisReturn = {
          status: "failed",
          result: null,
          error:
            "We could not analyze this image. Try again.",
          isAnalyzing: false,
          start: vi.fn(),
          retry: vi.fn(),
        };

        render(
          <AnalysisPanel
            projectId="123"
            projectContext={sampleContext}
            analysis={mockAnalysis}
          />
        );

        const img = screen.getByRole("img", {
          name: /uploaded room image/i,
        });

        triggerImageError(img);

        expect(
          screen.getByTestId("image-recovery-alert")
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            /unable to load image preview|image preview error/i
          )
        ).toBeInTheDocument();

        expect(
          screen.getByTestId("analysis-error-alert")
        ).toBeInTheDocument();
      });

      it("reload same URL recovery clears error alert upon successful re-load", () => {
        render(
          <AnalysisPanel
            projectId="123"
            projectContext={sampleContext}
          />
        );

        const img = screen.getByRole("img", {
          name: /uploaded room image/i,
        });

        triggerImageError(img);

        expect(
          screen.getByTestId("image-recovery-alert")
        ).toBeInTheDocument();

        const reloadButton = screen.getByRole("button", {
          name: /reload image/i,
        });

        fireEvent.click(reloadButton);

        const reloadedImg = screen.getByRole("img", {
          name: /uploaded room image/i,
        });

        triggerImageLoad(reloadedImg, 1024, 768);

        expect(
          screen.queryByTestId("image-recovery-alert")
        ).not.toBeInTheDocument();

        expect(reloadedImg).toHaveClass("opacity-100");
      });

      it("missing-to-valid context transition maintains stable hook call order without throwing", async () => {
        const { rerender } = render(
          <AnalysisPanel
            projectId="123"
            projectContext={null}
          />
        );

        expect(
          screen.getByText(/no active room image found/i)
        ).toBeInTheDocument();

        rerender(
          <AnalysisPanel
            projectId="123"
            projectContext={sampleContext}
          />
        );

        expect(
          screen.getByRole("img", {
            name: /uploaded room image/i,
          })
        ).toBeInTheDocument();

        await waitFor(() => {
          expect(
            screen.getByTestId("analysis-spinner")
          ).toBeInTheDocument();
        });
      });
    }
  );
});