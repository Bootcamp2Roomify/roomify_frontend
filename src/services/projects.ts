import { ApiError, isValidUuid } from "./api";
import { redirectToLogin } from "./session";
import { ProjectPage, ProjectSummary, ProjectDetails, RentalStatus, RoomType } from "../types/room";

export interface ProjectSnapshot extends ProjectDetails {
  id: string;
  status: string;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) redirectToLogin();
    const details = await response.json().catch(() => null);
    throw new ApiError(details?.message || fallback, response.status, details);
  }
  return (await response.json()) as T;
}

export async function listProjects(page = 1, signal?: AbortSignal): Promise<ProjectPage> {
  const response = await fetch(`/api/projects?page=${page}&pageSize=12`, { cache: "no-store", signal });
  const data = await readJson<ProjectPage>(response, "Could not load your rooms. Please retry.");
  if (!Array.isArray(data?.projects)) throw new ApiError("The server returned an invalid project list.", 502);
  return data;
}

export async function getProjectSnapshot(projectId: string, signal?: AbortSignal): Promise<ProjectSnapshot> {
  if (!isValidUuid(projectId)) throw new ApiError("Project ID must be a valid UUID.", 400);
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store", signal });
  return readJson<ProjectSnapshot>(response, "Could not load this room. Please retry.");
}

const NEXT_STEP: Record<string, { label: string; path: string }> = {
  CREATED: { label: "Add a photo", path: "upload" },
  IMAGE_UPLOADED: { label: "Analyze photo", path: "analyze" },
  ANALYSIS_FAILED: { label: "Review furniture", path: "analyze" },
  ANALYZED: { label: "Review furniture", path: "analyze" },
  PREFERENCES_READY: { label: "Generate redesign", path: "design" },
  DESIGN_READY: { label: "Open redesign", path: "design" },
};

/** Where a saved project resumes from the dashboard. */
export function nextStep(project: Pick<ProjectSummary, "id" | "status">): { label: string; href: string } {
  const step = NEXT_STEP[project.status] ?? NEXT_STEP.ANALYZED;
  return { label: step.label, href: `/projects/${encodeURIComponent(project.id)}/${step.path}` };
}

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  BEDROOM: "Bedroom", LIVING_ROOM: "Living room", STUDY: "Study", DORM_ROOM: "Dorm room", STUDIO: "Studio", OTHER: "Other",
};

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  RENTAL: "Rented apartment or house", DORMITORY: "Dormitory", OWNED: "I own it / permanent changes are fine",
};

/** Renters and dorm residents start in Rental-Friendly Mode (MVP Feature 8). */
export function prefersRentalFriendly(status: RentalStatus | undefined): boolean {
  return status === "RENTAL" || status === "DORMITORY";
}
