import { describe, expect, it } from "vitest";

/**
 * Unit tests for the pure click→pixel geometry behind "Pick from image" (R21).
 * `mapClickToPixel` is DOM-free so it is testable without a real layout —
 * jsdom's getBoundingClientRect returns zeros, so the component-level pick
 * behavior is exercised separately in ImagePrep.test.tsx with a mocked rect.
 */

import { mapClickToPixel } from "@/components/image-prep/BeforeAfterPreview";

describe("mapClickToPixel (R21)", () => {
  it("maps a click on an unscaled, unpadded canvas to the exact pixel", () => {
    // rect === intrinsic size, no letterbox: pixel = floor(offset).
    expect(
      mapClickToPixel({ rectW: 4, rectH: 4, imgW: 4, imgH: 4, offsetX: 1.5, offsetY: 2.5 }),
    ).toEqual({ x: 1, y: 2 });
    expect(
      mapClickToPixel({ rectW: 4, rectH: 4, imgW: 4, imgH: 4, offsetX: 0, offsetY: 0 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("divides the CSS scale back out for a uniformly enlarged box", () => {
    // A 4×4 image drawn at 40×40 (scale 10), no letterbox (square in square).
    expect(
      mapClickToPixel({ rectW: 40, rectH: 40, imgW: 4, imgH: 4, offsetX: 25, offsetY: 5 }),
    ).toEqual({ x: 2, y: 0 });
  });

  it("accounts for horizontal object-contain letterboxing", () => {
    // 2×4 (portrait) image in a 40×40 box → scale 10, drawn 20×40, centered:
    // padX = 10, so content spans x ∈ [10, 30).
    expect(
      mapClickToPixel({ rectW: 40, rectH: 40, imgW: 2, imgH: 4, offsetX: 15, offsetY: 5 }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      mapClickToPixel({ rectW: 40, rectH: 40, imgW: 2, imgH: 4, offsetX: 25, offsetY: 35 }),
    ).toEqual({ x: 1, y: 3 });
  });

  it("rejects clicks that land in the letterbox margin", () => {
    // Same portrait-in-square layout: x < 10 or x >= 30 is the side margin.
    expect(
      mapClickToPixel({ rectW: 40, rectH: 40, imgW: 2, imgH: 4, offsetX: 5, offsetY: 20 }),
    ).toBeNull();
    expect(
      mapClickToPixel({ rectW: 40, rectH: 40, imgW: 2, imgH: 4, offsetX: 35, offsetY: 20 }),
    ).toBeNull();
    // Landscape-in-square: top/bottom margin rejects on the y axis.
    expect(
      mapClickToPixel({ rectW: 40, rectH: 40, imgW: 4, imgH: 2, offsetX: 20, offsetY: 2 }),
    ).toBeNull();
  });

  it("rejects a click exactly on the far content edge (half-open range)", () => {
    // offsetX === drawnW is out; the last pixel occupies [3, 4).
    expect(
      mapClickToPixel({ rectW: 4, rectH: 4, imgW: 4, imgH: 4, offsetX: 4, offsetY: 2 }),
    ).toBeNull();
    expect(
      mapClickToPixel({ rectW: 4, rectH: 4, imgW: 4, imgH: 4, offsetX: 2, offsetY: 4 }),
    ).toBeNull();
  });

  it("returns null for a degenerate zero-size box or image", () => {
    expect(
      mapClickToPixel({ rectW: 0, rectH: 4, imgW: 4, imgH: 4, offsetX: 1, offsetY: 1 }),
    ).toBeNull();
    expect(
      mapClickToPixel({ rectW: 4, rectH: 0, imgW: 4, imgH: 4, offsetX: 1, offsetY: 1 }),
    ).toBeNull();
    expect(
      mapClickToPixel({ rectW: 4, rectH: 4, imgW: 0, imgH: 4, offsetX: 1, offsetY: 1 }),
    ).toBeNull();
    expect(
      mapClickToPixel({ rectW: 4, rectH: 4, imgW: 4, imgH: 0, offsetX: 1, offsetY: 1 }),
    ).toBeNull();
  });
});
