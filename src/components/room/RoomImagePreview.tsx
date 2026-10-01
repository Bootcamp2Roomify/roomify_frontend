"use client";

import React from "react";
import { ImageDimensions } from "../../utils/fileValidation";

export interface RoomImagePreviewProps {
  previewUrl: string;
  file: File;
  dimensions?: ImageDimensions | null;
  onReplace: () => void;
  disabled?: boolean;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const RoomImagePreview: React.FC<RoomImagePreviewProps> = ({
  previewUrl,
  file,
  dimensions,
  onReplace,
  disabled = false,
}) => {
  return (
    <div
      data-testid="room-image-preview"
      className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Selected room preview"
          className="h-full w-full object-contain"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-gray-900"
            title={file.name}
          >
            {file.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{formatFileSize(file.size)}</span>
            {dimensions && (
              <>
                <span>•</span>
                <span>
                  {dimensions.width} × {dimensions.height} px
                </span>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onReplace}
          disabled={disabled}
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Replace selected image"
        >
          Replace Image
        </button>
      </div>
    </div>
  );
};
