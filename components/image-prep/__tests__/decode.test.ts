import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Decode-glue tests for 11_image_prep (R2, R4) with a stubbed
 * createImageBitmap + canvas 2D context (jsdom has no real one; the real
 * decode path is E2E's). Verifies the white-flatten draw, the proportional
 * downscale, and the unusable-context failure.
 */

import { ACCEPTED_IMAGE_TYPES, decodeImageFile } from "@/components/image-prep/decode";

type FakeCtx = {
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
};

function makeCtx(): FakeCtx {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn((x: number, y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4).fill(7),
    })),
  };
}

function stubBitmap(width: number, height: number) {
  const bitmap = { width, height, close: vi.fn() };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap),
  );
  return bitmap;
}

let ctx: FakeCtx | null;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  ctx = makeCtx();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: vi.fn(() => ctx),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: originalGetContext,
    writable: true,
    configurable: true,
  });
});

describe("decodeImageFile (R2, R4)", () => {
  it("pins the client-side type allow-list", () => {
    expect(ACCEPTED_IMAGE_TYPES).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("decodes at native size (no downscale), flattening over white", async () => {
    const bitmap = stubBitmap(4, 2);
    const decoded = await decodeImageFile(new Blob());
    expect(decoded.pixels.width).toBe(4);
    expect(decoded.pixels.height).toBe(2);
    expect([...decoded.pixels.data.slice(0, 4)]).toEqual([7, 7, 7, 7]);
    expect(decoded.downscaled).toBe(false);
    expect(decoded.originalWidth).toBe(4);
    expect(decoded.originalHeight).toBe(2);
    // Alpha is flattened over a white-filled canvas BEFORE the draw.
    expect(ctx?.fillStyle).toBe("#ffffff");
    expect(ctx?.fillRect).toHaveBeenCalledWith(0, 0, 4, 2);
    expect(ctx?.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 4, 2);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("downscales oversized images to the 2048px working bound (R4)", async () => {
    stubBitmap(4096, 2048);
    const decoded = await decodeImageFile(new Blob());
    expect(decoded.pixels.width).toBe(2048);
    expect(decoded.pixels.height).toBe(1024);
    expect(decoded.downscaled).toBe(true);
    expect(decoded.originalWidth).toBe(4096);
    expect(decoded.originalHeight).toBe(2048);
    expect(ctx?.getImageData).toHaveBeenCalledWith(0, 0, 2048, 1024);
  });

  it("rejects when no 2D context is available, still closing the bitmap", async () => {
    const bitmap = stubBitmap(4, 4);
    ctx = null;
    await expect(decodeImageFile(new Blob())).rejects.toThrow(/canvas/i);
    expect(bitmap.close).toHaveBeenCalled();
  });
});
