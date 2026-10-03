import {
  AnalysisResult,
  NormalizedDetection,
  RoomImage,
  RoomProject,
  FurnitureDecision,
} from "../types/room";
import { loadProjectContext } from "../features/room/projectContext";
import { validateRoomFile } from "../utils/fileValidation";
import { loadFurnitureDecisions } from "./decisionStorage";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ContractBlockedError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "MISSING_STABLE_DETECTION_ID"
      | "MISSING_IMAGE_DIMENSIONS"
      | "INVALID_COORDINATE_MODE"
      | "INVALID_DETECTION_GEOMETRY"
      | "INVALID_FURNITURE_DECISION"
  ) {
    super(message);
    this.name = "ContractBlockedError";
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id.trim());
}
// The backend identifies room projects by UUID.
function isValidProjectId(id: string): boolean {
  return isValidUuid(id);
}
const FURNITURE_DECISIONS: FurnitureDecision[] = [
  "KEEP",
  "REPLACE",
  "REMOVE",
  "UNSURE",
];

function normalizeFurnitureDecision(
  decision: string | null | undefined
): FurnitureDecision {
  if (decision == null || decision.trim() === "") {
    return "UNSURE";
  }

  const normalized = decision.trim().toUpperCase();

  if (FURNITURE_DECISIONS.includes(normalized as FurnitureDecision)) {
    return normalized as FurnitureDecision;
  }

  throw new ContractBlockedError(
    `Invalid furniture decision "${decision}".`,
    "INVALID_FURNITURE_DECISION"
  );
}

const getApiBaseUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_URL || "";
};

/**
 * Reads response body once, parsing as JSON if possible, falling back to raw text.
 */
async function parseErrorDetails(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

/**
 * Reads successful response body once and parses JSON, or throws safe ApiError.
 */
async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(
      "Failed to parse server response as JSON",
      response.status,
      text
    );
  }
}

export interface RawBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawVisionDetection {
  id?: string;
  label: string;
  confidence: number;
  bounding_box?: RawBoundingBox;
  box?: RawBoundingBox;
  decision?: string | null;
}

export interface RawVisionAnalysisResponse {
  status?: string;
  projectId?: string | number;
  imageId?: string | number;
  width?: number;
  height?: number;
  detections?: RawVisionDetection[];
  coordinateMode?: "pixel" | "normalized";
}

export interface RawStoredBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RawStoredDetectedObject {
  objectId: string;
  imageId: string | number;
  label: string;
  confidence: number;
  bbox: RawStoredBoundingBox;
  modelVersion?: string | null;
}

export interface RawStoredAnalysisResponse {
  projectId: string | number;
  objects: RawStoredDetectedObject[];
}

export interface FurnitureDecisionResponse {
  objectId: string;
  decision: FurnitureDecision;
}

/**
 * Pure helper to normalize detection coordinates from explicit pixel or normalized space.
 * Rejects nonfinite, negative, non-positive, out-of-bounds, duplicate, or non-numeric geometry/confidence.
 * Fails explicitly if dimensions are missing/non-positive or stable detection IDs are unavailable.
 */
