import { ApiError, isValidUuid } from "./api";
import { Preferences, SavedPreferences, STYLES, PURPOSES } from "../features/preferences/schema";

function endpoint(projectId: string): string {
  if (!isValidUuid(projectId)) throw new ApiError("Project ID must be a valid UUID.", 400);
  return `${process.env.NEXT_PUBLIC_API_URL || ""}/api/projects/${encodeURIComponent(projectId)}/preferences`;
}
async function check(response: Response) {
  if (response.ok) return;
  let details: { message?: string } = {};
  try { details = await response.json(); } catch { /* Use the fallback for non-JSON errors. */ }
  throw new ApiError(details.message || "Could not save or load preferences. Please retry.", response.status, details);
}
function validateSaved(value: SavedPreferences, projectId: string): SavedPreferences {
  if (!value || value.projectId !== projectId || !STYLES.includes(value.style as typeof STYLES[number]) ||
      !PURPOSES.includes(value.roomPurpose as typeof PURPOSES[number]) ||
      !["TWD", "USD"].includes(value.currency) || typeof value.budgetAmount !== "number" ||
      !Number.isFinite(value.budgetAmount) || value.budgetAmount <= 0 ||
      !Array.isArray(value.preferredColors) || value.preferredColors.some(c => typeof c !== "string") ||
      typeof value.rentalFriendly !== "boolean" || typeof value.specialRequirements !== "string" ||
      !Number.isFinite(value.maxBudgetAmount) || value.maxBudgetAmount <= 0) {
    throw new ApiError("The server returned invalid preferences.", 502);
  }
  return value;
}
export async function getPreferences(projectId: string, signal?: AbortSignal): Promise<SavedPreferences | null> {
  const response = await fetch(endpoint(projectId), { signal, cache: "no-store" });
  await check(response);
  return response.status === 204 ? null : validateSaved(await response.json(), projectId);
}
export async function getPreferenceLimit(projectId: string, signal?: AbortSignal): Promise<number> {
  const response = await fetch(`${endpoint(projectId)}/limits`, { signal, cache: "no-store" });
  await check(response);
  const value = (await response.json()).maxBudgetAmount;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new ApiError("The budget limit could not be loaded.", 502);
  return value;
}
export async function savePreferences(projectId: string, data: Preferences, signal?: AbortSignal): Promise<SavedPreferences> {
  const response = await fetch(endpoint(projectId), {
    method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  await check(response);
  return validateSaved(await response.json(), projectId);
}
