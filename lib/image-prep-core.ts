/**
 * The PURE CORE of the image prep tool (11_image_prep) — color math, adjustment
 * LUTs, the luminance histogram, median-cut quantization, Floyd–Steinberg
 * dithering, palette statistics/classification, the merge operations, catalog
 * snapping, and indexed→RGBA rendering (R2, R4–R15, R17).
 *
 * Framework-agnostic: no DOM, no Prisma, no React, and deliberately NO
 * `server-only`. It lives in `lib/` rather than `lib/services/` precisely
 * BECAUSE of that: services are server-only (they touch Prisma via the db
 * singleton), whereas this module is plain array math that the Client island
 * AND the Web Worker import directly — importing a server guard into either
 * bundle would break them. Being dependency-free also makes it unit-testable
 * to 100% branch coverage with tiny synthetic buffers and zero mocks (mirrors
 * lib/pricing-core.ts and lib/planning-core.ts).
 *
 * DETERMINISM IS A CONTRACT (R7): no Math.random, no Date, and every tie-break
 * is defined (lowest index wins) — the same input always yields the same
 * palette and output, so tests are exact rather than statistical.
 *
 * The tool is STATELESS: nothing here is ever persisted (R19).
 */

// ---- shared structures ------------------------------------------------------

export type Rgb = { r: number; g: number; b: number };

/** ImageData-compatible, but a plain object: constructible in Node tests. */
export type PixelBuffer = {
  width: number;
  height: number;
  /** RGBA, row-major, treated as fully opaque (alpha flattened at decode). */
  data: Uint8ClampedArray;
};

/** One quantized palette entry. `catalog` is set by `snapToCatalog` (R13). */
export type PaletteEntry = {
  color: Rgb;
  /** Pixels currently mapped to this entry — coverage is DERIVED from it. */
  count: number;
  catalog: { id: string; name: string; hex: string } | null;
};

/** The quantized working state. `indices` fits Uint8Array because N ≤ 32. */
export type IndexedImage = {
  width: number;
  height: number;
  indices: Uint8Array;
  entries: PaletteEntry[];
};

export type AdjustSettings = {
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  autoLevels: boolean;
};

// ---- constants (exported so tests + UI pin the same values) -----------------

/** Longest working side; larger decodes are proportionally downscaled (R4). */
export const MAX_WORKING_DIMENSION = 2048;
/** Upload size limit (R3). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Posterize color-count slider bounds and default (R7). */
export const MIN_COLORS = 2;
export const MAX_COLORS = 32;
export const DEFAULT_COLORS = 8;
/** HSL saturation below this is a "neutral" in the palette view (R9). */
export const NEUTRAL_SATURATION_THRESHOLD = 0.12;
/** Merge-similar default distance (redmean units; slider 0–150) (R11). */
export const DEFAULT_MERGE_DISTANCE = 40;
/** Merge-tiny default coverage threshold (percent; slider 0–20) (R12). */
export const DEFAULT_TINY_COVERAGE_PERCENT = 2;
/** Auto-levels percentile clip: stretch between the 0.5th/99.5th (R5). */
export const AUTO_LEVELS_CLIP = 0.005;

// ---- color math -------------------------------------------------------------

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parse `#RGB` or `#RRGGBB`, case-insensitive. Throws on malformed input —
 * callers pass catalog hexes or hexes this module produced, so a throw here
 * is a programming error surfaced loudly, not a user-input path.
 */
export function hexToRgb(hex: string): Rgb {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Malformed hex color: ${hex}`);
  }
  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : body;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex(c: Rgb): string {
  const channel = (v: number) => v.toString(16).padStart(2, "0");
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
}

/** Standard RGB→HSL: h in [0, 360), s and l in [0, 1]. */
export function rgbToHsl(c: Rgb): { h: number; s: number; l: number } {
  const rn = c.r / 255;
  const gn = c.g / 255;
  const bn = c.b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l }; // achromatic — greys have no hue
  }
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) {
    h = (gn - bn) / delta + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / delta + 2;
  } else {
    h = (rn - gn) / delta + 4;
  }
  return { h: h * 60, s, l };
}

/** Rec. 601 luma (`0.299R + 0.587G + 0.114B`), rounded to 0–255 (R6). */
export function luminance601(c: Rgb): number {
  return Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
}

/**
 * "Redmean" weighted-Euclidean color distance — the ONE metric used by
 * nearest-palette mapping, merge-similar, merge-tiny, and catalog snapping
 * (R11–R13), so all "nearest" judgements are consistent.
 */
export function colorDistance(a: Rgb, b: Rgb): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (3 + (255 - rMean) / 256) * db * db,
  );
}

/** Clamp to the displayable 0–255 range (every adjustment step clamps). */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ---- rendering / io edges ---------------------------------------------------

/**
 * Proportional downscale target: identity when the longest side already fits,
 * otherwise scale so the longest side equals `max` (R4).
 */
export function fitWithin(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) {
    return { width: w, height: h };
  }
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** `"photo.jpg"` → `"photo-prepped.png"` (R17). Keeps dotless names whole. */
export function downloadFileName(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}-prepped.png`;
}

