import { describe, expect, it } from "vitest";

/**
 * Pure-core tests for 11_image_prep (R2, R4–R15, R17) on tiny synthetic
 * buffers. Target: 100% BRANCH coverage — every tie-break, clamp, and edge is
 * pinned, because determinism is a contract (R7): the same input must always
 * produce the same palette and output.
 */

import {
  AUTO_LEVELS_CLIP,
  DEFAULT_COLORS,
  DEFAULT_MERGE_DISTANCE,
  DEFAULT_TINY_COVERAGE_PERCENT,
  IDENTITY_ADJUSTMENTS,
  MAX_COLORS,
  MAX_FILE_BYTES,
  MAX_WORKING_DIMENSION,
  MIN_COLORS,
  NEUTRAL_SATURATION_THRESHOLD,
  applyAdjustments,
  autoLevelsRange,
  buildAdjustmentLut,
  classifyPalette,
  colorDistance,
  coveragePercent,
  downloadFileName,
  fitWithin,
  formatByteSize,
  hexToRgb,
  indexedToPixels,
  luminance601,
  luminanceHistogram,
  mapToPalette,
  medianCutPalette,
  mergeEntries,
  mergeSimilar,
  mergeTiny,
  nearestIndex,
  paletteIndexAt,
  quantize,
  rgbToHex,
  rgbToHsl,
  snapToCatalog,
  type IndexedImage,
  type PaletteEntry,
  type PixelBuffer,
  type Rgb,
} from "@/lib/image-prep-core";

const grey = (v: number): Rgb => ({ r: v, g: v, b: v });

/** Build an opaque RGBA buffer from one Rgb per pixel, row-major. */
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

function makeImage(
  width: number,
  height: number,
  indices: number[],
  entries: PaletteEntry[],
): IndexedImage {
  return { width, height, indices: new Uint8Array(indices), entries };
}

const entry = (
  color: Rgb,
  count: number,
  catalog: PaletteEntry["catalog"] = null,
): PaletteEntry => ({ color, count, catalog });

describe("constants (pinned by the spec)", () => {
  it("exports the documented defaults", () => {
    expect(MAX_WORKING_DIMENSION).toBe(2048);
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
    expect(MIN_COLORS).toBe(2);
    expect(MAX_COLORS).toBe(32);
    expect(DEFAULT_COLORS).toBe(8);
    expect(NEUTRAL_SATURATION_THRESHOLD).toBe(0.12);
    expect(DEFAULT_MERGE_DISTANCE).toBe(40);
    expect(DEFAULT_TINY_COVERAGE_PERCENT).toBe(2);
    expect(AUTO_LEVELS_CLIP).toBe(0.005);
  });
});

