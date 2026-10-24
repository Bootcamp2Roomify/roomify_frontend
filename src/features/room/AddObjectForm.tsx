import React, { useState } from "react";
import { FurnitureDecision } from "../../types/room";

/** MVP Feature 4: manually add an item that detection missed. */
export function AddObjectForm({ onAdd, disabled }: { onAdd: (label: string, decision: FurnitureDecision) => void; disabled?: boolean }) {
  const [label, setLabel] = useState("");
  const [decision, setDecision] = useState<FurnitureDecision>("KEEP");
  const trimmed = label.trim();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || trimmed.length > 100) return;
    onAdd(trimmed, decision);
    setLabel("");
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 bg-white p-3" aria-label="Add a missed item">
      <p className="text-sm font-medium text-neutral-900">Missing something?</p>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="add-object-label">Item name</label>
        <input id="add-object-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={100}
          placeholder="e.g. bookshelf" className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        <label className="sr-only" htmlFor="add-object-decision">Decision for the new item</label>
        <select id="add-object-decision" value={decision} onChange={event => setDecision(event.target.value as FurnitureDecision)}
          className="rounded-md border border-neutral-300 px-2 py-2 text-sm">
          <option value="KEEP">Keep</option><option value="REPLACE">Replace</option>
          <option value="REMOVE">Remove</option><option value="UNSURE">Unsure</option>
        </select>
        <button type="submit" disabled={disabled || !trimmed} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add item</button>
      </div>
    </form>
  );
}
