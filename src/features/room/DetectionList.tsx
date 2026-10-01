import React from "react";
import { NormalizedDetection } from "../../types/room";

export interface DetectionListProps {
  detections: NormalizedDetection[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export const DetectionList: React.FC<DetectionListProps> = ({
  detections,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}) => {
  return (
    <div
      className="flex flex-col gap-3 w-full"
      role="region"
      aria-label="Detected room objects"
    >
      <div className="flex items-center justify-between pb-1 border-b border-neutral-200">
        <h3 className="text-base font-semibold text-neutral-900">
          Detected Objects ({detections.length})
        </h3>
        <span className="text-xs text-neutral-500">
          Click or press to inspect
        </span>
      </div>

      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {detections.map((detection) => {
          const isSelected = selectedId === detection.id;
          const isHovered = hoveredId === detection.id;
          const displayLabel = detection.label || "Object";
          const confidencePercent = `${Math.round(detection.confidence * 100)}%`;

          return (
            <li key={detection.id}>
              <button
                type="button"
                data-testid={`detection-item-${detection.id}`}
                aria-pressed={isSelected}
                aria-label={`${displayLabel} · ${confidencePercent}`}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/80 text-blue-950 font-medium shadow-sm ring-1 ring-blue-500"
                    : isHovered
                    ? "border-amber-400 bg-amber-50/50 text-neutral-900"
                    : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/60 text-neutral-800"
                }`}
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
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
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

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isSelected ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                      Selected
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">View</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