describe("color math (R2, R9)", () => {
  it("hexToRgb parses #RRGGBB and #RGB, case-insensitively", () => {
    expect(hexToRgb("#00aaff")).toEqual({ r: 0, g: 170, b: 255 });
    expect(hexToRgb("#FFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#AbC")).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("hexToRgb throws on malformed input", () => {
    expect(() => hexToRgb("fff")).toThrow(/malformed/i);
    expect(() => hexToRgb("#ggg")).toThrow(/malformed/i);
    expect(() => hexToRgb("#1234")).toThrow(/malformed/i);
  });

  it("rgbToHex round-trips with hexToRgb", () => {
    expect(rgbToHex({ r: 0, g: 170, b: 255 })).toBe("#00aaff");
    expect(rgbToHex(hexToRgb("#123456"))).toBe("#123456");
  });

  it("rgbToHsl: greys are achromatic (s = 0, h = 0)", () => {
    const hsl = rgbToHsl(grey(128));
    expect(hsl.s).toBe(0);
    expect(hsl.h).toBe(0);
    expect(hsl.l).toBeCloseTo(128 / 255, 5);
  });

  it("rgbToHsl: known hues for the six primary/secondary sectors", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(rgbToHsl({ r: 0, g: 255, b: 0 }).h).toBe(120);
    expect(rgbToHsl({ r: 0, g: 0, b: 255 }).h).toBe(240);
    // r-max with g < b wraps through +6 → magenta at 300°.
    expect(rgbToHsl({ r: 255, g: 0, b: 255 }).h).toBe(300);
    // r-max with g > b: orange ≈ 30°.
    expect(rgbToHsl({ r: 255, g: 128, b: 0 }).h).toBeCloseTo(30.1, 1);
  });

  it("rgbToHsl: light colors use the l > 0.5 saturation denominator", () => {
    const light = rgbToHsl({ r: 255, g: 128, b: 128 });
    expect(light.l).toBeGreaterThan(0.5);
    expect(light.s).toBe(1);
  });

  it("luminance601: black 0, white 255, red 76", () => {
    expect(luminance601(grey(0))).toBe(0);
    expect(luminance601(grey(255))).toBe(255);
    expect(luminance601({ r: 255, g: 0, b: 0 })).toBe(76);
  });

  it("colorDistance: zero for identical, orders near below far", () => {
    expect(colorDistance(grey(50), grey(50))).toBe(0);
    const near = colorDistance(grey(0), grey(10));
    const far = colorDistance(grey(0), grey(255));
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(far);
  });
});

describe("io edges (R2, R4, R17)", () => {
  it("fitWithin is identity when the longest side already fits", () => {
    expect(fitWithin(100, 50, 2048)).toEqual({ width: 100, height: 50 });
  });

  it("fitWithin downscales proportionally on the longest side", () => {
    expect(fitWithin(4096, 2048, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(fitWithin(2048, 4096, 2048)).toEqual({ width: 1024, height: 2048 });
  });

  it("fitWithin never collapses a side below 1px", () => {
    expect(fitWithin(4096, 1, 2048)).toEqual({ width: 2048, height: 1 });
  });

  it("downloadFileName replaces the extension with -prepped.png", () => {
    expect(downloadFileName("photo.jpg")).toBe("photo-prepped.png");
    expect(downloadFileName("photo")).toBe("photo-prepped.png");
    expect(downloadFileName("my.photo.v2.png")).toBe("my.photo.v2-prepped.png");
    // A leading dot is not an extension separator.
    expect(downloadFileName(".hidden")).toBe(".hidden-prepped.png");
  });

  it("formatByteSize formats B, KB and MB", () => {
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(2048)).toBe("2.0 KB");
    expect(formatByteSize(1258291)).toBe("1.2 MB");
  });
});

describe("adjustments (R5)", () => {
  it("identity settings build an identity LUT", () => {
    const lut = buildAdjustmentLut(IDENTITY_ADJUSTMENTS);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i);
    }
  });

  it("identity settings leave pixels identical and return a NEW buffer", () => {
    const src = buf(2, 2, [grey(0), grey(128), { r: 10, g: 200, b: 30 }, grey(255)]);
    const before = [...src.data];
    const out = applyAdjustments(src, IDENTITY_ADJUSTMENTS);
    expect([...out.data]).toEqual(before);
    expect(out.data).not.toBe(src.data);
    expect([...src.data]).toEqual(before); // source unmutated
  });

  it("brightness raises values and clamps at 0/255", () => {
    const lut = buildAdjustmentLut({ ...IDENTITY_ADJUSTMENTS, brightness: 50 });
    expect(lut[128]).toBe(192); // +64
    const high = buildAdjustmentLut({ ...IDENTITY_ADJUSTMENTS, brightness: 100 });
    expect(high[200]).toBe(255); // 328 clamps
    const low = buildAdjustmentLut({ ...IDENTITY_ADJUSTMENTS, brightness: -100 });
    expect(low[50]).toBe(0); // -78 clamps
  });

  it("contrast spreads values around 128", () => {
    const lut = buildAdjustmentLut({ ...IDENTITY_ADJUSTMENTS, contrast: 100 });
    expect(lut[128]).toBe(128);
    expect(lut[100]).toBe(72); // (100-128)*2+128
    expect(lut[160]).toBe(192);
  });

  it("gamma 2.0 lifts midtones by the power curve", () => {
    const lut = buildAdjustmentLut({ ...IDENTITY_ADJUSTMENTS, gamma: 2 });
    // 255 * (64/255)^0.5 = 127.75 → 128
    expect(lut[64]).toBe(128);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it("saturation: greys are unchanged at any setting", () => {
    const src = buf(1, 1, [grey(90)]);
    const out = applyAdjustments(src, { ...IDENTITY_ADJUSTMENTS, saturation: 100 });
    expect([...out.data]).toEqual([90, 90, 90, 255]);
  });

  it("saturation -100 fully desaturates to the Rec. 601 luma", () => {
    const src = buf(1, 1, [{ r: 255, g: 0, b: 0 }]);
    const out = applyAdjustments(src, { ...IDENTITY_ADJUSTMENTS, saturation: -100 });
    expect([...out.data]).toEqual([76, 76, 76, 255]); // luma of pure red
  });

  it("saturation +100 doubles the distance from luma, clamped", () => {
    const src = buf(1, 1, [{ r: 150, g: 100, b: 100 }]);
    // luma = round(0.299·150 + 0.587·100 + 0.114·100) = 115
    const out = applyAdjustments(src, { ...IDENTITY_ADJUSTMENTS, saturation: 100 });
    expect([...out.data]).toEqual([185, 85, 85, 255]);

    const hot = applyAdjustments(buf(1, 1, [{ r: 255, g: 0, b: 0 }]), {
      ...IDENTITY_ADJUSTMENTS,
      saturation: 100,
    });
    expect([...hot.data]).toEqual([255, 0, 0, 255]); // 434/-76 clamp to 255/0
  });
});

describe("histogram + auto-levels (R5, R6)", () => {
  it("has 256 bins summing to the pixel count with known placement", () => {
    const src = buf(2, 2, [grey(0), grey(255), grey(128), grey(128)]);
    const hist = luminanceHistogram(src);
    expect(hist.length).toBe(256);
    expect(hist.reduce((a, b) => a + b, 0)).toBe(4);
    expect(hist[0]).toBe(1);
    expect(hist[255]).toBe(1);
    expect(hist[128]).toBe(2);
  });

  it("autoLevelsRange finds the percentile bounds (default clip)", () => {
    const hist = new Uint32Array(256);
    hist[10] = 50;
    hist[200] = 50;
    expect(autoLevelsRange(hist)).toEqual({ low: 10, high: 200 });
  });

  it("autoLevelsRange clips the tails with an explicit clip fraction", () => {
    const hist = new Uint32Array(256);
    hist[0] = 5;
    hist[10] = 45;
    hist[240] = 45;
    hist[255] = 5;
    // 10% clip swallows the 5-pixel tails on both ends.
    expect(autoLevelsRange(hist, 0.1)).toEqual({ low: 10, high: 240 });
  });

  it("autoLevelsRange: flat single-luma images return the identity range", () => {
    const mid = new Uint32Array(256);
    mid[100] = 42;
    expect(autoLevelsRange(mid)).toEqual({ low: 0, high: 255 });

    const black = new Uint32Array(256);
    black[0] = 4; // exercises the high-cursor floor at bin 0
    expect(autoLevelsRange(black)).toEqual({ low: 0, high: 255 });

    const white = new Uint32Array(256);
    white[255] = 4; // exercises the low-cursor ceiling at bin 255
    expect(autoLevelsRange(white)).toEqual({ low: 0, high: 255 });
  });

  it("applyAdjustments with autoLevels stretches a low-contrast buffer to full range", () => {
    const src = buf(2, 2, [grey(100), grey(100), grey(150), grey(150)]);
    const out = applyAdjustments(src, { ...IDENTITY_ADJUSTMENTS, autoLevels: true });
    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...out.data.slice(8, 12)]).toEqual([255, 255, 255, 255]);
  });
});

