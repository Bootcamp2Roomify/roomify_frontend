"use client";

import React, { useState } from "react";
import { ProjectDetails, RENTAL_STATUSES, RentalStatus, ROOM_TYPES, RoomType } from "../../types/room";
import { RENTAL_STATUS_LABELS, ROOM_TYPE_LABELS } from "../../services/projects";

export function ProjectDetailsForm({ onSubmit }: { onSubmit: (details: ProjectDetails) => void }) {
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("BEDROOM");
  const [rentalStatus, setRentalStatus] = useState<RentalStatus>("RENTAL");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("Give your room a name."); return; }
    if (trimmed.length > 100) { setError("Use at most 100 characters."); return; }
    onSubmit({ name: trimmed, roomType, rentalStatus });
  }

  const input = "mt-1 block w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";
  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-xl space-y-5 text-left" aria-labelledby="project-details-title">
      <h2 id="project-details-title" className="text-2xl font-semibold text-gray-900">Create a room project</h2>
      <label className="block text-sm font-medium text-gray-700">Project name
        <input className={input} value={name} onChange={e => { setName(e.target.value); setError(null); }}
          placeholder="e.g. My dorm room" maxLength={100} aria-invalid={!!error} aria-describedby={error ? "project-name-error" : undefined} />
      </label>
      {error && <p id="project-name-error" role="alert" className="text-sm text-red-700">{error}</p>}
      <label className="block text-sm font-medium text-gray-700">Room type
        <select className={input} value={roomType} onChange={e => setRoomType(e.target.value as RoomType)}>
          {ROOM_TYPES.map(type => <option key={type} value={type}>{ROOM_TYPE_LABELS[type]}</option>)}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Where do you live?</legend>
        <div className="mt-2 space-y-2">
          {RENTAL_STATUSES.map(status => (
            <label key={status} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm">
              <input type="radio" name="rentalStatus" value={status} checked={rentalStatus === status} onChange={() => setRentalStatus(status)} className="h-4 w-4" />
              {RENTAL_STATUS_LABELS[status]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-600">Renters and dorm residents get removable, damage-free suggestions by default.</p>
      </fieldset>
      <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        Continue to photo upload
      </button>
    </form>
  );
}
