import React, { useState, useEffect, useRef } from "react";
import { FurnitureDecision, NormalizedDetection } from "../../types/room";
import { DetectionOverlay } from "./DetectionOverlay";
import { DetectionList } from "./DetectionList";
import { updateFurnitureDecision } from "../../services/api";
import { saveFurnitureDecision } from "../../services/decisionStorage";

export interface DetectionReviewProps {
  projectId: string;
  previewOnly?: boolean;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections: NormalizedDetection[];
  onRetry: () => void;
  onContinue?: () => void;
}

function validateDetectionData(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
  detections: NormalizedDetection[]
): string | null {
  if (!imageUrl || typeof imageUrl !== "string" || imageUrl.trim() === "") {
    return "Missing or invalid image URL.";
  }

  if (
    typeof imageWidth !== "number" ||
    !Number.isFinite(imageWidth) ||
    imageWidth <= 0 ||
    typeof imageHeight !== "number" ||
    !Number.isFinite(imageHeight) ||
    imageHeight <= 0
  ) {
    return `Invalid image dimensions: ${imageWidth}x${imageHeight}. Positive finite dimensions required.`;
  }

  if (!Array.isArray(detections)) {
    return "Detections must be an array.";
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    if (!d || typeof d !== "object") {
      return `Detection at index ${i} is not a valid object.`;
    }

    if (!d.id || typeof d.id !== "string" || d.id.trim() === "") {
      return `Detection at index ${i} lacks a valid stable ID.`;
    }

    if (seenIds.has(d.id.trim())) {
      return `Duplicate detection ID found: "${d.id}". IDs must be unique.`;
    }
    seenIds.add(d.id.trim());

    if (!d.label || typeof d.label !== "string" || d.label.trim() === "") {
      return `Detection "${d.id}" has an invalid or missing label.`;
    }

    if (
      typeof d.confidence !== "number" ||
      !Number.isFinite(d.confidence) ||
      d.confidence < 0 ||
      d.confidence > 1
    ) {
      return `Detection "${d.id}" has invalid confidence ${d.confidence}. Expected 0 <= confidence <= 1.`;
    }

    if (!d.box || typeof d.box !== "object") {
      return `Detection "${d.id}" is missing bounding box geometry.`;
    }

    const { x, y, width, height } = d.box;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0
    ) {
      return `Detection "${d.id}" has non-positive or negative box geometry: x=${x}, y=${y}, w=${width}, h=${height}`;
    }

    if (x > 1 || y > 1 || width > 1 || height > 1 || x + width > 1 || y + height > 1) {
      return `Detection "${d.id}" geometry exceeds unit bounds: x=${x}, y=${y}, w=${width}, h=${height}`;
    }
  }

  return null;
}

