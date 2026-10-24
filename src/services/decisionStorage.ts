import { FurnitureDecision } from "../types/room";

const STORAGE_PREFIX = "roomify:furniture-decisions:v1";

type DecisionMap = Record<string, FurnitureDecision>;

const VALID_DECISIONS = new Set<FurnitureDecision>([
  "KEEP",
  "REPLACE",
  "REMOVE",
  "UNSURE",
]);

function getStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId.trim()}`;
}

export function loadFurnitureDecisions(projectId: string): DecisionMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(getStorageKey(projectId));
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const decisions: DecisionMap = {};

    for (const [objectId, decision] of Object.entries(parsed)) {
      if (
        typeof decision === "string" &&
        VALID_DECISIONS.has(decision as FurnitureDecision)
      ) {
        decisions[objectId] = decision as FurnitureDecision;
      }
    }

    return decisions;
  } catch {
    return {};
  }
}

export function saveFurnitureDecision(
  projectId: string,
  objectId: string,
  decision: FurnitureDecision
): void {
  if (typeof window === "undefined") return;

  try {
    const decisions = loadFurnitureDecisions(projectId);
    decisions[objectId] = decision;

    window.localStorage.setItem(
      getStorageKey(projectId),
      JSON.stringify(decisions)
    );
  } catch {
    // Decision is already persisted by the backend.
    // Local cache failure must not break the UI.
  }
}