/** Human-readable size for the upload caption, e.g. `"1.2 MB"` (R2). */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- stage 2: adjust (R5, R6) ----------------------------------------------

export const IDENTITY_ADJUSTMENTS: AdjustSettings = {
  brightness: 0,
  contrast: 0,
  gamma: 1.0,
  saturation: 0,
  autoLevels: false,
};

/**
 * The brightness → contrast → gamma pipeline collapsed into one 256-entry
 * lookup table (fixed order per R5), each step clamped to 0–255. With
 * identity settings the table degenerates to `lut[i] === i`.
 */
export function buildAdjustmentLut(s: AdjustSettings): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const offset = (s.brightness / 100) * 128;
  const factor = (s.contrast + 100) / 100;
  const invGamma = 1 / s.gamma;
  for (let i = 0; i < 256; i++) {
    let v = clamp255(i + offset);
    v = clamp255((v - 128) * factor + 128);
    v = clamp255(255 * Math.pow(v / 255, invGamma));
    lut[i] = Math.round(v);
  }
  return lut;
}

/** 256-bin Rec. 601 luminance histogram (R6). */
export function luminanceHistogram(src: PixelBuffer): Uint32Array {
  const hist = new Uint32Array(256);
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    hist[luminance601({ r: d[i], g: d[i + 1], b: d[i + 2] })]++;
  }
  return hist;
}

/**
 * Percentile-clipped bounds for the auto-levels stretch (R5): the lowest and
 * highest luminance bins after clipping `clip` of the pixels off each tail.
 * A flat (single-luma) image collapses to `low >= high` and returns the
 * identity range {0, 255} so the stretch divides by 255, never by zero.
 */
export function autoLevelsRange(
  hist: Uint32Array,
  clip: number = AUTO_LEVELS_CLIP,
): { low: number; high: number } {
  const total = hist.reduce((sum, count) => sum + count, 0);
  const clipCount = total * clip;
  let low = 0;
  let acc = 0;
  while (low < 255 && acc + hist[low] <= clipCount) {
    acc += hist[low];
    low++;
  }
  let high = 255;
  acc = 0;
  while (high > 0 && acc + hist[high] <= clipCount) {
    acc += hist[high];
    high--;
  }
  if (low >= high) {
    return { low: 0, high: 255 };
  }
  return { low, high };
}

/**
 * Apply the full adjustment stage in the fixed R5 order: LUT (brightness →
 * contrast → gamma) → saturation mix around Rec. 601 luma → optional
 * auto-levels stretch. Returns a NEW buffer; the source is never mutated.
 * Identity settings produce a pixel-identical copy.
 */
export function applyAdjustments(
  src: PixelBuffer,
  s: AdjustSettings,
): PixelBuffer {
  const out = new Uint8ClampedArray(src.data);
  const lut = buildAdjustmentLut(s);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = lut[out[i]];
    out[i + 1] = lut[out[i + 1]];
    out[i + 2] = lut[out[i + 2]];
  }
  if (s.saturation !== 0) {
    const mix = 1 + s.saturation / 100;
    for (let i = 0; i < out.length; i += 4) {
      const luma = luminance601({ r: out[i], g: out[i + 1], b: out[i + 2] });
      out[i] = Math.round(clamp255(luma + (out[i] - luma) * mix));
      out[i + 1] = Math.round(clamp255(luma + (out[i + 1] - luma) * mix));
      out[i + 2] = Math.round(clamp255(luma + (out[i + 2] - luma) * mix));
    }
  }
  if (s.autoLevels) {
    const hist = luminanceHistogram({
      width: src.width,
      height: src.height,
      data: out,
    });
    const { low, high } = autoLevelsRange(hist);
    const scale = 255 / (high - low);
    for (let i = 0; i < out.length; i += 4) {
      out[i] = Math.round(clamp255((out[i] - low) * scale));
      out[i + 1] = Math.round(clamp255((out[i + 1] - low) * scale));
      out[i + 2] = Math.round(clamp255((out[i + 2] - low) * scale));
    }
  }
  return { width: src.width, height: src.height, data: out };
}

