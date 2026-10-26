import { afterEach, describe, expect, it, vi } from "vitest";
import { shrinkForUpload, UPLOAD_TARGET_BYTES } from "../src/utils/shrinkImage";

function fileOfSize(bytes: number, name = "room.png", type = "image/png") {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("shrinkForUpload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns small files unchanged", async () => {
    const file = fileOfSize(1024);
    expect(await shrinkForUpload(file)).toBe(file);
  });

  it("re-encodes large photos as a JPEG under the Vercel body limit", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 6000, height: 4000, close }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) {
      cb(new Blob([new Uint8Array(1_000_000)], { type: "image/jpeg" }));
    });

    const result = await shrinkForUpload(fileOfSize(UPLOAD_TARGET_BYTES + 1));

    expect(result.name).toBe("room.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBeLessThanOrEqual(UPLOAD_TARGET_BYTES);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2560, 1707);
    expect(close).toHaveBeenCalled();
  });
});
