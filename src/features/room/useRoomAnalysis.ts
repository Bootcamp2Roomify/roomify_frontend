import { useState, useRef, useEffect, useCallback } from "react";
import { AnalysisResult } from "../../types/room";
import { getStoredAnalysis } from "../../services/api";

export type AnalysisStatus = "ready" | "analyzing" | "succeeded" | "failed";

export const FALLBACK_ERROR_MESSAGE = "We could not analyze this image. Try again.";

/**
 * Sanitizes error messages.
 * In accordance with Jira acceptance and product requirements,
 * all analysis failures strictly display the exact safe fallback:
 * "We could not analyze this image. Try again."
 * Technical status codes or internal service terminology are never surfaced in the product.
 */
export function sanitizeAnalysisError(_err?: unknown): string {
  return FALLBACK_ERROR_MESSAGE;
}

export interface UseRoomAnalysisReturn {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  error: string | null;
  isAnalyzing: boolean;
  start: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useRoomAnalysis(projectId: string, expectedImageId?: string): UseRoomAnalysisReturn {
  const [status, setStatus] = useState<AnalysisStatus>("ready");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeProjectIdRef = useRef<string>(projectId);

  // On projectId change: abort active request and reset state so prior project's
  // state/result/error cannot display on the new project
  useEffect(() => {
    activeProjectIdRef.current = projectId;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    inFlightRef.current = false;
    setStatus("ready");
    setResult(null);
    setError(null);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      inFlightRef.current = false;
    };
  }, [projectId]);

  const executeAnalysis = useCallback(async () => {
    // Immediate synchronous in-flight guard
    if (inFlightRef.current) {
      return;
    }

    if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
      return;
    }

    const requestedProject = projectId.trim();

    // Abort preceding controller if any exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = true;

    setStatus("analyzing");
    setError(null);

    try {
      const analysisResult = await getStoredAnalysis(requestedProject, expectedImageId?.trim() || undefined, controller.signal);

      // Verify controller identity and active project before state mutation
      if (
        controller.signal.aborted ||
        abortControllerRef.current !== controller ||
        activeProjectIdRef.current !== requestedProject
      ) {
        return;
      }

      setResult(analysisResult);
      setStatus("succeeded");
      setError(null);
    } catch (err: unknown) {
      // Unmount / navigation / project change abort must NOT produce a service failure banner
      if (
        controller.signal.aborted ||
        abortControllerRef.current !== controller ||
        activeProjectIdRef.current !== requestedProject ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return;
      }

      setStatus("failed");
      setResult(null);
      setError(sanitizeAnalysisError(err));
    } finally {
      // Old request finally must release inFlight ONLY if controller identity is still current (A->B->A guard)
      if (abortControllerRef.current === controller) {
        inFlightRef.current = false;
        abortControllerRef.current = null;
      }
    }
  }, [projectId, expectedImageId]);

  const start = useCallback(() => {
    return executeAnalysis();
  }, [executeAnalysis]);

  const retry = useCallback(() => {
    return executeAnalysis();
  }, [executeAnalysis]);

  useEffect(() => {
    if (!projectId || projectId.trim() === "") return;
    void executeAnalysis();
  }, [projectId, executeAnalysis]);

  return {
    status,
    result,
    error,
    isAnalyzing: status === "analyzing",
    start,
    retry,
  };
}