describe("median cut (R7)", () => {
  it("returns exactly the k distinct colors when k ≤ n", () => {
    const a = { r: 10, g: 20, b: 30 };
    const b = { r: 200, g: 100, b: 0 };
    const c = grey(255);
    const palette = medianCutPalette(buf(2, 2, [a, b, c, a]), 8);
    expect(palette).toHaveLength(3);
    expect(palette).toEqual(expect.arrayContaining([a, b, c]));
  });

  it("splits two clear clusters into their count-weighted means at n = 2", () => {
    const pixels = [
      grey(0), grey(0), grey(0), grey(10),
      grey(250), grey(250), grey(240), grey(240),
    ];
    const palette = medianCutPalette(buf(4, 2, pixels), 2);
    // left box mean (0·3 + 10·1)/4 = 2.5 → 3; right (250·2 + 240·2)/4 = 245
    expect(palette).toEqual([grey(3), grey(245)]);
  });

  it("clamps n to the 2–32 bounds", () => {
    const three = buf(3, 1, [grey(0), grey(100), grey(200)]);
    expect(medianCutPalette(three, 1)).toHaveLength(2);

    const many = buf(40, 1, Array.from({ length: 40 }, (_, i) => grey(i * 6)));
    expect(medianCutPalette(many, 50)).toHaveLength(32);
  });

  it("is deterministic: two runs are deeply equal", () => {
    const pixels = Array.from({ length: 16 }, (_, i) => ({
      r: (i * 37) % 256,
      g: (i * 91) % 256,
      b: (i * 53) % 256,
    }));
    const src = buf(4, 4, pixels);
    expect(medianCutPalette(src, 5)).toEqual(medianCutPalette(src, 5));
  });

  it("splits along the dominant green or blue axis", () => {
    const greenish = medianCutPalette(
      buf(2, 1, [{ r: 0, g: 0, b: 0 }, { r: 0, g: 200, b: 0 }]),
      2,
    );
    expect(greenish).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 0, g: 200, b: 0 },
    ]);
    const blueish = medianCutPalette(
      buf(2, 1, [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 200 }]),
      2,
    );
    expect(blueish).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 0, g: 0, b: 200 },
    ]);
  });

  it("breaks axis-value ties by color key when sorting a box", () => {
    const palette = medianCutPalette(
      buf(4, 1, [
        { r: 0, g: 0, b: 0 },
        { r: 0, g: 10, b: 0 },
        { r: 255, g: 0, b: 0 },
        { r: 255, g: 10, b: 0 },
      ]),
      2,
    );
    expect(palette).toEqual([
      { r: 0, g: 5, b: 0 },
      { r: 255, g: 5, b: 0 },
    ]);
  });

  it("prefers the wider of two splittable boxes on later iterations", () => {
    const palette = medianCutPalette(
      buf(4, 1, [grey(0), grey(100), grey(200), grey(210)]),
      3,
    );
    // {0,100} (range 100) splits before {200,210} (range 10); the split's
    // right half is appended, so the box order is 0, [200,210]-mean, 100.
    expect(palette).toEqual([grey(0), grey(205), grey(100)]);
  });

  it("splits before a dominant last color that holds over half the pixels", () => {
    const pixels = [grey(0), ...Array.from({ length: 10 }, () => ({ r: 200, g: 0, b: 0 }))];
    const palette = medianCutPalette(buf(11, 1, pixels), 2);
    expect(palette).toEqual([grey(0), { r: 200, g: 0, b: 0 }]);
  });

  it("returns an empty palette for an empty buffer", () => {
    expect(
      medianCutPalette({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, 8),
    ).toEqual([]);
  });

  it("nearestIndex picks the true nearest and ties break to the lowest index", () => {
    expect(nearestIndex(grey(5), [grey(255), grey(0)])).toBe(1);
    expect(nearestIndex(grey(5), [grey(0), grey(255)])).toBe(0);
    // Duplicate palette entries: strict < keeps the first.
    expect(nearestIndex(grey(100), [grey(100), grey(100), grey(0)])).toBe(0);
  });
});

