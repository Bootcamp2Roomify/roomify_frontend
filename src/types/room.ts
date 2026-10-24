export interface RoomProject {
  id: string;
  status: string;
}

export const ROOM_TYPES = ["BEDROOM", "LIVING_ROOM", "STUDY", "DORM_ROOM", "STUDIO", "OTHER"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export const RENTAL_STATUSES = ["RENTAL", "DORMITORY", "OWNED"] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

/** Collected by "Create project" (MVP Feature 2). */
export interface ProjectDetails {
  name: string;
  roomType: RoomType;
  rentalStatus: RentalStatus;
}

export interface ProjectSummary extends ProjectDetails {
  id: string;
  status: string;
  hasImage: boolean;
  hasDesign: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPage {
  projects: ProjectSummary[];
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface RoomImage {
  projectId: string;
  imageId: string;
  imageUrl?: string;
  width?: number;
  height?: number;
}

export interface ProjectContext {
  projectId: string;
  image: RoomImage;
  previewUrl?: string;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FurnitureDecision =
  | "KEEP"
  | "REPLACE"
  | "REMOVE"
  | "UNSURE";

export interface NormalizedDetection {
  id: string;
  label: string;
  confidence: number;
  /** null only for items the person added by hand (source MANUAL). */
  box: NormalizedBox | null;
  decision: FurnitureDecision;
  /** MANUAL items were added or corrected by the person; CV items came from detection. */
  source?: "CV" | "MANUAL";
}

export interface AnalysisResult {
  projectId: string;
  imageId: string;
  detections: NormalizedDetection[];
}

/**
 * Checks if an image is render-ready.
 * A render-ready image has a usable URL (imageUrl or previewUrl) and positive width/height.
 * Missing fields require a visible recovery state, never guessed dimensions.
 */
export function isRenderReadyImage(
  image: RoomImage,
  previewUrl?: string
): boolean {
  const url = previewUrl || image.imageUrl;
  return Boolean(
    url &&
    typeof image.width === "number" &&
    image.width > 0 &&
    typeof image.height === "number" &&
    image.height > 0
  );
}
