export interface RoomProject {
  id: string;
  status: string;
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

export interface NormalizedDetection {
  id: string;
  label: string;
  confidence: number;
  box: NormalizedBox;
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
