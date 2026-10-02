import React from "react";
import Link from "next/link";
import { isRenderReadyImage, ProjectContext } from "../../types/room";
import { useRoomAnalysis, UseRoomAnalysisReturn } from "./useRoomAnalysis";
import { DetectionReview } from "./DetectionReview";
import { useImageLoadState } from "./useImageLoadState";

export interface AnalysisPanelProps {
  projectId: string;
  projectContext: ProjectContext | null;
  /** Optional pre-bound analysis hook instance, primarily for testing or composition */
  analysis?: UseRoomAnalysisReturn;
  /** Optional continuation callback for downstream furniture selection */
  onContinue?: () => void;
}

export function AnalysisPanel({
  projectId,
  projectContext,
  analysis: injectedAnalysis,
  onContinue,
}: AnalysisPanelProps) {
  const internalAnalysis = useRoomAnalysis(projectId);
  const analysis = injectedAnalysis || internalAnalysis;

  const { status, result, error, isAnalyzing, start, retry } = analysis;

  // Validate context identity and render-readiness
  const isContextValid = Boolean(
    projectContext &&
    projectContext.projectId === projectId &&
    projectContext.image &&
    projectContext.image.projectId === projectId &&
    isRenderReadyImage(projectContext.image, projectContext.previewUrl)
  );

  // Safely derive image inputs for unconditional hook invocation before recovery return
  const context = isContextValid ? projectContext : null;
  const imageUrl = context ? (context.previewUrl || context.image.imageUrl || "") : "";
  const imageWidth = context?.image.width;
  const imageHeight = context?.image.height;

  const {
    status: imageStatus,
    errorMessage: imageErrorMessage,
    isLoading: imageIsLoading,
    hasError: imageHasError,
    loadKey: imageLoadKey,
    handleLoad: handleImageLoad,
    handleError: handleImageError,
    retry: retryImage,
  } = useImageLoadState({
    imageUrl,
    expectedWidth: imageWidth,
    expectedHeight: imageHeight,
  });

  // Recovery UI helper for missing, corrupt, or wrong-project context
  const renderRecovery = () => (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-yellow-900 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">
        No active room image found
      </h2>
      <p className="mt-2 text-sm text-gray-700">
        We could not find an active image for this project, or the session context has expired.
      </p>
      <div className="mt-4">
        <Link
          href="/new-room"
          className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Upload a room image to start over
        </Link>
      </div>
    </div>
  );

  // Validate context identity and render-readiness (positive dimensions & usable image/preview URL)
  if (!context) {
    return renderRecovery();
  }

  // Success view: mount DetectionReview with matching project/image identity
  if (status === "succeeded" && result) {
    // Result identity mismatch: wrong project rejection
    if (result.projectId !== projectId) {
      return renderRecovery();
    }

    // Result belongs to a previous room image in the same project
    if (result.imageId !== context.image.imageId) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-yellow-900 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-gray-900">
            Results belong to a previous room image
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            The current analysis results were generated for an older image in this project. Please analyze the current room image.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Analyze current image
            </button>
            <Link
              href="/new-room"
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Upload a new room image
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Room Analysis
          </h1>
          <p className="text-sm text-gray-500">
            Project ID: <span className="font-mono text-xs">{projectId}</span>
          </p>
        </div>

        {/* Status announcements for screen readers and visual confirmation */}
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <p className="font-semibold">Analysis complete! Results ready.</p>
          <p className="mt-1 text-xs text-green-700">
            {result.detections.length === 0
              ? "0 objects detected in this room."
              : `${result.detections.length} objects detected.`}
          </p>
        </div>

        {/* Mounted DetectionReview: interactive overlay and list, retry-only callback, truthful unavailable continuation */}
                        <DetectionReview
          imageUrl={imageUrl}
          imageWidth={context.image.width!}
          imageHeight={context.image.height!}
          detections={result.detections}
          onRetry={retry}
          onContinue={onContinue}
        />
      </div>
    );
  }

  // Default view for ready / analyzing / failed states: preserves original image and shows status & actions
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Preserved uploaded room image container */}
          <div className="relative flex-1 overflow-hidden rounded-lg bg-gray-100 min-h-[320px] flex items-center justify-center">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={imageLoadKey}
                src={imageUrl}
                alt="Uploaded room image"
                data-load-key={imageLoadKey}
                onLoad={handleImageLoad}
                onError={handleImageError}
                className={`max-h-[500px] w-full object-contain ${
                  imageHasError ? "opacity-0" : "opacity-100"
                }`}
              />
            ) : (
              <div className="text-sm text-gray-500">Image preview unavailable</div>
            )}

            {/* Image loading indicator */}
            {imageIsLoading && !imageHasError && (
              <div
                data-testid="image-loading"
                className="absolute inset-0 flex items-center justify-center bg-gray-50/60 text-gray-700 text-xs backdrop-blur-sm pointer-events-none"
              >
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mr-2" />
                Loading room image...
              </div>
            )}

            {/* Image load error recovery state */}
            {imageHasError && (
              <div
                role="alert"
                data-testid="image-recovery-alert"
                className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-50/95 text-gray-800 z-10"
              >
                <div className="h-8 w-8 text-amber-500 mb-2" aria-hidden="true">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {imageStatus === "aspect_mismatch"
                    ? "Image aspect ratio mismatch"
                    : "Unable to load image preview"}
                </p>
                <p className="text-xs text-gray-600 max-w-sm mb-4">
                  {imageErrorMessage || "The image preview may be unavailable, expired, or corrupted."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={retryImage}
                    className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    Reload image
                  </button>
                  <Link
                    href="/new-room"
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    Upload a new room image
                  </Link>
                </div>
              </div>
            )}

            {/* In-flight analyzing overlay */}
            {isAnalyzing && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm z-20"
                data-testid="analysis-spinner"
              >
                <div
                  className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium text-gray-700">
                  Scanning interior features...
                </p>
              </div>
            )}
          </div>

          {/* Analysis control & status column */}
          <div className="flex w-full flex-col justify-between md:w-80">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Room Analysis
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Project ID: <span className="font-mono text-xs">{projectId}</span>
              </p>

              {/* Status announcements for screen readers and visual indicators */}
              <div className="mt-4">
                {isAnalyzing && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 rounded-md bg-indigo-50 p-3 text-sm text-indigo-700"
                  >
                    <span
                      className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-600"
                      aria-hidden="true"
                    />
                    <span>Analyzing room interior...</span>
                  </div>
                )}

                {status === "failed" && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    data-testid="analysis-error-alert"
                    aria-label="Analysis error"
                    className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                  >
                    <p className="font-semibold">Analysis Failed</p>
                    <p className="mt-1">{error || "We could not analyze this image. Try again."}</p>
                  </div>
                )}
              </div>
            </div>


            {/* Actions: Start / Retry / Proceed */}
            <div className="mt-6 flex flex-col gap-3">
              {(status === "ready" || status === "analyzing") && (
                <button
                  type="button"
                  onClick={start}
                  disabled={isAnalyzing}
                  aria-label="Start analysis"
                  className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  {isAnalyzing ? "Analyzing..." : "Start Analysis"}
                </button>
              )}

              {status === "failed" && (
                <button
                  type="button"
                  onClick={retry}
                  disabled={isAnalyzing}
                  className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Retry analysis
                </button>
              )}

              {status === "succeeded" && (
                <div className="text-xs text-gray-500 text-center">
                  Ready for furniture detection inspection.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
