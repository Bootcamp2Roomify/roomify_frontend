"use client";

import React, { useState } from "react";
import { RoomUpload } from "../../components/room/RoomUpload";
import { ProjectDetails } from "../../types/room";
import { ProjectDetailsForm } from "./ProjectDetailsForm";

/** Create Project (details) then upload; the project is created together with the first upload. */
export function NewRoomFlow() {
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  if (!details) return <ProjectDetailsForm onSubmit={setDetails} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        <span className="font-semibold text-gray-900">{details.name}</span>{" · "}
        <button type="button" className="text-blue-600 underline" onClick={() => setDetails(null)}>Edit details</button>
      </p>
      <RoomUpload details={details} />
    </div>
  );
}
