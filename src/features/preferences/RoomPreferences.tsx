"use client";

import React, { useEffect, useState } from "react";
import PreferenceForm from "./PreferenceForm";
import { getProjectSnapshot, prefersRentalFriendly } from "../../services/projects";

/** Starts Rental-Friendly Mode from the project's rental status (MVP Feature 8). */
export function RoomPreferences({ projectId }: { projectId: string }) {
  const [rental, setRental] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getProjectSnapshot(projectId, controller.signal)
      .then(project => setRental(prefersRentalFriendly(project.rentalStatus)))
      // The form still works without the default; the project request failing is not fatal here.
      .catch(() => { if (!controller.signal.aborted) setRental(false); });
    return () => controller.abort();
  }, [projectId]);
  if (rental === null) return <p role="status">Loading preferences…</p>;
  return <PreferenceForm projectId={projectId} defaultRentalFriendly={rental} continueHref={`/projects/${encodeURIComponent(projectId)}/design`} />;
}