export function normalizeDetections(
  rawList: RawVisionDetection[],
  dimensions: { width: number; height: number },
  coordinateMode: "pixel" | "normalized"
): NormalizedDetection[] {
  if (
    !dimensions ||
    typeof dimensions.width !== "number" ||
    typeof dimensions.height !== "number"
  ) {
    throw new ContractBlockedError(
      "Image dimensions must be provided to normalize detections.",
      "MISSING_IMAGE_DIMENSIONS"
    );
  }

  const { width: imgW, height: imgH } = dimensions;
  if (
    !Number.isFinite(imgW) ||
    !Number.isFinite(imgH) ||
    imgW <= 0 ||
    imgH <= 0
  ) {
    throw new ContractBlockedError(
      `Image dimensions must be positive finite numbers. Received: ${imgW}x${imgH}`,
      "MISSING_IMAGE_DIMENSIONS"
    );
  }

  if (coordinateMode !== "pixel" && coordinateMode !== "normalized") {
    throw new ContractBlockedError(
      `Invalid coordinate mode: ${coordinateMode}. Expected "pixel" or "normalized".`,
      "INVALID_COORDINATE_MODE"
    );
  }

  const seenIds = new Set<string>();

  return rawList.map((raw, index) => {
    // Check for stable detection ID: do not manufacture synthetic persisted IDs
    if (!raw.id || typeof raw.id !== "string" || raw.id.trim() === "") {
      throw new ContractBlockedError(
        `Detection at index ${index} lacks a stable detection ID. Per CONTRACT.md Gap 3, the adapter will not manufacture synthetic persisted IDs.`,
        "MISSING_STABLE_DETECTION_ID"
      );
    }

    const trimmedId = raw.id.trim();
    if (seenIds.has(trimmedId)) {
      throw new ContractBlockedError(
        `Duplicate detection ID found: "${trimmedId}". Stable detection IDs must be unique within an analysis result.`,
        "INVALID_DETECTION_GEOMETRY"
      );
    }
    seenIds.add(trimmedId);

    if (!raw.label || typeof raw.label !== "string" || raw.label.trim() === "") {
      throw new ContractBlockedError(
        `Detection "${trimmedId}" is missing a valid non-empty string label.`,
        "INVALID_DETECTION_GEOMETRY"
      );
    }

    // Require explicit numeric confidence (no coercing null/undefined to 0)
    if (
      typeof raw.confidence !== "number" ||
      !Number.isFinite(raw.confidence) ||
      raw.confidence < 0 ||
      raw.confidence > 1
    ) {
      throw new ContractBlockedError(
        `Detection "${trimmedId}" has invalid confidence: ${String(raw.confidence)}. Expected numeric 0 <= confidence <= 1.`,
        "INVALID_DETECTION_GEOMETRY"
      );
    }

    const box = raw.bounding_box ?? raw.box;
    if (!box) {
      throw new ContractBlockedError(
        `Detection "${trimmedId}" is missing bounding box geometry.`,
        "INVALID_DETECTION_GEOMETRY"
      );
    }

    const { x, y, width: bw, height: bh } = box;

    // Strict validation: reject non-finite, negative, or non-positive dimensions
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof bw !== "number" ||
      typeof bh !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(bw) ||
      !Number.isFinite(bh) ||
      x < 0 ||
      y < 0 ||
      bw <= 0 ||
      bh <= 0
    ) {
      throw new ContractBlockedError(
        `Detection "${trimmedId}" has invalid non-finite, negative, or non-positive geometry: ${JSON.stringify(box)}`,
        "INVALID_DETECTION_GEOMETRY"
      );
    }

    let normX: number;
    let normY: number;
    let normW: number;
    let normH: number;

    if (coordinateMode === "pixel") {
      // Out-of-bounds check in pixel space
      if (x + bw > imgW || y + bh > imgH) {
        throw new ContractBlockedError(
          `Detection "${trimmedId}" box exceeds image bounds (${imgW}x${imgH}): x=${x}, y=${y}, width=${bw}, height=${bh}`,
          "INVALID_DETECTION_GEOMETRY"
        );
      }
      normX = x / imgW;
      normY = y / imgH;
      normW = bw / imgW;
      normH = bh / imgH;
    } else {
      // Normalized space: coordinates must be strictly in [0, 1] range and not exceed bounds
      if (x > 1 || y > 1 || bw > 1 || bh > 1 || x + bw > 1 || y + bh > 1) {
        throw new ContractBlockedError(
          `Detection "${trimmedId}" normalized box exceeds [0, 1] unit bounds: x=${x}, y=${y}, width=${bw}, height=${bh}`,
          "INVALID_DETECTION_GEOMETRY"
        );
      }
      normX = x;
      normY = y;
      normW = bw;
      normH = bh;
    }

    return {
      id: trimmedId,
      label: raw.label.trim(),
      confidence: raw.confidence,
      box: {
        x: normX,
        y: normY,
        width: normW,
        height: normH,
      },
      decision: normalizeFurnitureDecision(raw.decision),
    };
  });
}

