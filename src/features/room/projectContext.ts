/**
 * Project Context Lifecycle and Storage Manager
 *
 * Lifecycle Rules:
 * 1. URL Ownership: Saving a temporary preview URL (created via URL.createObjectURL)
 *    transfers ownership of that URL to this module.
 * 2. Revocation: URLs are revoked ONLY when:
 *    a) A new preview URL replaces an existing one for the same project in saveProjectContext.
 *    b) A context update without a previewUrl replaces an existing preview (replacement without preview).
 *    c) clearProjectContext(projectId) is explicitly called.
 *    Component unmount (e.g. RoomUpload unmounting) or route navigation MUST NOT revoke the preview URL.
 * 3. Validation: Nested image projectId and imageId are validated before any ownership transfer
 *    or revocation occurs. Invalid save identity throws immediately without state mutation.
 * 4. Persistence: Only project ID and image metadata (imageId, dimensions, imageUrl) are persisted.
 *    Temporary blob preview URLs are kept IN MEMORY ONLY and are never serialized to storage.
 *    Image binary bytes, base64 strings, or credentials MUST NEVER be persisted.
 * 5. Memory Precedence: Memory metadata is always updated on save. If a storage write fails
 *    (e.g., QuotaExceededError or private browsing), memory metadata is preferred on load so
 *    stale storage cannot pair an outdated image with a newly updated preview URL.
 */

import { ProjectContext, RoomImage } from "../../types/room";

// In-memory registry for temporary preview URLs (projectId -> previewUrl)
const previewUrlRegistry = new Map<string, string>();

// In-memory metadata store
const memoryContextFallback = new Map<string, { projectId: string; image: RoomImage }>();

// Track projects where storage write failed to avoid reading stale storage on load
const storageWriteFailed = new Set<string>();

const STORAGE_KEY_PREFIX = "roomify_project_context_";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function safeRevokeUrl(url?: string): void {
  if (!url) return;
  if (
    typeof window !== "undefined" &&
    typeof window.URL !== "undefined" &&
    typeof window.URL.revokeObjectURL === "function"
  ) {
    try {
      window.URL.revokeObjectURL(url);
    } catch {
      // Ignore errors when revoking non-blob URLs
    }
  }
}

/**
 * Saves project context.
 * Validates identity and nested metadata before state mutation.
 * Transfers previewUrl ownership to this module.
 * Always updates memory metadata and prefers it if storage write fails.
 */
export function saveProjectContext(context: ProjectContext): void {
  if (!context || typeof context !== "object") {
    throw new Error("Project context must be a valid object.");
  }

  if (
    !context.projectId ||
    typeof context.projectId !== "string" ||
    context.projectId.trim() === ""
  ) {
    throw new Error("Valid non-empty projectId is required.");
  }
  const cleanProjectId = context.projectId.trim();

  if (!context.image || typeof context.image !== "object") {
    throw new Error("Valid image object is required in project context.");
  }

  if (
    !context.image.projectId ||
    typeof context.image.projectId !== "string" ||
    context.image.projectId.trim() !== cleanProjectId
  ) {
    throw new Error(
      `Image projectId "${context.image.projectId}" must match context projectId "${cleanProjectId}".`
    );
  }

  if (
    !context.image.imageId ||
    typeof context.image.imageId !== "string" ||
    context.image.imageId.trim() === ""
  ) {
    throw new Error("Valid non-empty imageId is required in project context.");
  }

  // All validations passed; now safely manage previewUrl ownership and replacement
  const existingPreview = previewUrlRegistry.get(cleanProjectId);
  if (context.previewUrl && typeof context.previewUrl === "string" && context.previewUrl.trim() !== "") {
    const newPreview = context.previewUrl.trim();
    if (existingPreview && existingPreview !== newPreview) {
      safeRevokeUrl(existingPreview);
    }
    previewUrlRegistry.set(cleanProjectId, newPreview);
  } else {
    // Replacement without preview must revoke and clear prior preview
    if (existingPreview) {
      safeRevokeUrl(existingPreview);
      previewUrlRegistry.delete(cleanProjectId);
    }
  }

  // Persist only non-binary metadata; NEVER persist blob URLs, base64, or credentials
  const serializableMetadata = {
    projectId: cleanProjectId,
    image: {
      projectId: cleanProjectId,
      imageId: context.image.imageId.trim(),
      imageUrl: context.image.imageUrl,
      width: context.image.width,
      height: context.image.height,
    },
  };

  // Always update in-memory metadata first
  memoryContextFallback.set(cleanProjectId, serializableMetadata);

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(
        `${STORAGE_KEY_PREFIX}${cleanProjectId}`,
        JSON.stringify(serializableMetadata)
      );
      storageWriteFailed.delete(cleanProjectId);
    } catch {
      // Storage write failed (e.g. QuotaExceededError or private browsing)
      storageWriteFailed.add(cleanProjectId);
    }
  } else {
    storageWriteFailed.add(cleanProjectId);
  }
}

/**
 * Loads project context for a given projectId.
 * Validates identity so wrong-project context is never returned.
 * Safe against missing, corrupt, or throwing storage.
 * Prefers memory metadata when storage writes previously failed to prevent pairing stale storage with new preview.
 */
export function loadProjectContext(projectId: string): ProjectContext | null {
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    return null;
  }

  const cleanProjectId = projectId.trim();
  let parsed: { projectId: string; image: RoomImage } | null = null;

  // If storage write failed, prefer memory metadata to prevent pairing stale stored image with a new preview
  if (storageWriteFailed.has(cleanProjectId) && memoryContextFallback.has(cleanProjectId)) {
    parsed = memoryContextFallback.get(cleanProjectId) || null;
  } else {
    let storedRaw: string | null = null;
    const storage = getStorage();

    if (storage) {
      try {
        storedRaw = storage.getItem(`${STORAGE_KEY_PREFIX}${cleanProjectId}`);
      } catch {
        storedRaw = null;
      }
    }

    if (storedRaw) {
      try {
        parsed = JSON.parse(storedRaw);
      } catch {
        parsed = null;
      }
    }

    // Fall back to memory metadata if storage was empty or unparseable
    if (!parsed) {
      parsed = memoryContextFallback.get(cleanProjectId) || null;
    }
  }

  if (!parsed) {
    return null;
  }

  // Identity validation: Ensure stored project ID matches the requested project ID
  if (parsed.projectId !== cleanProjectId) {
    return null;
  }

  if (!parsed.image || parsed.image.projectId !== cleanProjectId) {
    return null;
  }

  // Hydrate with in-memory preview URL
  const inMemoryPreview = previewUrlRegistry.get(cleanProjectId);

  return {
    projectId: parsed.projectId,
    image: parsed.image,
    previewUrl: inMemoryPreview,
  };
}

/**
 * Clears project context and explicitly revokes any registered preview URLs.
 */
export function clearProjectContext(projectId: string): void {
  if (!projectId) return;

  const cleanProjectId = projectId.trim();

  const existingPreview = previewUrlRegistry.get(cleanProjectId);
  if (existingPreview) {
    safeRevokeUrl(existingPreview);
    previewUrlRegistry.delete(cleanProjectId);
  }

  memoryContextFallback.delete(cleanProjectId);
  storageWriteFailed.delete(cleanProjectId);

  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(`${STORAGE_KEY_PREFIX}${cleanProjectId}`);
    } catch {
      // Ignore storage errors on clear
    }
  }
}
