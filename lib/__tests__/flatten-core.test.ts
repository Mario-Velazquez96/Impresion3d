import { describe, expect, it } from "vitest";

/**
 * Unit tests for the pure flatten core (12_flatten, Phase A: R4, R5, R7,
 * R10–R16) on tiny synthetic buffers. Target: 100% branch coverage on every
 * Phase-A function — determinism is a contract, so assertions are exact.
 */

import {
  BRUSH_RADIUS_STEP,
  DEFAULT_BRUSH_RADIUS,
  DEFAULT_FLOOD_TOLERANCE,
  HOVER_OUTLINE_RGBA,
  MAX_BRUSH_RADIUS,
  MAX_FLATTEN_HISTORY,
  MAX_RUNNER_UPS,
  MAX_TOLERANCE,
  MIN_BRUSH_RADIUS,
  MIN_TOLERANCE,
  SELECTION_FILL_ALPHA,
  SELECTION_OUTLINE_RGBA,
  TOLERANCE_STEP,
  applyFillToMask,
  brushMask,
  buildFlattenOverlay,
  colorAtPixel,
  floodMask,
  maskContains,
  maskOutline,
  maskPixelCount,
  maskStats,
  parseHexInput,
  subtractMask,
  unionMasks,
  type Mask,
} from "@/lib/flatten-core";
import { colorDistance, type PixelBuffer, type Rgb } from "@/lib/image-prep-core";

const grey = (v: number): Rgb => ({ r: v, g: v, b: v });
const BLACK = grey(0);
const WHITE = grey(255);
const RED: Rgb = { r: 200, g: 0, b: 0 };

function buf(width: number, height: number, colors: Rgb[]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  colors.forEach((c, i) => {
    data[i * 4] = c.r;
    data[i * 4 + 1] = c.g;
    data[i * 4 + 2] = c.b;
    data[i * 4 + 3] = 255;
  });
  return { width, height, data };
}

/** Mask literal helper: bits in row-major order. */
function mask(width: number, height: number, bits: number[]): Mask {
  return { width, height, data: new Uint8Array(bits) };
}

const bits = (m: Mask) => [...m.data];

describe("constants (pinned by spec)", () => {
  it("exports the agreed tuning values", () => {
    expect(DEFAULT_FLOOD_TOLERANCE).toBe(24);
    expect([MIN_TOLERANCE, MAX_TOLERANCE, TOLERANCE_STEP]).toEqual([0, 150, 4]);
    expect([
      DEFAULT_BRUSH_RADIUS,
      MIN_BRUSH_RADIUS,
      MAX_BRUSH_RADIUS,
      BRUSH_RADIUS_STEP,
    ]).toEqual([8, 1, 100, 2]);
    expect(MAX_RUNNER_UPS).toBe(6);
    expect(MAX_FLATTEN_HISTORY).toBe(12);
    expect(HOVER_OUTLINE_RGBA).toEqual([255, 255, 255, 230]);
    expect(SELECTION_OUTLINE_RGBA).toEqual([59, 130, 246, 255]);
    expect(SELECTION_FILL_ALPHA).toBe(56);
  });
});

describe("colorAtPixel (R15)", () => {
  const image = buf(2, 2, [BLACK, WHITE, RED, grey(9)]);

  it("reads the exact color and clamps out-of-bounds coordinates", () => {
    expect(colorAtPixel(image, 1, 0)).toEqual(WHITE);
    expect(colorAtPixel(image, -5, -5)).toEqual(BLACK); // clamped to (0,0)
    expect(colorAtPixel(image, 99, 99)).toEqual(grey(9)); // clamped to (1,1)
    expect(colorAtPixel(image, 0.9, 1.7)).toEqual(RED); // floored to (0,1)
  });
});

