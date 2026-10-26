/**
 * Uploads pass through a Vercel Function, which rejects request bodies over 4.5 MB.
 * Photos above UPLOAD_TARGET_BYTES are re-encoded as JPEG with the longest side capped,
 * which keeps far more detail than detection (640 px) or the gallery needs.
 */
export const UPLOAD_TARGET_BYTES = 4 * 1024 * 1024;
const MAX_SIDE_PX = 2560;
const QUALITIES = [0.85, 0.72, 0.6];

export async function shrinkForUpload(file: File): Promise<File> {
  if (file.size <= UPLOAD_TARGET_BYTES || typeof createImageBitmap !== "function") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 3; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITIES) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality)
        );
        if (blob && blob.size <= UPLOAD_TARGET_BYTES) {
          const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
        }
      }
      scale *= 0.7;
    }
  } finally {
    bitmap.close();
  }
  // Could not get under the limit: send the original and let the server report the error.
  return file;
}
