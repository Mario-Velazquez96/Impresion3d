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
  DEFAULT_SMOOTH_TOLERANCE,
  HOVER_OUTLINE_RGBA,
  MAX_BRUSH_RADIUS,
  MAX_FLATTEN_HISTORY,
  MAX_RUNNER_UPS,
  MAX_TOLERANCE,
  MIN_BRUSH_RADIUS,
  MIN_TOLERANCE,
  SELECTION_FILL_ALPHA,
  SELECTION_OUTLINE_RGBA,
  STRAY_MARGIN_PX,
  STRAY_MAX_ISLAND_PX,
  TOLERANCE_STEP,
  addStrayIslands,
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
  recolorExact,
  smoothMask,
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

/** Image where the listed row-major indices are BLACK, the rest WHITE. */
function grid(width: number, height: number, blacks: number[]): PixelBuffer {
  const set = new Set(blacks);
  const colors: Rgb[] = [];
  for (let i = 0; i < width * height; i++) {
    colors.push(set.has(i) ? BLACK : WHITE);
  }
  return buf(width, height, colors);
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

// ---- Phase B (R6, R9, R17) --------------------------------------------------

describe("Phase B constants (pinned by spec)", () => {
  it("exports the smooth + stray tuning values", () => {
    expect(DEFAULT_SMOOTH_TOLERANCE).toBe(10);
    expect(STRAY_MAX_ISLAND_PX).toBe(16);
    expect(STRAY_MARGIN_PX).toBe(8);
  });
});

describe("smoothMask (R6)", () => {
  it("chains a gradient that floodMask rejects at the same tolerance", () => {
    // Evenly spaced greys: adjacent steps stay small while the ends drift far
    // from the seed color. Tolerance just under the seed→grey(20) distance:
    // flood stops after grey(10); smooth chains every step to the far end.
    const image = buf(5, 1, [
      grey(0),
      grey(10),
      grey(20),
      grey(30),
      grey(40),
    ]);
    const tol = colorDistance(grey(20), BLACK) - 0.001;

    expect(bits(floodMask(image, 0, 0, tol))).toEqual([1, 1, 0, 0, 0]);
    expect(bits(smoothMask(image, 0, 0, tol))).toEqual([1, 1, 1, 1, 1]);
  });

  it("stops at a neighbor step over the tolerance and includes one at the boundary", () => {
    // 3×1: seed | near | far. The near step sits exactly at the boundary
    // (included); the far step is a big jump (excluded).
    const near = grey(5);
    const image = buf(3, 1, [BLACK, near, grey(200)]);
    const step = colorDistance(near, BLACK);
    expect(bits(smoothMask(image, 0, 0, step))).toEqual([1, 1, 0]);
    expect(bits(smoothMask(image, 0, 0, step - 0.001))).toEqual([1, 0, 0]);
  });

  it("grows a uniform region in all four directions and clamps the seed", () => {
    // 3×3 uniform image: every step distance is 0, so a zero tolerance still
    // takes the whole image — exercising each neighbor arm and the
    // already-visited short-circuit as pixels are reached from two sides.
    const image = buf(3, 3, Array(9).fill(BLACK));
    expect(bits(smoothMask(image, 99, 99, 0))).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it("is deterministic: two runs are deeply equal", () => {
    const image = buf(3, 1, [BLACK, grey(6), grey(12)]);
    const a = smoothMask(image, 0, 0, 40);
    const b = smoothMask(image, 0, 0, 40);
    expect(a).toEqual(b);
  });
});

describe("addStrayIslands (R9)", () => {
  it("absorbs disconnected same-color islands and matching pixels within the margin", () => {
    // 6×1: region {0,1}. Index 2 is a matching pixel touching the region;
    // {4,5} is a disconnected matching island. All lie within the margin bbox.
    const image = buf(6, 1, [BLACK, BLACK, BLACK, WHITE, BLACK, BLACK]);
    const region = mask(6, 1, [1, 1, 0, 0, 0, 0]);
    const result = addStrayIslands(image, region, BLACK, 5);
    expect(bits(result)).toEqual([1, 1, 1, 0, 1, 1]);
    // The input mask is never mutated.
    expect(bits(region)).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it("rejects an island larger than STRAY_MAX_ISLAND_PX", () => {
    // 8×8: region is the lone pixel (0,0); a 5×5 (25 px > 16) black block sits
    // inside the margin bbox but exceeds the size cap, so it is not absorbed.
    const block: number[] = [];
    for (let y = 2; y <= 6; y++) {
      for (let x = 2; x <= 6; x++) {
        block.push(y * 8 + x);
      }
    }
    const image = grid(8, 8, [0, ...block]);
    const region = mask(8, 8, [1]);
    const result = addStrayIslands(image, region, BLACK, 5);
    expect(maskPixelCount(result)).toBe(1); // only the region pixel survives
    expect(result.data[0]).toBe(1);
  });

  it("rejects an island outside the margin-expanded bbox", () => {
    // 20×1: region {0}. A 1-px black stray at x=15 is beyond bbox+8 (x ≤ 8).
    const image = grid(20, 1, [0, 15]);
    const region = mask(20, 1, [1, ...Array(19).fill(0)]);
    const result = addStrayIslands(image, region, BLACK, 5);
    expect(maskPixelCount(result)).toBe(1);
    expect(result.data[15]).toBe(0);
  });

  it("is a no-op when there are no stray matches and when the mask is empty", () => {
    const image = buf(3, 1, [BLACK, WHITE, WHITE]);
    const region = mask(3, 1, [1, 0, 0]);
    expect(bits(addStrayIslands(image, region, BLACK, 5))).toEqual([1, 0, 0]);

    // An empty mask has no bbox to expand around → returned unchanged.
    const empty = mask(3, 1, [0, 0, 0]);
    expect(bits(addStrayIslands(image, empty, BLACK, 5))).toEqual([0, 0, 0]);
  });
});

describe("recolorExact (R17)", () => {
  it("swaps only exact matches, leaves near-misses, and mutates nothing", () => {
    const from: Rgb = { r: 10, g: 20, b: 30 };
    const image = buf(4, 1, [
      from,
      { r: 10, g: 20, b: 31 }, // near-miss on blue
      { r: 10, g: 21, b: 30 }, // near-miss on green
      { r: 11, g: 20, b: 30 }, // near-miss on red
    ]);
    image.data[3] = 128; // alpha on the exact-match pixel stays put
    const before = [...image.data];

    const result = recolorExact(image, from, BLACK);
    expect(colorAtPixel(result, 0, 0)).toEqual(BLACK);
    expect(colorAtPixel(result, 1, 0)).toEqual({ r: 10, g: 20, b: 31 });
    expect(colorAtPixel(result, 2, 0)).toEqual({ r: 10, g: 21, b: 30 });
    expect(colorAtPixel(result, 3, 0)).toEqual({ r: 11, g: 20, b: 30 });
    expect(result.data[3]).toBe(128); // alpha untouched

    expect([...image.data]).toEqual(before); // input never mutated
  });
});