describe("quantize + dither (R7, R8)", () => {
  const gradient8 = buf(
    8,
    1,
    [0, 36, 72, 108, 144, 180, 216, 252].map(grey),
  );

  it("flat quantize maps a gradient into contiguous bands with correct counts", () => {
    const image = quantize(gradient8, 2, false);
    expect(image.entries.map((e) => e.color)).toEqual([grey(54), grey(198)]);
    expect([...image.indices]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(image.entries.map((e) => e.count)).toEqual([4, 4]);
    expect(image.entries.reduce((s, e) => s + e.count, 0)).toBe(8);
    expect(image.entries.every((e) => e.catalog === null)).toBe(true);
  });

  it("clamps the requested color count", () => {
    expect(quantize(gradient8, 1, false).entries).toHaveLength(2);
  });

  it("matches the hand-computed 2×2 Floyd–Steinberg diffusion exactly", () => {
    // All-128 grey vs a black/white palette. 128 is nearer white (Δ127 < Δ128
    // under redmean, whose grey weight-sum is constant), so:
    //  p0 → white, err −127: p1 += −55.5625 → 72.4375 → black (err 72.4375)
    //  p2 += −39.6875 → 88.3125, then +13.582 → 101.895 → black
    //  p3 += −7.9375 + 22.637 → 142.699, then +44.579 → 187.278 → white
    const src = buf(2, 2, [grey(128), grey(128), grey(128), grey(128)]);
    const image = mapToPalette(src, [grey(0), grey(255)], true);
    expect([...image.indices]).toEqual([1, 0, 0, 1]);
    expect(image.entries.map((e) => e.count)).toEqual([2, 2]);
  });

  it("dither off maps flat; dither on produces the alternating FS pattern", () => {
    const src = buf(4, 1, [grey(126), grey(126), grey(126), grey(126)]);
    const flat = mapToPalette(src, [grey(0), grey(255)], false);
    expect([...flat.indices]).toEqual([0, 0, 0, 0]); // one flat band
    const dithered = mapToPalette(src, [grey(0), grey(255)], true);
    expect([...dithered.indices]).toEqual([0, 1, 0, 1]); // error diffusion kicks in
  });

  it("quantize is deterministic end to end", () => {
    const a = quantize(gradient8, 3, true);
    const b = quantize(gradient8, 3, true);
    expect([...a.indices]).toEqual([...b.indices]);
    expect(a.entries).toEqual(b.entries);
  });
});

describe("palette stats + classification (R9)", () => {
  const image = makeImage(
    7,
    1,
    [0, 0, 1, 2, 2, 2, 2],
    [
      entry(grey(200), 2), // light neutral
      entry(grey(50), 1), // dark neutral
      entry({ r: 0, g: 200, b: 0 }, 4), // green, h = 120
    ],
  );

  it("coveragePercent derives from counts and sums to 100", () => {
    const total = image.entries.reduce(
      (sum, e) => sum + coveragePercent(e, image),
      0,
    );
    expect(total).toBeCloseTo(100, 10);
    expect(coveragePercent(image.entries[2], image)).toBeCloseTo(400 / 7, 5);
  });

  it("splits neutrals (light→dark) from colors (hue ascending)", () => {
    const withRed = makeImage(
      8,
      1,
      [0, 0, 1, 2, 2, 2, 2, 3],
      [...image.entries.map((e) => ({ ...e })), entry({ r: 200, g: 0, b: 0 }, 1)],
    );
    const { neutrals, colors } = classifyPalette(withRed);
    expect(neutrals).toEqual([0, 1]); // light grey before dark grey
    expect(colors).toEqual([3, 2]); // red (h 0) before green (h 120)
  });

  it("the neutral comparison is strict <: near-threshold saturations land as documented", () => {
    // s ≈ 0.102 < 0.12 → neutral; s ≈ 0.124 ≥ 0.12 → color. (An entry with s
    // EXACTLY 0.12 is not representable in float from 8-bit channels; the
    // documented strict-< comparison is pinned by these two neighbors.)
    const boundary = makeImage(2, 1, [0, 1], [
      entry({ r: 135, g: 110, b: 110 }, 1),
      entry({ r: 141, g: 110, b: 110 }, 1),
    ]);
    expect(rgbToHsl(boundary.entries[0].color).s).toBeLessThan(0.12);
    expect(rgbToHsl(boundary.entries[1].color).s).toBeGreaterThanOrEqual(0.12);
    const { neutrals, colors } = classifyPalette(boundary);
    expect(neutrals).toEqual([0]);
    expect(colors).toEqual([1]);
  });
});

describe("merges (R10, R11, R12)", () => {
  const base = () =>
    makeImage(2, 2, [0, 1, 2, 0], [
      entry(grey(0), 2),
      entry(grey(100), 1),
      entry(grey(200), 1),
    ]);

  it("mergeEntries remaps pixels, sums counts, and drops the source", () => {
    const image = base();
    const merged = mergeEntries(image, 0, 2);
    expect(merged.entries).toEqual([entry(grey(100), 1), entry(grey(200), 3)]);
    expect([...merged.indices]).toEqual([1, 0, 1, 1]);
    // input untouched (pure)
    expect([...image.indices]).toEqual([0, 1, 2, 0]);
    expect(image.entries[2].count).toBe(1);
  });

  it("mergeEntries handles from > into (indices above `from` shift down)", () => {
    const merged = mergeEntries(base(), 2, 0);
    expect(merged.entries).toEqual([entry(grey(0), 3), entry(grey(100), 1)]);
    expect([...merged.indices]).toEqual([0, 1, 0, 0]);
  });

  it("mergeEntries preserves catalog labels and no-ops on from === into", () => {
    const labeled = makeImage(1, 2, [0, 1], [
      entry(grey(0), 1, { id: "c1", name: "Negro", hex: "#000000" }),
      entry(grey(255), 1),
    ]);
    const merged = mergeEntries(labeled, 1, 0);
    expect(merged.entries).toEqual([
      entry(grey(0), 2, { id: "c1", name: "Negro", hex: "#000000" }),
    ]);

    const image = base();
    expect(mergeEntries(image, 1, 1)).toBe(image);
  });

  it("mergeSimilar merges the closest sub-threshold pair, smaller count absorbed, until done", () => {
    const image = makeImage(3, 2, [0, 1, 1, 1, 2, 2], [
      entry(grey(0), 1),
      entry(grey(5), 3),
      entry({ r: 200, g: 0, b: 0 }, 2),
    ]);
    const merged = mergeSimilar(image, 40);
    // black (count 1) absorbed into near-black (count 3); red is too far.
    expect(merged.entries).toEqual([
      entry(grey(5), 4),
      entry({ r: 200, g: 0, b: 0 }, 2),
    ]);
    expect([...merged.indices]).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it("mergeSimilar: the threshold is strict (distance == threshold does not merge)", () => {
    const image = makeImage(2, 1, [0, 1], [entry(grey(0), 1), entry(grey(10), 1)]);
    const d = colorDistance(grey(0), grey(10));
    expect(mergeSimilar(image, d)).toBe(image); // untouched below-strict
    const merged = mergeSimilar(image, d + 0.001);
    expect(merged.entries).toHaveLength(1);
    // equal counts → the higher index is absorbed into the lower
    expect(merged.entries[0]).toEqual(entry(grey(0), 2));
  });

  it("mergeSimilar leaves single-entry and distant palettes untouched", () => {
    const single = makeImage(1, 1, [0], [entry(grey(0), 1)]);
    expect(mergeSimilar(single, 150)).toBe(single);
    const distant = makeImage(2, 1, [0, 1], [entry(grey(0), 1), entry(grey(255), 1)]);
    expect(mergeSimilar(distant, 10)).toBe(distant);
  });

  it("mergeTiny absorbs sub-threshold entries smallest-first into the nearest color", () => {
    const image = makeImage(10, 1, [0, 1, 2, 2, 2, 2, 2, 2, 2, 2], [
      entry(grey(0), 1), // 10%
      entry(grey(10), 1), // 10%
      entry(grey(255), 8), // 80%
    ]);
    const merged = mergeTiny(image, 15);
    // Ties break to the lowest index: entry 0 goes first, into its nearest
    // (entry 1), which then sits at 20% ≥ 15% and survives.
    expect(merged.entries).toEqual([entry(grey(10), 2), entry(grey(255), 8)]);
  });

  it("mergeTiny stops at one entry when everything is below the threshold", () => {
    const image = makeImage(10, 1, [0, 1, 2, 2, 2, 2, 2, 2, 2, 2], [
      entry(grey(0), 1),
      entry(grey(10), 1),
      entry(grey(255), 8),
    ]);
    const merged = mergeTiny(image, 95);
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0].count).toBe(10);
  });

  it("mergeTiny: the threshold is strict (coverage == threshold survives)", () => {
    const image = makeImage(10, 1, [0, 0, 1, 1, 1, 1, 1, 1, 1, 1], [
      entry(grey(0), 2), // exactly 20%
      entry(grey(255), 8),
    ]);
    expect(mergeTiny(image, 20)).toBe(image);
  });
});

describe("snap to catalog (R13, R14, R15)", () => {
  const catalog = [
    { id: "red", name: "Rojo", hex: "#ff0000" },
    { id: "blue", name: "Azul", hex: "#0000ff" },
  ];

  it("maps each entry to its nearest filament, merging same-target entries", () => {
    const image = makeImage(3, 2, [0, 0, 0, 1, 2, 2], [
      entry({ r: 250, g: 10, b: 10 }, 3),
      entry({ r: 200, g: 0, b: 0 }, 1),
      entry({ r: 10, g: 10, b: 250 }, 2),
    ]);
    const snapped = snapToCatalog(image, catalog);
    expect(snapped.entries).toEqual([
      entry({ r: 255, g: 0, b: 0 }, 4, { id: "red", name: "Rojo", hex: "#ff0000" }),
      entry({ r: 0, g: 0, b: 255 }, 2, { id: "blue", name: "Azul", hex: "#0000ff" }),
    ]);
    expect([...snapped.indices]).toEqual([0, 0, 0, 0, 1, 1]);
    // input untouched (pure)
    expect(image.entries[0].catalog).toBeNull();
  });

  it("returns the input unchanged for an empty catalog", () => {
    const image = makeImage(1, 1, [0], [entry(grey(0), 1)]);
    expect(snapToCatalog(image, [])).toBe(image);
  });

  it("paletteIndexAt reads the entry index at (x, y), clamping out-of-bounds (R21)", () => {
    // 3×2 indices, row-major:
    //   row 0: 0 1 2
    //   row 1: 2 1 0
    const image = makeImage(
      3,
      2,
      [0, 1, 2, 2, 1, 0],
      [entry(grey(0), 2), entry(grey(128), 2), entry({ r: 200, g: 0, b: 0 }, 2)],
    );
    // In-bounds (both else branches).
    expect(paletteIndexAt(image, 0, 0)).toBe(0);
    expect(paletteIndexAt(image, 1, 0)).toBe(1);
    expect(paletteIndexAt(image, 2, 1)).toBe(0);
    // Edge coordinates (last valid column / row).
    expect(paletteIndexAt(image, 2, 0)).toBe(2);
    expect(paletteIndexAt(image, 0, 1)).toBe(2);
    // Out-of-bounds low clamps to 0 on each axis.
    expect(paletteIndexAt(image, -5, 0)).toBe(0);
    expect(paletteIndexAt(image, 1, -5)).toBe(1);
    // Out-of-bounds high clamps to width-1 / height-1.
    expect(paletteIndexAt(image, 99, 0)).toBe(2); // → (2, 0)
    expect(paletteIndexAt(image, 0, 99)).toBe(2); // → (0, 1)
    expect(paletteIndexAt(image, 99, 99)).toBe(0); // → (2, 1)
  });

  it("indexedToPixels renders exact palette colors per index, fully opaque", () => {
    const image = makeImage(2, 1, [1, 0], [
      entry({ r: 1, g: 2, b: 3 }, 1),
      entry({ r: 200, g: 100, b: 50 }, 1),
    ]);
    const pixels = indexedToPixels(image);
    expect([...pixels.data]).toEqual([200, 100, 50, 255, 1, 2, 3, 255]);
    expect(pixels.width).toBe(2);
    expect(pixels.height).toBe(1);
  });
});