describe("floodMask (R5)", () => {
  it("includes at exactly the tolerance boundary and excludes just above it", () => {
    // 3×1 strip: seed | near | far. Tolerance is computed FROM the seed color,
    // so the boundary is exact by construction.
    const near = grey(10);
    const far = grey(30);
    const image = buf(3, 1, [BLACK, near, far]);
    const dNear = colorDistance(near, BLACK);

    const atBoundary = floodMask(image, 0, 0, dNear);
    expect(bits(atBoundary)).toEqual([1, 1, 0]);

    const belowBoundary = floodMask(image, 0, 0, dNear - 0.001);
    expect(bits(belowBoundary)).toEqual([1, 0, 0]);
  });

  it("is 4-connected: a same-color diagonal pixel is NOT reached", () => {
    // 2×2 checkerboard: black at (0,0) and (1,1), white elsewhere.
    const image = buf(2, 2, [BLACK, WHITE, WHITE, BLACK]);
    const result = floodMask(image, 0, 0, 1);
    expect(bits(result)).toEqual([1, 0, 0, 0]);
  });

  it("grows through chains of in-tolerance pixels in all four directions", () => {
    // 3×3 black plus-shape on white; flood from the center takes the plus.
    const image = buf(3, 3, [
      WHITE, BLACK, WHITE,
      BLACK, BLACK, BLACK,
      WHITE, BLACK, WHITE,
    ]);
    const result = floodMask(image, 1, 1, 1);
    expect(bits(result)).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
  });

  it("clamps an out-of-bounds seed into the image", () => {
    const image = buf(2, 1, [BLACK, WHITE]);
    // Seed (-3, 9) clamps to (0, 0) — the black pixel.
    expect(bits(floodMask(image, -3, 9, 1))).toEqual([1, 0]);
    // Seed (99, 0) clamps to (1, 0) — the white pixel.
    expect(bits(floodMask(image, 99, 0, 1))).toEqual([0, 1]);
  });

  it("treats a negative tolerance as 0 (seed-only region)", () => {
    const image = buf(2, 1, [BLACK, BLACK]);
    // tolerance -1 → clamped to 0; the identical neighbor still joins
    // (distance 0 ≤ 0), the seed always belongs.
    expect(bits(floodMask(image, 0, 0, -1))).toEqual([1, 1]);
  });

  it("is deterministic: two runs are deeply equal", () => {
    const image = buf(3, 3, [
      BLACK, grey(10), WHITE,
      grey(12), BLACK, WHITE,
      WHITE, WHITE, BLACK,
    ]);
    const a = floodMask(image, 0, 0, 40);
    const b = floodMask(image, 0, 0, 40);
    expect(a).toEqual(b);
  });
});

describe("brushMask (R7)", () => {
  it("includes exactly the pixels with dx² + dy² ≤ r²", () => {
    // radius 1 at the center of 3×3 → the plus shape (corners are at 2 > 1).
    const result = brushMask(3, 3, 1, 1, 1);
    expect(bits(result)).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
  });

  it("clips at the image edges", () => {
    // radius 1 at the top-left corner → only in-bounds arm pixels remain.
    const result = brushMask(2, 2, 0, 0, 1);
    expect(bits(result)).toEqual([1, 1, 1, 0]);
  });

  it("clamps the radius into [MIN_BRUSH_RADIUS, MAX_BRUSH_RADIUS]", () => {
    // radius 0 clamps to 1 — still the plus, not a single pixel.
    expect(bits(brushMask(3, 3, 1, 1, 0))).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    // an absurd radius clamps to MAX and simply covers a small image.
    expect(maskPixelCount(brushMask(2, 2, 0, 0, 10_000))).toBe(4);
  });
});