// ---- stage 3: posterize (R7, R8) -------------------------------------------

type CutItem = { r: number; g: number; b: number; count: number; key: number };

/** Longest-axis range of a median-cut box; axis ties prefer r, then g. */
function longestAxisRange(box: CutItem[]): {
  axis: "r" | "g" | "b";
  range: number;
} {
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;
  for (const item of box) {
    minR = Math.min(minR, item.r);
    maxR = Math.max(maxR, item.r);
    minG = Math.min(minG, item.g);
    maxG = Math.max(maxG, item.g);
    minB = Math.min(minB, item.b);
    maxB = Math.max(maxB, item.b);
  }
  const rangeG = maxG - minG;
  const rangeB = maxB - minB;
  let axis: "r" | "g" | "b" = "r";
  let range = maxR - minR;
  if (rangeG > range) {
    axis = "g";
    range = rangeG;
  }
  if (rangeB > range) {
    axis = "b";
    range = rangeB;
  }
  return { axis, range };
}

/**
 * Deterministic median-cut palette (R7): boxes over RGB space; always split
 * the box with the largest longest-axis range (tie → lowest box index) at the
 * pixel-count-weighted median of that axis, until `n` boxes exist or no box
 * is splittable; each palette entry is the count-weighted mean of its box.
 * `n` clamps to 2–32. An image with k ≤ n distinct colors returns exactly
 * those k colors. An empty buffer returns an empty palette.
 */
export function medianCutPalette(src: PixelBuffer, n: number): Rgb[] {
  const target = Math.min(MAX_COLORS, Math.max(MIN_COLORS, Math.floor(n)));
  const counts = new Map<number, number>();
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return [];
  }
  const items: CutItem[] = [];
  for (const [key, count] of counts) {
    items.push({
      r: (key >> 16) & 255,
      g: (key >> 8) & 255,
      b: key & 255,
      count,
      key,
    });
  }
  // Canonical initial order — determinism must not depend on pixel order.
  items.sort((a, b) => a.key - b.key);

  const boxes: CutItem[][] = [items];
  while (boxes.length < target) {
    // The splittable (≥ 2 unique colors) box with the largest range; strict
    // `>` means the LOWEST index wins ties — a defined tie-break (R7).
    let bestIdx = -1;
    let bestRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) {
        continue;
      }
      const { range } = longestAxisRange(boxes[i]);
      if (range > bestRange) {
        bestRange = range;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      break; // every box is a single color — k < n distinct colors
    }
    const { axis } = longestAxisRange(boxes[bestIdx]);
    const sorted = [...boxes[bestIdx]].sort(
      (a, b) => a[axis] - b[axis] || a.key - b.key,
    );
    const total = sorted.reduce((sum, item) => sum + item.count, 0);
    let acc = 0;
    let split = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i].count;
      if (acc * 2 >= total) {
        split = i + 1;
        break;
      }
    }
    if (split === 0) {
      // A dominant last color holds more than half the pixels — split before it.
      split = sorted.length - 1;
    }
    boxes[bestIdx] = sorted.slice(0, split);
    boxes.push(sorted.slice(split));
  }

  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (const item of box) {
      r += item.r * item.count;
      g += item.g * item.count;
      b += item.b * item.count;
      count += item.count;
    }
    return {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count),
    };
  });
}