export const DetectionReview: React.FC<DetectionReviewProps> = ({
  projectId,
  previewOnly = false,
  imageUrl,
  imageWidth,
  imageHeight,
  detections,
  onRetry,
  onContinue,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [reviewDetections, setReviewDetections] = useState<NormalizedDetection[]>(detections);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [savingDecisionIds, setSavingDecisionIds] = useState<Set<string>>(new Set());
  const savingDecisionIdsRef = useRef<Set<string>>(new Set());
  const reviewGenerationRef = useRef(0);
  const isSavingDecision = savingDecisionIds.size > 0;
  // Clear stale selection whenever image or detections change
  useEffect(() => {
    reviewGenerationRef.current += 1;
    setSelectedId(null);
    setHoveredId(null);
    setReviewDetections(detections);
    setDecisionError(null);
    savingDecisionIdsRef.current.clear();
    setSavingDecisionIds(new Set());
  }, [projectId, imageUrl, detections]);

  const validationError = validateDetectionData(
    imageUrl,
    imageWidth,
    imageHeight,
    detections
  );

  // 1. Visible result error for malformed geometry/confidence/dimensions (never false zero-detection success)
  if (validationError) {
    return (
      <div
        role="alert"
        className="w-full rounded-xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-200 p-1 text-red-700" aria-hidden="true">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-red-900">
              Invalid Detection Results
            </h3>
            <p className="mt-1 text-sm text-red-800">
              {validationError}
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                Retry Analysis
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Useful success empty state when zero detections are found
  if (detections.length === 0) {
    return (
      <div className="w-full flex flex-col gap-6">
        <DetectionOverlay
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          detections={[]}
          selectedId={null}
          hoveredId={null}
          onSelect={() => {}}
          onHover={() => {}}
        />

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center shadow-sm">
          <h3 className="text-base font-semibold text-neutral-900">
            No Objects Detected
          </h3>
          <p className="mt-1 text-sm text-neutral-600 max-w-md mx-auto">
            We analyzed your room image but did not find recognizable furniture items. You can retry with a different angle or lighting, or proceed to manual room planning.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
            >
              Retry
            </button>
            {onContinue ? (
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Continue
              </button>
            ) : (
              <span className="text-sm text-neutral-500 italic">
                Next step unavailable: furniture selection destination is not yet configured.
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Normal Review State with linked overlay and list
  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleHover = (id: string | null) => {
    setHoveredId(id);
  };

  const handleDecisionChange = async (id: string, nextDecision: FurnitureDecision) => {
    if (savingDecisionIdsRef.current.has(id)) return;

    const current = reviewDetections.find((detection) => detection.id === id);
    if (!current || current.decision === nextDecision) return;

    const previousDecision = current.decision;

    if (previewOnly) {
      setReviewDetections((previous) =>
        previous.map((detection) =>
          detection.id === id ? { ...detection, decision: nextDecision } : detection
        )
      );
      return;
    }

    const reviewGeneration = reviewGenerationRef.current;

    savingDecisionIdsRef.current.add(id);
    setSavingDecisionIds(new Set(savingDecisionIdsRef.current));
    setDecisionError(null);

    setReviewDetections((previous) =>
      previous.map((detection) =>
        detection.id === id
          ? { ...detection, decision: nextDecision }
          : detection
      )
    );

    try {
      const saved = await updateFurnitureDecision(
        projectId,
        id,
        nextDecision
      );

      if (reviewGenerationRef.current !== reviewGeneration) return;

      setReviewDetections((previous) =>
        previous.map((detection) =>
          detection.id === id
            ? { ...detection, decision: saved.decision }
            : detection
        )
      );

      saveFurnitureDecision(projectId, id, saved.decision);
    } catch {
      if (reviewGenerationRef.current !== reviewGeneration) return;
      setReviewDetections((previous) =>
        previous.map((detection) =>
          detection.id === id
            ? { ...detection, decision: previousDecision }
            : detection
        )
      );

      setDecisionError(
        "Could not save the furniture decision. Your previous choice was restored."
      );
    } finally {
      if (reviewGenerationRef.current === reviewGeneration) {
        savingDecisionIdsRef.current.delete(id);
        setSavingDecisionIds(new Set(savingDecisionIdsRef.current));
      }
    }
  };
  return (
    <div className="w-full flex flex-col gap-6" data-testid="detection-review">
      {/* Mobile: list below image. Desktop: list beside image. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 w-full flex flex-col gap-3">
          <DetectionOverlay
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            detections={reviewDetections}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={handleSelect}
            onHover={handleHover}
          />
        </div>
        <div className="lg:col-span-1 w-full bg-neutral-50/70 p-4 rounded-xl border border-neutral-200">
          <DetectionList
            detections={reviewDetections}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={handleSelect}
            onHover={handleHover}
            onDecisionChange={handleDecisionChange}
            savingDecisionIds={savingDecisionIds}
          />
        </div>
      </div>

      {decisionError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decisionError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-neutral-200">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
        >
          Retry
        </button>

        <div>
          {onContinue ? (
            <button
              type="button"
              onClick={onContinue}
              disabled={isSavingDecision}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {isSavingDecision ? "Saving..." : "Continue"}
            </button>
          ) : (
            <span className="text-sm text-neutral-500 italic">
              Next step unavailable: furniture selection destination is not yet configured.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
