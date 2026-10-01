import React from "react";
import Link from "next/link";
import { NormalizedDetection } from "../../types/room";
import { useImageLoadState } from "./useImageLoadState";

export interface DetectionOverlayProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections: NormalizedDetection[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  detections,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}) => {
  const {
    status,
    errorMessage,
    isLoading,
    isLoaded,
    hasError,
    loadKey,
    handleLoad,
    handleError,
    retry,
  } = useImageLoadState({
    imageUrl,
    expectedWidth: imageWidth,
    expectedHeight: imageHeight,
  });

  return (
    <div
      className="relative w-full max-w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-950 shadow-sm"
      style={{
        aspectRatio: `${imageWidth} / ${imageHeight}`,
      }}
      data-testid="detection-image-container"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={loadKey}
        src={imageUrl}
        alt={
          detections.length === 0
            ? "Room preview with no detected objects"
            : "Room preview with detected objects"
        }
        className={`block h-full w-full object-cover select-none pointer-events-none transition-opacity duration-200 ${
          hasError ? "opacity-0" : "opacity-100"
        }`}
        data-load-key={loadKey}
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* Loading placeholder */}
      {isLoading && (
        <div
          data-testid="image-loading"
          className="absolute inset-0 flex items-center justify-center bg-neutral-950/60 text-white text-xs backdrop-blur-sm pointer-events-none"
        >
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white mr-2" />
          Loading room image...
        </div>
      )}

      {/* Error & recovery overlay when image fails or aspect ratio mismatches */}
      {hasError && (
        <div
          role="alert"
          data-testid="image-error-overlay"
          className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-neutral-900/90 text-white z-20 backdrop-blur-sm"
        >
          <div className="h-8 w-8 text-amber-400 mb-2" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white mb-1">
            {status === "aspect_mismatch"
              ? "Image dimensions mismatch: aspect ratio mismatch"
              : "Unable to load room image"}
          </p>
          <p className="text-xs text-neutral-300 max-w-sm mb-4">
            {errorMessage || "The image preview may be unavailable, expired, or corrupted."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white border border-neutral-600 hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Retry image
            </button>
            <Link
              href="/new-room"
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Upload a new image
            </Link>
          </div>
        </div>
      )}

      {/* Interactive bounding boxes are ONLY rendered when image is loaded with matching dimensions */}
      {isLoaded && (
        <div className="absolute inset-0 pointer-events-none">
          {detections.map((detection) => {
            const isSelected = selectedId === detection.id;
            const isHovered = hoveredId === detection.id;
            const showBadge = isSelected || isHovered;
            const confidencePercent = `${Math.round(detection.confidence * 100)}%`;
            const displayLabel = detection.label || "Object";
            const isNearTop = detection.box.y < 0.08;

            return (
              <button
                key={detection.id}
                type="button"
                data-testid={`detection-box-${detection.id}`}
                aria-pressed={isSelected}
                aria-label={`Select ${displayLabel} (${confidencePercent})`}
                className={`absolute pointer-events-auto transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 rounded-sm ${
                  isSelected
                    ? "border-2 border-blue-600 bg-blue-600/30 ring-2 ring-blue-500 shadow-lg"
                    : isHovered
                    ? "border-2 border-amber-400 bg-amber-400/25 shadow-md"
                    : "border-2 border-white/80 bg-white/10 hover:border-amber-400 hover:bg-amber-400/20"
                }`}
                style={{
                  left: `${detection.box.x * 100}%`,
                  top: `${detection.box.y * 100}%`,
                  width: `${detection.box.width * 100}%`,
                  height: `${detection.box.height * 100}%`,
                }}
                onClick={() => onSelect(detection.id)}
                onMouseEnter={() => onHover(detection.id)}
                onMouseLeave={() => onHover(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(detection.id);
                  }
                }}
              >
                {showBadge && (
                  <span
                    data-testid={`box-badge-${detection.id}`}
                    className={`absolute left-0 z-20 whitespace-nowrap rounded bg-neutral-900/95 px-2 py-0.5 text-xs font-semibold text-white shadow-md border border-neutral-700 pointer-events-none flex items-center gap-1.5 ${
                      isNearTop ? "top-1" : "-top-7"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isSelected ? "bg-blue-400" : "bg-amber-400"
                      }`}
                    />
                    <span>
                      {displayLabel} · {confidencePercent}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
