import React from "react";

/** Shown on any result the backend served from its demo library (source "demo") rather than a live AI model. */
export function DemoNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="note" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
      <span className="mr-2 rounded bg-sky-600 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">Demo</span>
      {children}
    </p>
  );
}
