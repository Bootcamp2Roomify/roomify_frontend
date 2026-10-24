import { ApiError, isValidUuid } from "./api";
import { redirectToLogin } from "./session";
import { DiyGuide, GeneratedAsset, RecommendationSet, StoredDesign } from "../types/design";

/** Messages for the stable error codes the backend returns; raw server text is never shown. */
const MESSAGES: Record<string, string> = {
  AI_PROVIDER_UNAVAILABLE: "The AI service is busy or timed out. Please try again in a moment.",
  AI_CONFIGURATION_ERROR: "AI generation is not configured on this server yet.",
  INVALID_DESIGN_PLAN: "The AI's plan broke one of your rules (budget, decisions or rental limits), so it was discarded. Please try again.",
  DESIGN_INPUT_CHANGED: "Your furniture or preferences changed while the plan was being made. Please try again.",
  DESIGN_GENERATION_FAILED: "The redesign could not be generated. Please try again.",
  PROTOTYPE_GENERATION_FAILED: "The image service could not render this room. Please try again.",
  ORIGINAL_IMAGE_UNAVAILABLE: "Your original room photo could not be loaded. Try uploading it again.",
  GENERATED_IMAGE_STORAGE_FAILED: "The image was generated but could not be saved. Please try again.",
  INVALID_RECOMMENDATIONS: "The suggestions did not fit your budget or rules, so they were discarded. Please try again.",
  INVALID_DIY_GUIDE: "We could not produce a safe beginner guide for this item.",
  PROJECT_NOT_FOUND: "This room could not be found.",
};

export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const code = (error.details as { code?: string } | undefined)?.code;
    if (code && MESSAGES[code]) return MESSAGES[code];
    if (error.status === 409) return (error.details as { message?: string } | undefined)?.message || fallback;
    if (error.status === 0 || error.status === 502) return "Room service unavailable. Check your connection and try again.";
  }
  return fallback;
}

function base(projectId: string): string {
  if (!isValidUuid(projectId)) throw new ApiError("Project ID must be a valid UUID.", 400);
  return `/api/projects/${encodeURIComponent(projectId)}`;
}

async function call<T>(url: string, init: RequestInit, fallback: string, emptyStatuses: number[] = []): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init, headers: { accept: "application/json" } });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(fallback, 0);
  }
  if (emptyStatuses.includes(response.status)) return null;
  if (!response.ok) {
    if (response.status === 401) redirectToLogin();
    const details = await response.json().catch(() => null);
    throw new ApiError(fallback, response.status, details);
  }
  return (await response.json()) as T;
}

export const getLatestDesign = (projectId: string, signal?: AbortSignal) =>
  call<StoredDesign>(`${base(projectId)}/designs/latest`, { signal }, "Could not load your redesign.", [204]);

export const generateDesign = async (projectId: string) =>
  (await call<StoredDesign>(`${base(projectId)}/designs`, { method: "POST" }, "The redesign could not be generated."))!;

export const generatePrototype = async (projectId: string, designId: number) =>
  (await call<GeneratedAsset>(`${base(projectId)}/designs/${designId}/prototype`, { method: "POST" },
    "The visual prototype could not be generated."))!;

export const prototypeImageUrl = (projectId: string, designId: number) =>
  `${base(projectId)}/designs/${designId}/image/content`;

// Saved results that do not exist yet come back as 404.
export const getRecommendations = (projectId: string, signal?: AbortSignal) =>
  call<RecommendationSet>(`${base(projectId)}/recommendations`, { signal }, "Could not load suggestions.", [404]);

export const generateRecommendations = async (projectId: string) =>
  (await call<RecommendationSet>(`${base(projectId)}/recommendations`, { method: "POST" }, "Suggestions could not be generated."))!;

export const getDiyGuide = (projectId: string, itemId: string, signal?: AbortSignal) =>
  call<DiyGuide>(`${base(projectId)}/recommendations/${encodeURIComponent(itemId)}/diy`, { signal }, "Could not load the DIY guide.", [404]);

export const generateDiyGuide = async (projectId: string, itemId: string) =>
  (await call<DiyGuide>(`${base(projectId)}/recommendations/${encodeURIComponent(itemId)}/diy`, { method: "POST" },
    "The DIY guide could not be generated."))!;

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currency === "TWD" ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