/**
 * Creates a new room project.
 * POST /api/projects
 * Accepts UUID string only, rejecting numeric or invalid string IDs.
 */
export async function createProject(signal?: AbortSignal): Promise<RoomProject> {
  const baseUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(
      `Network error while creating project: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }

  if (!response.ok) {
    const errorDetails = await parseErrorDetails(response);
    throw new ApiError(
      `Failed to create project: Server returned ${response.status}`,
      response.status,
      errorDetails
    );
  }

  const data = await parseResponseBody(response);

  if (!data || typeof data !== "object") {
    throw new ApiError(
      "Malformed createProject response: expected object",
      response.status,
      data
    );
  }

  const projData = data as { id?: unknown; status?: unknown };

  if (typeof projData.id !== "string" || !isValidUuid(projData.id)) {
    throw new ApiError(
      "Malformed createProject response: project id must be a valid UUID string",
      response.status,
      data
    );
  }

  if (typeof projData.status !== "string" || projData.status.trim() === "") {
    throw new ApiError(
      "Malformed createProject response: missing or invalid project status",
      response.status,
      data
    );
  }

  return {
    id: projData.id.trim(),
    status: projData.status.trim(),
  };
}

/**
 * Uploads an image for a project.
 * POST /api/projects/{projectId}/image
 * Requires returned projectId and verifies it matches requested projectId.
 */
export async function uploadRoomImage(
  projectId: string,
  file: File,
  signal?: AbortSignal
): Promise<RoomImage> {
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    throw new ApiError("Valid non-empty Project ID is required for image upload", 400);
  }

  const cleanProjectId = projectId.trim();

  const validationError = validateRoomFile(file);
  if (validationError) {
    throw new ApiError(validationError, 400);
  }

  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(cleanProjectId)}/image`,
      {
        method: "POST",
        body: formData,
        signal,
      }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(
      `Network error while uploading image: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }

  if (!response.ok) {
    const errorDetails = await parseErrorDetails(response);
    throw new ApiError(
      `Failed to upload image: Server returned ${response.status}`,
      response.status,
      errorDetails
    );
  }

  const data = await parseResponseBody(response);

  if (!data || typeof data !== "object") {
    throw new ApiError(
      "Malformed uploadRoomImage response: expected object",
      response.status,
      data
    );
  }

  const res = data as {
    imageId?: unknown;
    projectId?: unknown;
    imageUrl?: string;
    width?: number;
    height?: number;
  };

  const imageIdStr =
    typeof res.imageId === "string"
      ? res.imageId.trim()
      : typeof res.imageId === "number"
      ? String(res.imageId)
      : "";

  if (!imageIdStr) {
    throw new ApiError(
      "Malformed uploadRoomImage response: missing or invalid imageId",
      response.status,
      data
    );
  }

  // Mandatory projectId check: upload response must require projectId and verify matching
  if (res.projectId === undefined || res.projectId === null) {
    throw new ApiError(
      "Malformed uploadRoomImage response: missing required projectId",
      response.status,
      data
    );
  }

  const returnedProjIdStr = String(res.projectId).trim();
  if (returnedProjIdStr !== cleanProjectId) {
    throw new ApiError(
      `uploadRoomImage response projectId mismatch: expected "${cleanProjectId}" but received "${returnedProjIdStr}"`,
      response.status,
      data
    );
  }

  return {
    projectId: cleanProjectId,
    imageId: imageIdStr,
    imageUrl: typeof res.imageUrl === "string" ? res.imageUrl : undefined,
    width: typeof res.width === "number" && res.width > 0 ? res.width : undefined,
    height: typeof res.height === "number" && res.height > 0 ? res.height : undefined,
  };
}

/**
 * Triggers vision analysis for a room project.
 * POST /api/projects/{projectId}/analysis
 *
 * Normalizes detection coordinates to [0, 1] relative to source image dimensions.
 * Loads matching image dimensions from projectContext when needed, or from response.
 * Never invents imageId "img-0". Rejects identity mismatches.
 * Requires completed status (case-insensitive) and actual detections array.
 */
export async function analyzeRoom(
  projectId: string,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    throw new ApiError("Valid non-empty Project ID is required for room analysis", 400);
  }

  const cleanProjectId = projectId.trim();
  const baseUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(cleanProjectId)}/analysis`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        signal,
      }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(
      `Network error while analyzing room: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }

  if (!response.ok) {
    const errorDetails = await parseErrorDetails(response);
    let message = `Failed to analyze room: Server returned ${response.status}`;
    if (response.status === 409) {
      message = "Invalid project state or missing active image for analysis (409 Conflict).";
    } else if (response.status === 503) {
      message = "Vision service unavailable (503). Analysis could not be completed; please retry.";
    }

    throw new ApiError(message, response.status, errorDetails);
  }

  const data = await parseResponseBody(response);

  if (!data || typeof data !== "object") {
    throw new ApiError(
      "Malformed analyzeRoom response: expected object",
      response.status,
      data
    );
  }

  const res = data as RawVisionAnalysisResponse;

  // Case-insensitive status check: accepts "completed", "COMPLETED", etc.
  if (
    typeof res.status !== "string" ||
    res.status.trim().toLowerCase() !== "completed"
  ) {
    throw new ApiError(
      `Unexpected analysis status: expected "completed" (case-insensitive) but received "${String(res.status)}"`,
      response.status,
      data
    );
  }

  // Detections must be an actual array
  if (!Array.isArray(res.detections)) {
    throw new ApiError(
      "Malformed analyzeRoom response: detections must be an array",
      response.status,
      data
    );
  }

  // Verify response projectId identity if returned
  if (res.projectId !== undefined && res.projectId !== null) {
    const resProjId = String(res.projectId).trim();
    if (resProjId !== cleanProjectId) {
      throw new ApiError(
        `analyzeRoom response projectId mismatch: expected "${cleanProjectId}" but received "${resProjId}"`,
        response.status,
        data
      );
    }
  }

  // Load matching context for image identity and dimensions
  const context = loadProjectContext(cleanProjectId);
  const contextImageId =
    context && context.projectId === cleanProjectId ? context.image.imageId : undefined;

  // Resolve imageId: response imageId or verified matching context imageId. NEVER invent "img-0"
  let resolvedImageId: string | undefined;
  if (res.imageId !== undefined && res.imageId !== null) {
    resolvedImageId = String(res.imageId).trim();
    // Reject image identity mismatch if context imageId is present
    if (contextImageId && resolvedImageId !== contextImageId) {
      throw new ApiError(
        `analyzeRoom response imageId mismatch: expected "${contextImageId}" from project context but received "${resolvedImageId}"`,
        response.status,
        data
      );
    }
  } else if (contextImageId) {
    resolvedImageId = contextImageId;
  } else {
    throw new ApiError(
      `Cannot resolve verified imageId for project "${cleanProjectId}". Analysis response lacks imageId and no matching projectContext exists.`,
      response.status,
      data
    );
  }

  // Empty detections array is valid success
  if (res.detections.length === 0) {
    return {
      projectId: cleanProjectId,
      imageId: resolvedImageId,
      detections: [],
    };
  }

  // Determine image dimensions as a complete pair:
  // If either response width/height is supplied (including null/nonfinite), require both to be positive finite numbers
  // and reject with typed ContractBlockedError MISSING_IMAGE_DIMENSIONS otherwise.
  // Only when BOTH are omitted choose complete verified context pair. No partial pair fallback.
  let width: number | undefined;
  let height: number | undefined;

  const hasResWidth = res.width !== undefined;
  const hasResHeight = res.height !== undefined;

  if (hasResWidth || hasResHeight) {
    const isPositiveFinite = (val: unknown): val is number =>
      typeof val === "number" && Number.isFinite(val) && val > 0;

    if (!isPositiveFinite(res.width) || !isPositiveFinite(res.height)) {
      throw new ContractBlockedError(
        `Invalid or incomplete response image dimensions for project "${cleanProjectId}": width=${String(res.width)}, height=${String(res.height)}. ` +
        `When response dimensions are supplied, both width and height must be positive finite numbers.`,
        "MISSING_IMAGE_DIMENSIONS"
      );
    }

    width = res.width;
    height = res.height;
  } else if (
    context &&
    context.projectId === cleanProjectId &&
    typeof context.image.width === "number" &&
    Number.isFinite(context.image.width) &&
    context.image.width > 0 &&
    typeof context.image.height === "number" &&
    Number.isFinite(context.image.height) &&
    context.image.height > 0
  ) {
    width = context.image.width;
    height = context.image.height;
  } else {
    throw new ContractBlockedError(
      `Cannot normalize detection pixel coordinates: missing verified image dimensions for project "${cleanProjectId}". ` +
      `Ensure positive finite dimensions are saved in projectContext or returned by the analysis response.`,
      "MISSING_IMAGE_DIMENSIONS"
    );
  }

  const coordinateMode = res.coordinateMode || "pixel";

  const normalized = normalizeDetections(
    res.detections,
    { width, height },
    coordinateMode
  );

  return {
    projectId: cleanProjectId,
    imageId: resolvedImageId,
    detections: normalized,
  };
}

/**
 * Runs vision analysis on the backend and persists the detected objects.
 * POST /api/projects/{projectId}/analysis
 *
 * The backend returns saved results without re-running vision for an already
 * analyzed project, so this is safe to repeat. Load the persisted objects
 * (with their stable UUIDs) afterwards via getStoredAnalysis.
 */
export async function requestAnalysis(
  projectId: string,
  signal?: AbortSignal
): Promise<void> {
  const cleanProjectId = projectId.trim();

  if (!isValidProjectId(cleanProjectId)) {
    throw new ApiError("Valid project UUID is required for room analysis", 400);
  }

  const baseUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(cleanProjectId)}/analysis`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        signal,
      }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(
      `Network error while analyzing room: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }

  if (!response.ok) {
    const errorDetails = await parseErrorDetails(response);
    let message = `Failed to analyze room: Server returned ${response.status}`;
    if (response.status === 409) {
      message = "Invalid project state or missing active image for analysis (409 Conflict).";
    } else if (response.status === 503) {
      message = "Vision service unavailable (503). Analysis could not be completed; please retry.";
    }

    throw new ApiError(message, response.status, errorDetails);
  }
}

export async function updateFurnitureDecision(
  projectId: string,
  objectId: string,
  decision: FurnitureDecision,
  signal?: AbortSignal
): Promise<FurnitureDecisionResponse> {
  const cleanProjectId = projectId.trim();
  const cleanObjectId = objectId.trim();

  if (!isValidProjectId(cleanProjectId)) {
    throw new ApiError("Valid project ID is required for furniture decision update", 400);
  }

  if (!isValidUuid(cleanObjectId)) {
    throw new ApiError("Valid object UUID is required for furniture decision update", 400);
  }

  const baseUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(cleanProjectId)}/objects/${encodeURIComponent(cleanObjectId)}`,
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
        signal,
      }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }

    throw new ApiError(
      `Network error while updating furniture decision: ${
        err instanceof Error ? err.message : String(err)
      }`,
      0
    );
  }

  if (!response.ok) {
    const errorDetails = await parseErrorDetails(response);

    throw new ApiError(
      `Failed to update furniture decision: Server returned ${response.status}`,
      response.status,
      errorDetails
    );
  }

  const data = await parseResponseBody(response);

  if (!data || typeof data !== "object") {
    throw new ApiError(
      "Malformed furniture decision response: expected object",
      response.status,
      data
    );
  }

  const result = data as {
    objectId?: unknown;
    decision?: unknown;
  };

  if (
    typeof result.objectId !== "string" ||
    result.objectId.trim() !== cleanObjectId
  ) {
    throw new ApiError(
      "Malformed furniture decision response: objectId mismatch",
      response.status,
      data
    );
  }

  const returnedDecision =
    typeof result.decision === "string"
      ? normalizeFurnitureDecision(result.decision)
      : null;

  if (!returnedDecision) {
    throw new ApiError(
      "Malformed furniture decision response: missing decision",
      response.status,
      data
    );
  }

  return {
    objectId: cleanObjectId,
    decision: returnedDecision,
  };
}

