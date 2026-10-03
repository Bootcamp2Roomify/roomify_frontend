import React from "react";
import {FurnitureDecision,NormalizedDetection,} from "../../types/room";

export interface DetectionListProps {
  detections: NormalizedDetection[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDecisionChange?: (
    id: string,
    decision: FurnitureDecision
  ) => void;
  savingDecisionIds?: Set<string>;
}

const DECISION_OPTIONS: {
  value: FurnitureDecision;
  label: string;
}[] = [
  { value: "KEEP", label: "Keep" },
  { value: "REPLACE", label: "Replace" },
  { value: "REMOVE", label: "Remove" },
  { value: "UNSURE", label: "Unsure" },
];

export const DetectionList: React.FC<DetectionListProps> = ({
  detections,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onDecisionChange,
  savingDecisionIds = new Set(),
}) => {
  return (
    <div
      className="flex w-full flex-col gap-3"
      role="region"
      aria-label="Detected room objects"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 pb-1">
        <h3 className="text-base font-semibold text-neutral-900">
          Detected Objects ({detections.length})
        </h3>
        <span className="text-xs text-neutral-500">
          Review each object
        </span>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {detections.map((detection) => {
          const isSelected = selectedId === detection.id;
          const isHovered = hoveredId === detection.id;
          const isSaving = savingDecisionIds.has(detection.id);
          const displayLabel = detection.label || "Object";
          const confidencePercent = `${Math.round(
            detection.confidence * 100
          )}%`;

          return (
            <li
              key={detection.id}
              className={`rounded-lg border bg-white transition ${
                isSelected
                  ? "border-blue-600 ring-1 ring-blue-500"
                  : isHovered
                  ? "border-amber-400"
                  : "border-neutral-200"
              }`}
              onMouseEnter={() => onHover(detection.id)}
              onMouseLeave={() => onHover(null)}
            >
              <button
                type="button"
                data-testid={`detection-item-${detection.id}`}
                aria-pressed={isSelected}
                aria-label={`Inspect ${displayLabel} · ${confidencePercent}`}
                className={`flex w-full items-center justify-between gap-3 rounded-t-lg px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                  isSelected
                    ? "bg-blue-50/80 text-blue-950"
                    : isHovered
                    ? "bg-amber-50/50 text-neutral-900"
                    : "text-neutral-800 hover:bg-neutral-50/60"
                }`}
                onClick={() => onSelect(detection.id)}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                      isSelected
                        ? "bg-blue-600 ring-2 ring-blue-200"
                        : isHovered
                        ? "bg-amber-400"
                        : "bg-neutral-400"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium">
                    {displayLabel} · {confidencePercent}
                  </span>
                </div>

                <span className="flex-shrink-0 text-xs text-neutral-500">
                  {isSelected ? "Selected" : "View"}
                </span>
              </button>

              <fieldset className="border-t border-neutral-200 px-3 py-3">
                <legend className="sr-only">
                  Decision for {displayLabel}
                </legend>

                <div className="grid grid-cols-4 gap-1">
                  {DECISION_OPTIONS.map((option) => {
                    const checked =
                      detection.decision === option.value;

                    return (
                      <label
                        key={option.value}
                        className={`relative flex cursor-pointer items-center justify-center rounded-md border px-1 py-2 text-xs font-medium transition ${
                          checked
                            ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`decision-${detection.id}`}
                          value={option.value}
                          checked={checked}
                          disabled={isSaving}
                          onChange={() =>
                            onDecisionChange?.(
                              detection.id,
                              option.value
                            )
                          }
                          className="sr-only peer"
                        />

                        <span className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 rounded-sm">
                          {checked ? "✓ " : ""}
                          {option.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {isSaving && (
                  <p role="status" aria-live="polite" className="mt-2 text-xs text-neutral-500">
                    Saving decision...
                  </p>)}
              </fieldset>
            </li>
          );
        })}
      </ul>
    </div>
  );
};