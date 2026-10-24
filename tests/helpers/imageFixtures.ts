/**
 * Real complete valid image fixtures for format, magic byte, and decoder testing.
 */

// Complete valid 1x1 transparent PNG (matching Playwright suite):
export const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Complete valid 1x1 baseline JFIF JPEG (Annex K standard Huffman tables, decodable by PIL/Pillow):
export const VALID_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==";

// Complete valid 1x1 transparent GIF89a:
export const VALID_GIF_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Complete valid 1x1 WebP:
export const VALID_WEBP_BASE64 =
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=";

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function createRealJpegBytes(totalSize?: number): Uint8Array {
  const base = base64ToUint8Array(VALID_JPEG_BASE64);
  if (!totalSize || totalSize <= base.length) {
    return base;
  }
  const bytes = new Uint8Array(totalSize);
  bytes.set(base, 0);
  return bytes;
}

export function createRealPngBytes(totalSize?: number): Uint8Array {
  const base = base64ToUint8Array(VALID_PNG_BASE64);
  if (!totalSize || totalSize <= base.length) {
    return base;
  }
  const bytes = new Uint8Array(totalSize);
  bytes.set(base, 0);
  return bytes;
}

export function createRealGifBytes(totalSize?: number): Uint8Array {
  const base = base64ToUint8Array(VALID_GIF_BASE64);
  if (!totalSize || totalSize <= base.length) {
    return base;
  }
  const bytes = new Uint8Array(totalSize);
  bytes.set(base, 0);
  return bytes;
}

export function createRealWebpBytes(totalSize?: number): Uint8Array {
  const base = base64ToUint8Array(VALID_WEBP_BASE64);
  if (!totalSize || totalSize <= base.length) {
    return base;
  }
  const bytes = new Uint8Array(totalSize);
  bytes.set(base, 0);
  return bytes;
}

export function createRealJpegFile(
  name = "room.jpg",
  totalSize?: number,
  options: FilePropertyBag = { type: "image/jpeg" }
): File {
  return new File([createRealJpegBytes(totalSize)], name, options);
}

export function createRealPngFile(
  name = "room.png",
  totalSize?: number,
  options: FilePropertyBag = { type: "image/png" }
): File {
  return new File([createRealPngBytes(totalSize)], name, options);
}

export function createRealGifFile(
  name = "renamed.png",
  totalSize?: number,
  options: FilePropertyBag = { type: "image/png" }
): File {
  return new File([createRealGifBytes(totalSize)], name, options);
}

export function createRealWebpFile(
  name = "renamed.jpg",
  totalSize?: number,
  options: FilePropertyBag = { type: "image/jpeg" }
): File {
  return new File([createRealWebpBytes(totalSize)], name, options);
}
