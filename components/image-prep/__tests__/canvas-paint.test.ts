import { describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the shared jsdom-guarded canvas painter (12_flatten, R4 —
 * extracted from BeforeAfterPreview with zero behavior change): both guard
 * paths (null ref, missing 2D context) no-op instead of throwing, and the
 * happy path writes the pixels through putImageData.
 */

import { paint } from "@/components/image-prep/canvas-paint";
import type { PixelBuffer } from "@/lib/image-prep-core";

const pixels: PixelBuffer = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]),
};

describe("paint", () => {
  it("no-ops on a null canvas ref", () => {
    expect(() => paint(null, pixels)).not.toThrow();
  });

  it("no-ops when the canvas has no 2D context (jsdom)", () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;
    expect(() => paint(canvas, pixels)).not.toThrow();
    // The intrinsic size is still set before the context guard bails.
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
  });

  it("sizes the canvas and puts the image data when a context exists", () => {
    const putImageData = vi.fn();
    const imageData = { data: new Uint8ClampedArray(2 * 1 * 4) };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        createImageData: vi.fn(() => imageData),
        putImageData,
      })),
    } as unknown as HTMLCanvasElement;

    paint(canvas, pixels);

    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect([...imageData.data]).toEqual([...pixels.data]);
    expect(putImageData).toHaveBeenCalledWith(imageData, 0, 0);
  });
});
