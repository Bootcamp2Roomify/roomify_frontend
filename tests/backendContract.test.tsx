import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisPanel } from "../src/features/room/AnalysisPanel";
import { useRoomAnalysis, UseRoomAnalysisReturn } from "../src/features/room/useRoomAnalysis";
import { getActiveRoomImage, getStoredAnalysis, uploadRoomImage } from "../src/services/api";
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

  it.each([false, true])("restores database KEEP with stale cache present: %s", async staleCache => {
    if (staleCache) window.localStorage.setItem(`roomify:furniture-decisions:v1:${projectId}`, JSON.stringify({ [objectId]: "REMOVE" }));
    const data = stored("Saved chair", 101);
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...data, objects: [{ ...data.objects[0], decision: "KEEP" }] })));
    expect((await getStoredAnalysis(projectId, "101")).detections[0].decision).toBe("KEEP");
  });

  it.each(["INVALID", "", "keep", null, 5, {}, []])("rejects malformed supplied stored decision %j", async decision => {
    const data = stored("Chair", 101);
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...data, objects: [{ ...data.objects[0], decision }] })));
    await expect(getStoredAnalysis(projectId, "101")).rejects.toMatchObject({ code: "INVALID_FURNITURE_DECISION" });
  });

  it("uses UNSURE for an older backend that omits decision, even with a stale cache", async () => {
    window.localStorage.setItem(`roomify:furniture-decisions:v1:${projectId}`, JSON.stringify({ [objectId]: "REMOVE" }));
    vi.stubGlobal("fetch", vi.fn(async () => response(stored("Chair", 101))));
    expect((await getStoredAnalysis(projectId, "101")).detections[0].decision).toBe("UNSURE");
  });

  it("reopens persisted KEEP and sends a real UNSURE update without writing the obsolete cache", async () => {
    const cacheKey = `roomify:furniture-decisions:v1:${projectId}`;
    window.localStorage.setItem(cacheKey, JSON.stringify({ [objectId]: "REMOVE" }));
    let patchBody: unknown;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return response({ status: "ANALYZED" });
      if (init?.method === "PATCH") {
        patchBody = JSON.parse(String(init.body));
        return response({ objectId, decision: "UNSURE" });
      }
      const data = stored("Chair", 101);
      return response({ ...data, objects: [{ ...data.objects[0], decision: "KEEP" }] });
    }));
    render(<AnalysisPanel projectId={projectId} projectContext={context} onContinue={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /keep/i })).toBeChecked());
    fireEvent.click(screen.getByRole("radio", { name: /unsure/i }));
    await waitFor(() => expect(patchBody).toEqual({ decision: "UNSURE" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    expect(screen.getByRole("radio", { name: /unsure/i })).toBeChecked();
    expect(window.localStorage.getItem(cacheKey)).toBe(JSON.stringify({ [objectId]: "REMOVE" }));
  });

  it("analyzes the replacement photo after advanced-state reset, even when its image ID is reused", async () => {
    let phase: "old" | "replacement" | "new" = "old";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(`${init?.method || "GET"} ${_url}`);
      if (init?.method === "POST") {
        if (phase === "replacement") phase = "new";
        return response({ projectId, status: "ANALYZED", objects: [] });
      }
      return response(stored(phase === "old" ? "Old sofa" : "New chair", 101));
    }));
    const { unmount } = render(<AnalysisPanel projectId={projectId} projectContext={context} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /old sofa · 83%/i })).toBeInTheDocument());
    unmount();
    phase = "replacement";
    calls.length = 0;
    render(<AnalysisPanel projectId={projectId} projectContext={context} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /new chair · 83%/i })).toBeInTheDocument());
    expect(screen.queryByText(/old sofa/i)).not.toBeInTheDocument();
    expect(calls).toEqual([`POST /api/projects/${projectId}/analysis`, `GET /api/projects/${projectId}/analysis`]);
  });

  it("starts one request under React StrictMode effect replay", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
      ? response({ projectId, status: "ANALYZED", objects: [] })
      : response(stored("Chair", 101)));
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useRoomAnalysis(projectId, "101"), {
      wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
    });
    await waitFor(() => expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "GET" || !init?.method)).toHaveLength(1));
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
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

  it.each(["PREFERENCES_READY", "DESIGN_READY"])("loads saved detections when analysis is locked in %s", async status => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method || "GET"} ${url}`);
      if (init?.method === "POST") return response({ code: "INVALID_STATE_TRANSITION", message: "Project must have an uploaded image before analysis." }, 409);
      if (url === `/api/projects/${projectId}`) return response({ id: projectId, status });
      return response(stored("Saved chair", 101));
    }));
    render(<AnalysisPanel projectId={projectId} projectContext={context} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /saved chair · 83%/i })).toBeInTheDocument());
    expect(calls).toEqual([`POST /api/projects/${projectId}/analysis`, `GET /api/projects/${projectId}`, `GET /api/projects/${projectId}/analysis`]);
  });

  it("does not treat an arbitrary analysis conflict as a saved result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method || "GET"} ${url}`);
      return response({ code: "ACTIVE_IMAGE_MISSING" }, 409);
    }));
    render(<AnalysisPanel projectId={projectId} projectContext={context} />);
    await waitFor(() => expect(screen.getByTestId("analysis-error-alert")).toBeInTheDocument());
    expect(calls).toEqual([`POST /api/projects/${projectId}/analysis`]);
  });

  it("never calls backend for an injected local preview", async () => {
    const fetchSpy = vi.fn(async (_url: string) => response({ projectId, objects: [] })); vi.stubGlobal("fetch", fetchSpy);
    const preview: UseRoomAnalysisReturn = { status: "ready", result: null, error: null, isAnalyzing: false, start: async () => {}, retry: async () => {} };
    render(<AnalysisPanel projectId={projectId} projectContext={context} analysis={preview} />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the approved analysis preview offline without an injected result", async () => {
    const fetchSpy = vi.fn(async () => response({ projectId, objects: [] })); vi.stubGlobal("fetch", fetchSpy);
    render(<AnalysisPanel projectId={projectId} projectContext={context} previewOnly />);
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
  it("uses the same-origin image-content endpoint after restoring backend metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ imageId: 101, projectId, contentType: "image/png", width: 800, height: 600, imageUrl: `http://backend:8080/api/projects/${projectId}/image/content` })));
    expect(await getActiveRoomImage(projectId)).toMatchObject({ imageId: "101", projectId, imageUrl: `/api/projects/${projectId}/image/content`, width: 800, height: 600 });
  });
  it.each([undefined, null, 0, -1, 1.2, "0", "-1", "undefined", "abc"])("rejects an invalid active image ID %s", async imageId => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ imageId, projectId, imageUrl: `/api/projects/${projectId}/image/content`, width: 800, height: 600 })));
    await expect(getActiveRoomImage(projectId)).rejects.toThrow(/Malformed room image response/);
  });

  it("keeps an uploaded image URL on the same origin after the preview expires", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ imageId: 101, projectId, width: 800, height: 600, imageUrl: `http://backend:8080/api/projects/${projectId}/image/content` })));
    const file = new File([new Uint8Array([137, 80, 78, 71])], "room.png", { type: "image/png" });
    expect(await uploadRoomImage(projectId, file)).toMatchObject({ imageUrl: `/api/projects/${projectId}/image/content` });
  });

});