export async function getStoredAnalysis(
  projectId: string,
  expectedImageId?: string,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  const cleanProjectId = projectId.trim();

  if (!isValidProjectId(cleanProjectId)) {
    throw new ApiError("Valid project UUID is required for stored analysis", 400);
  }

  const baseUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(cleanProjectId)}/analysis`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }

    throw new ApiError(
      `Network error while loading stored analysis: ${
        err instanceof Error ? err.message : String(err)
      }`,
      0
    );
  }

  if (!response.ok) {
    const errorDetails = await parseErrorDetails(response);

    throw new ApiError(
      `Failed to load stored analysis: Server returned ${response.status}`,
      response.status,
      errorDetails
    );
  }

  const data = await parseResponseBody(response);

  if (!data || typeof data !== "object") {
    throw new ApiError(
      "Malformed stored analysis response: expected object",
      response.status,
      data
    );
  }

  const result = data as RawStoredAnalysisResponse;

  if (String(result.projectId).trim() !== cleanProjectId) {
    throw new ApiError(
      "Malformed stored analysis response: projectId mismatch",
      response.status,
      data
    );
  }

  if (!Array.isArray(result.objects)) {
    throw new ApiError(
      "Malformed stored analysis response: objects must be an array",
      response.status,
      data
    );
  }

  const imageIds = new Set<string>();
  const savedDecisions = loadFurnitureDecisions(cleanProjectId);
  const detections: NormalizedDetection[] = result.objects.map(
    (object, index) => {
      if (
        typeof object.objectId !== "string" ||
        !isValidUuid(object.objectId)
      ) {
        throw new ApiError(
          `Malformed stored analysis object at index ${index}: invalid objectId`,
          response.status,
          object
        );
      }

      const imageId = String(object.imageId).trim();

      if (!imageId) {
        throw new ApiError(
          `Malformed stored analysis object "${object.objectId}": invalid imageId`,
          response.status,
          object
        );
      }

      imageIds.add(imageId);

      if (
        typeof object.label !== "string" ||
        object.label.trim() === ""
      ) {
        throw new ApiError(
          `Malformed stored analysis object "${object.objectId}": invalid label`,
          response.status,
          object
        );
      }

      if (
        typeof object.confidence !== "number" ||
        !Number.isFinite(object.confidence) ||
        object.confidence < 0 ||
        object.confidence > 1
      ) {
        throw new ApiError(
          `Malformed stored analysis object "${object.objectId}": invalid confidence`,
          response.status,
          object
        );
      }

      const box = object.bbox;

      if (
        !box ||
        typeof box.x !== "number" ||
        typeof box.y !== "number" ||
        typeof box.w !== "number" ||
        typeof box.h !== "number" ||
        !Number.isFinite(box.x) ||
        !Number.isFinite(box.y) ||
        !Number.isFinite(box.w) ||
        !Number.isFinite(box.h) ||
        box.x < 0 ||
        box.y < 0 ||
        box.w <= 0 ||
        box.h <= 0 ||
        box.x + box.w > 1 ||
        box.y + box.h > 1
      ) {
        throw new ApiError(
          `Malformed stored analysis object "${object.objectId}": invalid bbox`,
          response.status,
          object
        );
      }

      return {
        id: object.objectId.trim(),
        label: object.label.trim(),
        confidence: object.confidence,
        box: {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
        },
        decision: savedDecisions[object.objectId.trim()] ?? "UNSURE",
      };
    }
  );

  if (imageIds.size > 1) {
    throw new ApiError(
      "Malformed stored analysis response: active objects belong to multiple images",
      response.status,
      data
    );
  }

  const storedImageId = imageIds.values().next().value as string | undefined;

  if (
    expectedImageId &&
    storedImageId &&
    storedImageId !== expectedImageId
  ) {
    throw new ApiError(
      "Stored analysis belongs to a different room image",
      response.status,
      data
    );
  }

  return {
    projectId: cleanProjectId,
    imageId: storedImageId ?? expectedImageId ?? "",
    detections,
  };
}
