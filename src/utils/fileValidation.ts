import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  ERROR_MESSAGES,
  MAX_UPLOAD_FILE_SIZE_BYTES,
} from "../constants/upload";

export interface ImageDimensions {
  width: number;
  height: number;
}

export function validateRoomFile(file: File): string | null {
  if (!file) {
    return ERROR_MESSAGES.NO_FILE;
  }

  if (file.size === 0) {
    return ERROR_MESSAGES.FILE_EMPTY;
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return ERROR_MESSAGES.FILE_TOO_LARGE;
  }

  const isAllowedType = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(
    file.type
  );
  if (!isAllowedType) {
    return ERROR_MESSAGES.UNSUPPORTED_TYPE;
  }

  const fileName = file.name || "";
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex !== -1) {
    const ext = fileName.slice(lastDotIndex).toLowerCase();
    const isAllowedExt = (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(
      ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number]
    );
    if (!isAllowedExt) {
      return ERROR_MESSAGES.UNSUPPORTED_TYPE;
    }
  }

  return null;
}

export async function readFileSignatureBytes(
  file: File,
  length = 16
): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    try {
      const buffer = await file.slice(0, length).arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      // Fall through to FileReader if available
    }
  }

  if (typeof FileReader !== "undefined") {
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result));
        } else {
          reject(new Error("Unable to read file signature."));
        }
      };
      reader.onerror = () => {
        reject(reader.error || new Error("Unable to read file signature."));
      };
      reader.readAsArrayBuffer(file.slice(0, length));
    });
  }

  throw new Error("Neither file.arrayBuffer nor FileReader is supported.");
}

export function isJpegSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

export function isPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

export async function validateImageSignature(
  file: File
): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    bytes = await readFileSignatureBytes(file, 16);
  } catch {
    return ERROR_MESSAGES.CORRUPT_IMAGE;
  }

  const isJpeg = isJpegSignature(bytes);
  const isPng = isPngSignature(bytes);

  // If bytes do not match supported JPEG or PNG signature
  if (!isJpeg && !isPng) {
    return ERROR_MESSAGES.UNSUPPORTED_TYPE;
  }

  // Ensure declared MIME and extension match detected signature bytes
  const mime = (file.type || "").toLowerCase();
  const fileName = (file.name || "").toLowerCase();

  if (isJpeg) {
    if (mime && mime !== "image/jpeg" && mime !== "image/jpg") {
      return ERROR_MESSAGES.UNSUPPORTED_TYPE;
    }
    if (fileName && !fileName.endsWith(".jpg") && !fileName.endsWith(".jpeg")) {
      return ERROR_MESSAGES.UNSUPPORTED_TYPE;
    }
  }

  if (isPng) {
    if (mime && mime !== "image/png") {
      return ERROR_MESSAGES.UNSUPPORTED_TYPE;
    }
    if (fileName && !fileName.endsWith(".png")) {
      return ERROR_MESSAGES.UNSUPPORTED_TYPE;
    }
  }

  return null;
}

export async function decodeImageDimensions(
  file: File
): Promise<ImageDimensions> {
  // Before any browser decode, verify actual JPEG/PNG signature bytes
  const signatureError = await validateImageSignature(file);
  if (signatureError) {
    throw new Error(signatureError);
  }

  // Attempt createImageBitmap if available in browser
  if (
    typeof window !== "undefined" &&
    typeof window.createImageBitmap === "function"
  ) {
    try {
      const bitmap = await window.createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      const width = bitmap.width;
      const height = bitmap.height;
      if (typeof bitmap.close === "function") {
        bitmap.close();
      }
      if (
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
      ) {
        return { width, height };
      }
      // Successful bitmap decode with non-positive or non-finite dimensions must reject, not fall through
      throw new Error(ERROR_MESSAGES.CORRUPT_IMAGE);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message === ERROR_MESSAGES.CORRUPT_IMAGE
      ) {
        throw err;
      }
      // Fall through to HTMLImageElement only on actual unavailable/unsupported decoding exception
    }
  }

  return new Promise<ImageDimensions>((resolve, reject) => {
    if (typeof window === "undefined" || typeof Image === "undefined") {
      reject(new Error(ERROR_MESSAGES.CORRUPT_IMAGE));
      return;
    }

    let objectUrl = "";
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.URL !== "undefined" &&
        typeof window.URL.createObjectURL === "function"
      ) {
        objectUrl = window.URL.createObjectURL(file);
      } else if (
        typeof URL !== "undefined" &&
        typeof URL.createObjectURL === "function"
      ) {
        objectUrl = URL.createObjectURL(file);
      }
    } catch {
      objectUrl = "";
    }

    if (!objectUrl) {
      reject(new Error(ERROR_MESSAGES.CORRUPT_IMAGE));
      return;
    }

    const img = new Image();
    let settled = false;

    const cleanup = () => {
      if (!objectUrl) return;
      try {
        if (
          typeof window !== "undefined" &&
          typeof window.URL !== "undefined" &&
          typeof window.URL.revokeObjectURL === "function"
        ) {
          window.URL.revokeObjectURL(objectUrl);
        } else if (
          typeof URL !== "undefined" &&
          typeof URL.revokeObjectURL === "function"
        ) {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        // Ignore revocation errors
      }
    };

    img.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();

      const width =
        typeof img.naturalWidth === "number" ? img.naturalWidth : img.width;
      const height =
        typeof img.naturalHeight === "number" ? img.naturalHeight : img.height;

      if (
        typeof width === "number" &&
        typeof height === "number" &&
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
      ) {
        resolve({ width, height });
      } else {
        reject(new Error(ERROR_MESSAGES.CORRUPT_IMAGE));
      }
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(ERROR_MESSAGES.CORRUPT_IMAGE));
    };

    img.src = objectUrl;
  });
}
