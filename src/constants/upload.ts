export const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

export type AllowedMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_UPLOAD_FILE_SIZE_LABEL = "10MB";
export const ALLOWED_IMAGE_FORMATS_LABEL = "JPG or PNG";

export const ERROR_MESSAGES = {
  NO_FILE: "Please select a file.",
  FILE_EMPTY: "The selected file is empty.",
  FILE_TOO_LARGE: "File size exceeds the 10MB limit.",
  UNSUPPORTED_TYPE: "Please upload JPG or PNG.",
  CORRUPT_IMAGE:
    "The image file is corrupt or unreadable. Please upload a valid JPG or PNG.",
} as const;

export const USER_ERROR_MESSAGES = {
  CREATE_FAILED:
    "Unable to create room project. Please check your connection and try again.",
  UPLOAD_FAILED:
    "Failed to upload image. Please check your connection and retry.",
  SAVE_CONTEXT_FAILED:
    "Unable to save project details. Please try again.",
  NAVIGATION_FAILED:
    "Unable to open analysis page. Please try again.",
  BROWSER_UNSUPPORTED:
    "Image preview is not supported by your browser environment.",
} as const;
