import React from "react";

/** MVP Feature 6 visual concept, shown next to the original photo (before/after). */
export function PrototypeView({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        <figure className="overflow-hidden rounded-xl border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image */}
          <img src={beforeUrl} alt="Your room today" className="aspect-[4/3] w-full object-cover" />
          <figcaption className="px-3 py-2 text-sm text-gray-600">Before</figcaption>
        </figure>
        <figure className="overflow-hidden rounded-xl border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image */}
          <img src={afterUrl} alt="AI-generated redesign concept of your room" className="aspect-[4/3] w-full object-cover" />
          <figcaption className="px-3 py-2 text-sm text-gray-600">Concept</figcaption>
        </figure>
      </div>
      <p className="text-xs text-gray-500">
        Generated concept, not a photo of a finished room. The AI may change proportions, colors, windows, doors or lighting,
        and kept furniture may not look exactly like yours.
      </p>
    </div>
  );
}