describe("mask set operations (R10–R12)", () => {
  it("maskPixelCount sums the set pixels", () => {
    expect(maskPixelCount(mask(2, 2, [1, 0, 1, 1]))).toBe(3);
    expect(maskPixelCount(mask(2, 2, [0, 0, 0, 0]))).toBe(0);
  });

  it("maskContains answers membership and is false out of bounds", () => {
    const m = mask(2, 2, [1, 0, 0, 1]);
    expect(maskContains(m, 0, 0)).toBe(true);
    expect(maskContains(m, 1, 0)).toBe(false);
    expect(maskContains(m, 1, 1)).toBe(true); // far corner, in bounds
    expect(maskContains(m, -1, 0)).toBe(false);
    expect(maskContains(m, 0, -1)).toBe(false);
    expect(maskContains(m, 2, 0)).toBe(false);
    expect(maskContains(m, 0, 2)).toBe(false);
  });

  it("subtractMask computes a ∧ ¬b as a new mask", () => {
    const a = mask(2, 2, [1, 1, 0, 0]);
    const b = mask(2, 2, [0, 1, 0, 1]);
    const result = subtractMask(a, b);
    expect(bits(result)).toEqual([1, 0, 0, 0]);
    // inputs untouched
    expect(bits(a)).toEqual([1, 1, 0, 0]);
    expect(bits(b)).toEqual([0, 1, 0, 1]);
  });

  it("unionMasks unions any number of masks; [] yields an empty mask", () => {
    const empty = unionMasks([], 2, 2);
    expect(empty).toEqual(mask(2, 2, [0, 0, 0, 0]));

    const result = unionMasks(
      [mask(2, 2, [1, 0, 0, 0]), mask(2, 2, [0, 0, 0, 1])],
      2,
      2,
    );
    expect(bits(result)).toEqual([1, 0, 0, 1]);
  });

  it("maskOutline keeps edge-exposed pixels and drops interior ones", () => {
    // Full 3×3 mask: the image edge counts as outside, so the ring is the
    // outline and ONLY the center is interior.
    const full = mask(3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(bits(maskOutline(full))).toEqual([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  });

  it("maskOutline exposes pixels via unmasked 4-neighbors on every side", () => {
    // Horizontal pair centered in 4×3: both pixels have unmasked left/right
    // or up/down neighbors → both are outline.
    const horizontal = mask(4, 3, [
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 0, 0, 0,
    ]);
    expect(bits(maskOutline(horizontal))).toEqual(bits(horizontal));

    // Vertical pair in 3×4 exercises the up/down-neighbor arms.
    const vertical = mask(3, 4, [
      0, 0, 0,
      0, 1, 0,
      0, 1, 0,
      0, 0, 0,
    ]);
    expect(bits(maskOutline(vertical))).toEqual(bits(vertical));
  });
});

describe("maskStats (R13)", () => {
  it("counts exact colors over masked pixels only, most common first", () => {
    const image = buf(2, 2, [BLACK, BLACK, WHITE, RED]);
    const selection = mask(2, 2, [1, 1, 1, 0]); // red excluded
    expect(maskStats(image, selection)).toEqual([
      { color: BLACK, count: 2 },
      { color: WHITE, count: 1 },
    ]);
  });

  it("breaks count ties by first row-major appearance", () => {
    const image = buf(2, 2, [WHITE, RED, RED, WHITE]);
    const all = mask(2, 2, [1, 1, 1, 1]);
    // Both colors count 2; white appears first at index 0.
    expect(maskStats(image, all)).toEqual([
      { color: WHITE, count: 2 },
      { color: RED, count: 2 },
    ]);
  });

  it("returns [] for an empty mask", () => {
    const image = buf(2, 1, [BLACK, WHITE]);
    expect(maskStats(image, mask(2, 1, [0, 0]))).toEqual([]);
  });
});

describe("parseHexInput (R14)", () => {
  it("parses 6-digit hex with or without the leading #", () => {
    expect(parseHexInput("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHexInput("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("parses 3-digit shorthand, case-insensitive, trimming whitespace", () => {
    expect(parseHexInput("  #0F0  ")).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseHexInput("ABC")).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("returns null for anything else without throwing", () => {
    expect(parseHexInput("zzz")).toBeNull();
    expect(parseHexInput("#12345")).toBeNull(); // 5 digits
    expect(parseHexInput("")).toBeNull();
    expect(parseHexInput("   ")).toBeNull();
    expect(parseHexInput("#ff00")).toBeNull();
  });
});

describe("applyFillToMask (R16)", () => {
  it("fills exactly the masked pixels, keeps alpha, and mutates nothing", () => {
    const image = buf(2, 2, [BLACK, WHITE, RED, BLACK]);
    image.data[3] = 128; // distinctive alpha on the first pixel
    const before = [...image.data];

    const selection = mask(2, 2, [1, 0, 0, 1]);
    const filled = applyFillToMask(image, selection, { r: 1, g: 2, b: 3 });

    expect(colorAtPixel(filled, 0, 0)).toEqual({ r: 1, g: 2, b: 3 });
    expect(colorAtPixel(filled, 1, 1)).toEqual({ r: 1, g: 2, b: 3 });
    expect(colorAtPixel(filled, 1, 0)).toEqual(WHITE); // unmasked untouched
    expect(colorAtPixel(filled, 0, 1)).toEqual(RED);
    expect(filled.data[3]).toBe(128); // alpha preserved

    expect([...image.data]).toEqual(before); // input never mutated
  });
});

describe("buildFlattenOverlay (R4, R10)", () => {
  const at = (out: Uint8ClampedArray, i: number) => [
    out[i * 4],
    out[i * 4 + 1],
    out[i * 4 + 2],
    out[i * 4 + 3],
  ];

  it("returns null when there is nothing to draw", () => {
    expect(
      buildFlattenOverlay({ width: 2, height: 2, hover: null, selection: null }),
    ).toBeNull();
  });

  it("draws only the hover outline when no selection exists", () => {
    // A 1-px hover mask is its own outline.
    const overlay = buildFlattenOverlay({
      width: 2,
      height: 1,
      hover: mask(2, 1, [1, 0]),
      selection: null,
    });
    expect(overlay).not.toBeNull();
    expect(at(overlay!, 0)).toEqual([...HOVER_OUTLINE_RGBA]);
    expect(at(overlay!, 1)).toEqual([0, 0, 0, 0]); // untouched → transparent
  });

  it("tints the selection interior and paints its outline at full alpha", () => {
    // Full 3×3 selection: ring = outline (full alpha), center = tint only.
    const overlay = buildFlattenOverlay({
      width: 3,
      height: 3,
      hover: null,
      selection: mask(3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]),
    });
    const [r, g, b] = SELECTION_OUTLINE_RGBA;
    expect(at(overlay!, 0)).toEqual([r, g, b, SELECTION_OUTLINE_RGBA[3]]);
    expect(at(overlay!, 4)).toEqual([r, g, b, SELECTION_FILL_ALPHA]); // center
  });

  it("paints hover last so it wins where the outlines overlap", () => {
    const overlapping = mask(2, 1, [1, 0]);
    const overlay = buildFlattenOverlay({
      width: 2,
      height: 1,
      hover: overlapping,
      selection: overlapping,
    });
    expect(at(overlay!, 0)).toEqual([...HOVER_OUTLINE_RGBA]);
  });
});