/** Redmean argmin over the palette; strict `<` → the lowest index wins ties. */
export function nearestIndex(c: Rgb, palette: Rgb[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dist = colorDistance(c, palette[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Map a source buffer onto a GIVEN palette (R7, R8): flat nearest-color
 * mapping, or Floyd–Steinberg error diffusion (7/16 right, 3/16 down-left,
 * 5/16 down, 1/16 down-right, accumulated values clamped to 0–255) when
 * `dither`. Exported separately from `quantize` so the dithering kernel is
 * pinnable against a hand-chosen palette in tests; `quantize` composes it
 * with `medianCutPalette`.
 */
export function mapToPalette(
  src: PixelBuffer,
  palette: Rgb[],
  dither: boolean,
): IndexedImage {
  const { width, height } = src;
  const indices = new Uint8Array(width * height);
  const entries: PaletteEntry[] = palette.map((color) => ({
    color: { ...color },
    count: 0,
    catalog: null,
  }));
  const d = src.data;

  if (dither) {
    const cur = new Float64Array(width * height * 3);
    for (let p = 0; p < width * height; p++) {
      cur[p * 3] = d[p * 4];
      cur[p * 3 + 1] = d[p * 4 + 1];
      cur[p * 3 + 2] = d[p * 4 + 2];
    }
    const spread = (p: number, er: number, eg: number, eb: number) => {
      cur[p * 3] += er;
      cur[p * 3 + 1] += eg;
      cur[p * 3 + 2] += eb;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const r = clamp255(cur[p * 3]);
        const g = clamp255(cur[p * 3 + 1]);
        const b = clamp255(cur[p * 3 + 2]);
        const idx = nearestIndex({ r, g, b }, palette);
        indices[p] = idx;
        entries[idx].count++;
        const chosen = palette[idx];
        const er = r - chosen.r;
        const eg = g - chosen.g;
        const eb = b - chosen.b;
        if (x + 1 < width) {
          spread(p + 1, (er * 7) / 16, (eg * 7) / 16, (eb * 7) / 16);
        }
        if (y + 1 < height) {
          if (x > 0) {
            spread(
              p + width - 1,
              (er * 3) / 16,
              (eg * 3) / 16,
              (eb * 3) / 16,
            );
          }
          spread(p + width, (er * 5) / 16, (eg * 5) / 16, (eb * 5) / 16);
          if (x + 1 < width) {
            spread(p + width + 1, er / 16, eg / 16, eb / 16);
          }
        }
      }
    }
  } else {
    // Flat mapping: memoize per unique source color (≤ working-size uniques).
    const cache = new Map<number, number>();
    for (let p = 0; p < width * height; p++) {
      const key = (d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2];
      let idx = cache.get(key);
      if (idx === undefined) {
        idx = nearestIndex(
          { r: d[p * 4], g: d[p * 4 + 1], b: d[p * 4 + 2] },
          palette,
        );
        cache.set(key, idx);
      }
      indices[p] = idx;
      entries[idx].count++;
    }
  }

  return { width, height, indices, entries };
}

/**
 * Posterize (R7, R8): derive the ≤ n color median-cut palette (n clamped to
 * 2–32), then map — flat or Floyd–Steinberg-dithered. Deterministic.
 */
export function quantize(
  src: PixelBuffer,
  n: number,
  dither: boolean,
): IndexedImage {
  return mapToPalette(src, medianCutPalette(src, n), dither);
}

// ---- stage 4: palette cleanup (R9–R12) --------------------------------------

/** Coverage is DERIVED from `count` — never stored, so it cannot drift (R9). */
export function coveragePercent(
  entry: PaletteEntry,
  image: IndexedImage,
): number {
  return (entry.count / (image.width * image.height)) * 100;
}

/**
 * Split entry indices into neutrals (HSL saturation strictly below
 * NEUTRAL_SATURATION_THRESHOLD — an entry AT the threshold is a color),
 * sorted by lightness descending (light→dark), and colors, sorted by hue
 * ascending (R9). Pure view ordering — the image is not mutated.
 */
export function classifyPalette(image: IndexedImage): {
  neutrals: number[];
  colors: number[];
} {
  const neutrals: number[] = [];
  const colors: number[] = [];
  image.entries.forEach((entry, i) => {
    if (rgbToHsl(entry.color).s < NEUTRAL_SATURATION_THRESHOLD) {
      neutrals.push(i);
    } else {
      colors.push(i);
    }
  });
  neutrals.sort(
    (a, b) =>
      rgbToHsl(image.entries[b].color).l - rgbToHsl(image.entries[a].color).l,
  );
  colors.sort(
    (a, b) =>
      rgbToHsl(image.entries[a].color).h - rgbToHsl(image.entries[b].color).h,
  );
  return { neutrals, colors };
}

/**
 * Merge entry `from` into entry `into` (R10): remap all `from` pixels to
 * `into`, sum their counts, and drop `from`. Pure — returns a fresh
 * IndexedImage; `from === into` is a no-op returning the input.
 */
export function mergeEntries(
  image: IndexedImage,
  from: number,
  into: number,
): IndexedImage {
  if (from === into) {
    return image;
  }
  const entries: PaletteEntry[] = image.entries.map((entry) => ({
    color: { ...entry.color },
    count: entry.count,
    catalog: entry.catalog ? { ...entry.catalog } : null,
  }));
  entries[into].count += entries[from].count;
  const newEntries = entries.filter((_, i) => i !== from);
  // old index → new index: `from` maps to `into`'s new slot; everything after
  // `from` shifts down one.
  const remap = new Uint8Array(image.entries.length);
  for (let i = 0; i < image.entries.length; i++) {
    const j = i === from ? into : i;
    remap[i] = j < from ? j : j - 1;
  }
  const indices = new Uint8Array(image.indices.length);
  for (let p = 0; p < image.indices.length; p++) {
    indices[p] = remap[image.indices[p]];
  }
  return { width: image.width, height: image.height, indices, entries: newEntries };
}

/**
 * Merge MANY entries into one survivor (R22): every entry listed in `from`
 * is remapped into `into`, its count summed onto it, and the absorbed entries
 * removed. `from` is deduped and any occurrence of `into` is ignored; with
 * nothing left to merge the input is returned unchanged. The survivor keeps
 * its color AND its catalog link. Pure — returns a fresh IndexedImage; like
 * `mergeEntries`, indices must be valid entry indices (the UI owns validity).
 */
export function mergeManyEntries(
  image: IndexedImage,
  from: number[],
  into: number,
): IndexedImage {
  const sources = [...new Set(from)].filter((i) => i !== into);
  if (sources.length === 0) {
    return image;
  }
  const removed = new Set(sources);
  const entries: PaletteEntry[] = image.entries.map((entry) => ({
    color: { ...entry.color },
    count: entry.count,
    catalog: entry.catalog ? { ...entry.catalog } : null,
  }));
  for (const i of sources) {
    entries[into].count += entries[i].count;
  }
  const newEntries = entries.filter((_, i) => !removed.has(i));
  // old index → new index: survivors keep their relative order (compacted
  // down); each absorbed index maps to the survivor's compacted slot.
  const compacted = new Uint8Array(image.entries.length);
  let next = 0;
  for (let i = 0; i < image.entries.length; i++) {
    if (!removed.has(i)) {
      compacted[i] = next++;
    }
  }
  const indices = new Uint8Array(image.indices.length);
  for (let p = 0; p < image.indices.length; p++) {
    const old = image.indices[p];
    indices[p] = compacted[removed.has(old) ? into : old];
  }
  return {
    width: image.width,
    height: image.height,
    indices,
    entries: newEntries,
  };
}

/**
 * Merge the selected entries into ONE new averaged color (R22): the
 * count-weighted average RGB (rounded per channel) of the deduped selection
 * replaces the entry at the LOWEST selected index; the other selected entries
 * are absorbed into it (pixels remapped, counts summed). The survivor's
 * `catalog` link is cleared — the averaged color is a new color, not a
 * snapped filament (the user can re-snap). Fewer than two distinct indices is
 * a no-op returning the input. A selection whose entries all have zero pixels
 * falls back to the unweighted mean so the result stays defined.
 */
export function mergeEntriesToAverage(
  image: IndexedImage,
  indices: number[],
): IndexedImage {
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  if (unique.length < 2) {
    return image;
  }
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (const i of unique) {
    const entry = image.entries[i];
    r += entry.color.r * entry.count;
    g += entry.color.g * entry.count;
    b += entry.color.b * entry.count;
    total += entry.count;
  }
  if (total === 0) {
    // Zero pixels across the whole selection (weighted sums are all 0 too):
    // average the colors unweighted instead of dividing by zero.
    for (const i of unique) {
      const entry = image.entries[i];
      r += entry.color.r;
      g += entry.color.g;
      b += entry.color.b;
    }
    total = unique.length;
  }
  const color: Rgb = {
    r: Math.round(r / total),
    g: Math.round(g / total),
    b: Math.round(b / total),
  };
  const survivor = unique[0];
  // Every absorbed index sits ABOVE the survivor (lowest selected index), so
  // the survivor's position is stable through the merge. `merged` is a fresh
  // image (sources are non-empty), so patching its entry stays pure.
  const merged = mergeManyEntries(image, unique.slice(1), survivor);
  merged.entries[survivor] = {
    color,
    count: merged.entries[survivor].count,
    catalog: null,
  };
  return merged;
}

/**
 * Repeatedly merge the closest pair of entries whose redmean distance is
 * strictly below `threshold` — the smaller-count entry is absorbed into the
 * larger (equal counts → the higher index into the lower, a defined
 * tie-break) — until no pair remains below the threshold (R11).
 */
export function mergeSimilar(
  image: IndexedImage,
  threshold: number,
): IndexedImage {
  let current = image;
  for (;;) {
    const entries = current.entries;
    let bestI = -1;
    let bestJ = -1;
    let bestDist = Infinity;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const dist = colorDistance(entries[i].color, entries[j].color);
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI === -1 || bestDist >= threshold) {
      return current;
    }
    const [from, into] =
      entries[bestI].count < entries[bestJ].count
        ? [bestI, bestJ]
        : [bestJ, bestI];
    current = mergeEntries(current, from, into);
  }
}

/**
 * Absorb every entry whose coverage is strictly below the percent threshold
 * into its nearest remaining entry by redmean distance, smallest entries
 * first, until every remaining entry meets the threshold or one entry
 * remains (R12).
 */
export function mergeTiny(
  image: IndexedImage,
  coveragePercentThreshold: number,
): IndexedImage {
  let current = image;
  while (current.entries.length > 1) {
    const total = current.width * current.height;
    let from = -1;
    let smallest = Infinity;
    current.entries.forEach((entry, i) => {
      const pct = (entry.count / total) * 100;
      if (pct < coveragePercentThreshold && entry.count < smallest) {
        smallest = entry.count;
        from = i;
      }
    });
    if (from === -1) {
      return current;
    }
    let into = -1;
    let bestDist = Infinity;
    current.entries.forEach((entry, i) => {
      if (i !== from) {
        const dist = colorDistance(current.entries[from].color, entry.color);
        if (dist < bestDist) {
          bestDist = dist;
          into = i;
        }
      }
    });
    current = mergeEntries(current, from, into);
  }
  return current;
}

// ---- stage 5: snap (R13, R14) -----------------------------------------------

/**
 * Remap each entry to the nearest catalog hex by redmean distance; entries
 * snapping to the same filament merge (counts summed, first-occurrence
 * order); resulting entries carry the `catalog` label and the catalog color
 * replaces `color` (R13). An empty catalog returns the input unchanged — the
 * UI disables the button anyway (R14).
 */
export function snapToCatalog(
  image: IndexedImage,
  catalog: { id: string; name: string; hex: string }[],
): IndexedImage {
  if (catalog.length === 0) {
    return image;
  }
  const catalogRgbs = catalog.map((item) => hexToRgb(item.hex));
  const groupOf = new Map<number, number>();
  const newEntries: PaletteEntry[] = [];
  const remap = new Uint8Array(image.entries.length);
  image.entries.forEach((entry, i) => {
    const catalogIdx = nearestIndex(entry.color, catalogRgbs);
    let group = groupOf.get(catalogIdx);
    if (group === undefined) {
      group = newEntries.length;
      groupOf.set(catalogIdx, group);
      const item = catalog[catalogIdx];
      newEntries.push({
        color: hexToRgb(item.hex),
        count: 0,
        catalog: { id: item.id, name: item.name, hex: item.hex },
      });
    }
    newEntries[group].count += entry.count;
    remap[i] = group;
  });
  const indices = new Uint8Array(image.indices.length);
  for (let p = 0; p < image.indices.length; p++) {
    indices[p] = remap[image.indices[p]];
  }
  return { width: image.width, height: image.height, indices, entries: newEntries };
}

// ---- rendering ---------------------------------------------------------------

/**
 * The palette-entry index at pixel (x, y) (R21). x/y are clamped into
 * `[0, width)` / `[0, height)` so a "Pick from image" click that lands on (or
 * just past) an edge still resolves to the nearest real pixel instead of
 * reading past the buffer. Pure — the DOM click→pixel geometry lives in the
 * component, so this stays unit-testable to 100% branch coverage.
 */
export function paletteIndexAt(
  image: IndexedImage,
  x: number,
  y: number,
): number {
  const cx = x < 0 ? 0 : x >= image.width ? image.width - 1 : x;
  const cy = y < 0 ? 0 : y >= image.height ? image.height - 1 : y;
  return image.indices[cy * image.width + cx];
}

/** Render an IndexedImage back to opaque RGBA for putImageData (R15). */
export function indexedToPixels(image: IndexedImage): PixelBuffer {
  const data = new Uint8ClampedArray(image.width * image.height * 4);
  for (let p = 0; p < image.indices.length; p++) {
    const color = image.entries[image.indices[p]].color;
    data[p * 4] = color.r;
    data[p * 4 + 1] = color.g;
    data[p * 4 + 2] = color.b;
    data[p * 4 + 3] = 255;
  }
  return { width: image.width, height: image.height, data };
}
