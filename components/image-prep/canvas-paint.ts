import type { PixelBuffer } from "@/lib/image-prep-core";

/**
 * Paint a PixelBuffer onto a canvas; no-ops where jsdom has no 2D context.
 * Extracted from `BeforeAfterPreview` (12_flatten, R4) so the flatten canvas
 * shares the exact same jsdom-guarded painting path — zero behavior change.
 */
export function paint(canvas: HTMLCanvasElement | null, pixels: PixelBuffer) {
  if (!canvas) {
    return;
  }
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const imageData = ctx.createImageData(pixels.width, pixels.height);
  imageData.data.set(pixels.data);
  ctx.putImageData(imageData, 0, 0);
}
