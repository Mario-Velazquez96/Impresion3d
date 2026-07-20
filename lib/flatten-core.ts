/**
 * Pure core for the image-prep FLATTEN stage (12_flatten). A SIBLING of
 * `lib/image-prep-core.ts`, not an extension of it: flatten introduces a
 * second, distinct domain — binary masks, region growing, overlay painting —
 * with its own constant set, and a separate file keeps both cores reviewable
 * and keeps each file's 100%-branch coverage target honest. The dependency
 * direction is one-way: this module imports `Rgb`/`PixelBuffer`/
 * `colorDistance`/hex helpers from `image-prep-core`, never the reverse.
 *
 * Same contract as its sibling: no DOM beyond typed arrays, no React, no
 * `server-only`, no new dependency; every function is pure (new buffers out,
 * inputs never mutated) and deterministic (FIFO BFS with a fixed neighbor
 * order, documented tie-breaks, no randomness).
 *
 * Phase A ships the flood/brush mask builders, mask set operations, selection
 * statistics, fill application, and the canvas overlay builder (R5, R7,
 * R10–R16). Phase B adds the smooth mask builder, stray-island capture, and
 * exact-color recolor (R6, R9, R17). Phase C adds remove-small-regions (the
 * shared algorithm behind Despeckle and the Low/Medium/High presets) and the
 * zoom/pan view math (R18, R19, R23).
 */

import {
  colorDistance,
  hexToRgb,
  type PixelBuffer,
  type Rgb,
} from "@/lib/image-prep-core";

// ---- types ------------------------------------------------------------------

/** Binary mask over an image; `data[y * width + x]` is 0 | 1. */
export type Mask = { width: number; height: number; data: Uint8Array };

/** The three hover-mask tools: flood (R5), smooth (R6), brush (R7). */
export type MaskMode = "flood" | "smooth" | "brush";

/** One exact color and how many masked pixels carry it (R13). */
export type ColorCount = { color: Rgb; count: number };

/**
 * Flatten-canvas view: a CSS-transform zoom + pan in canvas-box pixels (R23).
 * The transform wrapper renders `translate(panX, panY) scale(zoom)` with a
 * top-left origin, so a content point `c` maps to screen `pan + zoom · c`.
 */
export type ViewTransform = { zoom: number; panX: number; panY: number };

// ---- constants (exported so tests + UI pin the same values) -----------------

/** Default flood tolerance, in redmean `colorDistance` units (R5). */
export const DEFAULT_FLOOD_TOLERANCE = 24;
/**
 * Default smooth tolerance (R6). Smooth compares NEIGHBORING pixels rather
 * than every pixel against the seed, so a smaller per-step value still chains
 * across a wide gradient — hence a lower default than flood.
 */
export const DEFAULT_SMOOTH_TOLERANCE = 10;
export const MIN_TOLERANCE = 0;
export const MAX_TOLERANCE = 150;
/** W/S tolerance step for flood/smooth (R8). */
export const TOLERANCE_STEP = 4;

/** Largest disconnected island the catch-strays option will absorb (R9). */
export const STRAY_MAX_ISLAND_PX = 16;
/** How far outside the main region's bbox a stray island may sit (R9). */
export const STRAY_MARGIN_PX = 8;

export const DEFAULT_BRUSH_RADIUS = 8;
export const MIN_BRUSH_RADIUS = 1;
export const MAX_BRUSH_RADIUS = 100;
/** W/S radius step for the brush (R8). */
export const BRUSH_RADIUS_STEP = 2;

/** How many next-most-common colors the fill panel offers (R13). */
export const MAX_RUNNER_UPS = 6;

/** Bounded flatten undo history — oldest snapshots drop first (R20). */
export const MAX_FLATTEN_HISTORY = 12;

/** Despeckle threshold: isolated stray pixels/pairs — HueForge spikes (R19). */
export const DESPECKLE_MAX_REGION_PX = 2;
/**
 * Auto-flatten preset thresholds (R18): a preset recolors every 4-connected
 * exact-color region whose area is at or below the level's value to its most
 * common border color. Low nudges away specks; High collapses larger patches.
 */
export const PRESET_MAX_REGION_PX = { low: 8, medium: 32, high: 128 } as const;

/** Zoom limits and per-notch factor for the flatten canvas (R23). */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 16;
export const ZOOM_FACTOR = 1.25;
/** The reset view: zoom 1, no pan (R1, R23). */
export const IDENTITY_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

/** Hover-mask outline color (white), RGBA (R4). */
export const HOVER_OUTLINE_RGBA = [255, 255, 255, 230] as const;
/** Selection outline color (Tailwind blue-500), RGBA (R10). */
export const SELECTION_OUTLINE_RGBA = [59, 130, 246, 255] as const;
/** Alpha of the faint tint painted over selected pixels (R10). */
export const SELECTION_FILL_ALPHA = 56;

// ---- pixel access -----------------------------------------------------------

/** The exact color at (x, y), coordinates clamped into bounds (R15). */
export function colorAtPixel(src: PixelBuffer, x: number, y: number): Rgb {
  const cx = Math.min(src.width - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(src.height - 1, Math.max(0, Math.floor(y)));
  const offset = (cy * src.width + cx) * 4;
  return {
    r: src.data[offset],
    g: src.data[offset + 1],
    b: src.data[offset + 2],
  };
}

// ---- mask builders (R5, R7) -------------------------------------------------

/**
 * Flood mask (R5): the 4-connected region of pixels reachable from the seed
 * whose redmean distance FROM THE SEED PIXEL'S COLOR is ≤ `tolerance`.
 * FIFO BFS with a fixed neighbor order (left, right, up, down) makes the
 * result deterministic; the seed is clamped into bounds and always included
 * (its own distance is 0; negative tolerances are treated as 0).
 */
export function floodMask(
  src: PixelBuffer,
  seedX: number,
  seedY: number,
  tolerance: number,
): Mask {
  const { width, height, data } = src;
  const sx = Math.min(width - 1, Math.max(0, Math.floor(seedX)));
  const sy = Math.min(height - 1, Math.max(0, Math.floor(seedY)));
  const tol = Math.max(0, tolerance);
  const seed = colorAtPixel(src, sx, sy);

  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const start = sy * width + sx;
  visited[start] = 1;
  mask[start] = 1;
  queue[tail++] = start;

  const tryPixel = (index: number) => {
    if (visited[index] === 1) {
      return;
    }
    visited[index] = 1;
    const offset = index * 4;
    const color = {
      r: data[offset],
      g: data[offset + 1],
      b: data[offset + 2],
    };
    if (colorDistance(color, seed) <= tol) {
      mask[index] = 1;
      queue[tail++] = index;
    }
  };

  const lastRowStart = width * (height - 1);
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) {
      tryPixel(index - 1);
    }
    if (x < width - 1) {
      tryPixel(index + 1);
    }
    if (index >= width) {
      tryPixel(index - width);
    }
    if (index < lastRowStart) {
      tryPixel(index + width);
    }
  }

  return { width, height, data: mask };
}

/**
 * Smooth mask (R6): the 4-connected region reachable from the seed by steps
 * whose redmean distance BETWEEN NEIGHBORING pixels is ≤ `tolerance` (local
 * chaining), so gradients and skies that drift far from the seed color are
 * still captured. Same deterministic FIFO BFS and fixed neighbor order as
 * `floodMask`; the difference is purely the inclusion test (neighbor-vs-current
 * instead of neighbor-vs-seed).
 */
export function smoothMask(
  src: PixelBuffer,
  seedX: number,
  seedY: number,
  tolerance: number,
): Mask {
  const { width, height, data } = src;
  const sx = Math.min(width - 1, Math.max(0, Math.floor(seedX)));
  const sy = Math.min(height - 1, Math.max(0, Math.floor(seedY)));
  const tol = Math.max(0, tolerance);

  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const start = sy * width + sx;
  visited[start] = 1;
  mask[start] = 1;
  queue[tail++] = start;

  const lastRowStart = width * (height - 1);
  while (head < tail) {
    const index = queue[head++];
    const currentOffset = index * 4;
    const current = {
      r: data[currentOffset],
      g: data[currentOffset + 1],
      b: data[currentOffset + 2],
    };
    const tryPixel = (neighbor: number) => {
      if (visited[neighbor] === 1) {
        return;
      }
      visited[neighbor] = 1;
      const offset = neighbor * 4;
      const color = {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
      };
      if (colorDistance(color, current) <= tol) {
        mask[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    };
    const x = index % width;
    if (x > 0) {
      tryPixel(index - 1);
    }
    if (x < width - 1) {
      tryPixel(index + 1);
    }
    if (index >= width) {
      tryPixel(index - width);
    }
    if (index < lastRowStart) {
      tryPixel(index + width);
    }
  }

  return { width, height, data: mask };
}

/**
 * Brush mask (R7): the filled circle `dx² + dy² ≤ r²` centered on the cursor,
 * clipped to the image bounds; the radius is clamped to
 * [MIN_BRUSH_RADIUS, MAX_BRUSH_RADIUS].
 */
export function brushMask(
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): Mask {
  const r = Math.min(
    MAX_BRUSH_RADIUS,
    Math.max(MIN_BRUSH_RADIUS, Math.floor(radius)),
  );
  const centerX = Math.floor(cx);
  const centerY = Math.floor(cy);
  const mask = new Uint8Array(width * height);
  const x0 = Math.max(0, centerX - r);
  const x1 = Math.min(width - 1, centerX + r);
  const y0 = Math.max(0, centerY - r);
  const y1 = Math.min(height - 1, centerY + r);
  const rSquared = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= rSquared) {
        mask[y * width + x] = 1;
      }
    }
  }
  return { width, height, data: mask };
}

/**
 * Catch-stray-islands expansion (R9): given a hover `mask` and the seed color,
 * return a NEW mask that also includes every 4-connected component of
 * seed-color-matching pixels (redmean distance ≤ `tolerance`) that is disjoint
 * from `mask`, has an area ≤ `STRAY_MAX_ISLAND_PX`, and lies fully inside
 * `mask`'s bounding box expanded by `STRAY_MARGIN_PX` on each side (clipped to
 * the image). Component discovery is row-major and BFS is FIFO with the fixed
 * neighbor order, so the result is deterministic. An empty input mask (nothing
 * to expand around) is returned unchanged; the input mask is never mutated.
 */
export function addStrayIslands(
  src: PixelBuffer,
  mask: Mask,
  seedColor: Rgb,
  tolerance: number,
): Mask {
  const { width, height } = mask;
  const { data } = src;
  const tol = Math.max(0, tolerance);
  const out = mask.data.slice();

  // Bounding box of the main region (Math.min/max — no branching).
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask.data[y * width + x] === 1) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) {
    return { width, height, data: out }; // empty mask — nothing to expand around
  }
  const bx0 = Math.max(0, minX - STRAY_MARGIN_PX);
  const by0 = Math.max(0, minY - STRAY_MARGIN_PX);
  const bx1 = Math.min(width - 1, maxX + STRAY_MARGIN_PX);
  const by1 = Math.min(height - 1, maxY + STRAY_MARGIN_PX);

  const matches = (index: number): boolean => {
    const offset = index * 4;
    const color = {
      r: data[offset],
      g: data[offset + 1],
      b: data[offset + 2],
    };
    return colorDistance(color, seedColor) <= tol;
  };

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const lastRowStart = width * (height - 1);

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const startIndex = sy * width + sx;
      if (
        visited[startIndex] === 1 ||
        mask.data[startIndex] === 1 ||
        !matches(startIndex)
      ) {
        visited[startIndex] = 1;
        continue;
      }
      // BFS this component of matching, non-mask pixels; track its extent.
      let head = 0;
      let tail = 0;
      visited[startIndex] = 1;
      queue[tail++] = startIndex;
      const component: number[] = [];
      let cMinX = width;
      let cMinY = height;
      let cMaxX = -1;
      let cMaxY = -1;
      while (head < tail) {
        const index = queue[head++];
        component.push(index);
        const x = index % width;
        const y = (index - x) / width;
        cMinX = Math.min(cMinX, x);
        cMaxX = Math.max(cMaxX, x);
        cMinY = Math.min(cMinY, y);
        cMaxY = Math.max(cMaxY, y);
        const tryPixel = (neighbor: number) => {
          if (
            visited[neighbor] === 1 ||
            mask.data[neighbor] === 1 ||
            !matches(neighbor)
          ) {
            visited[neighbor] = 1;
            return;
          }
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        };
        if (x > 0) {
          tryPixel(index - 1);
        }
        if (x < width - 1) {
          tryPixel(index + 1);
        }
        if (index >= width) {
          tryPixel(index - width);
        }
        if (index < lastRowStart) {
          tryPixel(index + width);
        }
      }
      const insideBox =
        cMinX >= bx0 && cMaxX <= bx1 && cMinY >= by0 && cMaxY <= by1;
      if (insideBox && component.length <= STRAY_MAX_ISLAND_PX) {
        for (const index of component) {
          out[index] = 1;
        }
      }
    }
  }

  return { width, height, data: out };
}

// ---- mask set operations (R10–R12) ------------------------------------------

/** Number of pixels set in the mask. */
export function maskPixelCount(mask: Mask): number {
  let count = 0;
  for (let i = 0; i < mask.data.length; i++) {
    count += mask.data[i];
  }
  return count;
}

/** Whether (x, y) is set; out-of-bounds coordinates are simply `false`. */
export function maskContains(mask: Mask, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
    return false;
  }
  return mask.data[y * mask.width + x] === 1;
}

/** `a ∧ ¬b` as a new mask (used to keep stored regions disjoint, R10). */
export function subtractMask(a: Mask, b: Mask): Mask {
  const data = new Uint8Array(a.width * a.height);
  for (let i = 0; i < data.length; i++) {
    data[i] = a.data[i] === 1 && b.data[i] === 0 ? 1 : 0;
  }
  return { width: a.width, height: a.height, data };
}

/** Union of the given masks; `[]` yields an empty mask of the given size. */
export function unionMasks(masks: Mask[], width: number, height: number): Mask {
  const data = new Uint8Array(width * height);
  for (const mask of masks) {
    for (let i = 0; i < data.length; i++) {
      if (mask.data[i] === 1) {
        data[i] = 1;
      }
    }
  }
  return { width, height, data };
}

/**
 * The mask's outline: every set pixel with at least one 4-neighbor outside
 * the mask — the image edge counts as outside (R4, R10).
 */
export function maskOutline(mask: Mask): Mask {
  const { width, height, data } = mask;
  const outline = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (data[i] === 0) {
        continue;
      }
      const exposed =
        x === 0 ||
        data[i - 1] === 0 ||
        x === width - 1 ||
        data[i + 1] === 0 ||
        y === 0 ||
        data[i - width] === 0 ||
        y === height - 1 ||
        data[i + width] === 0;
      if (exposed) {
        outline[i] = 1;
      }
    }
  }
  return { width, height, data: outline };
}

// ---- selection statistics + fills (R13–R16) ---------------------------------

/**
 * Exact-color counts over the masked pixels, sorted count-descending; ties
 * break by first row-major appearance (deterministic, R13). Empty mask → [].
 */
export function maskStats(src: PixelBuffer, mask: Mask): ColorCount[] {
  const counts = new Map<number, { color: Rgb; count: number; first: number }>();
  const total = mask.width * mask.height;
  for (let i = 0; i < total; i++) {
    if (mask.data[i] === 0) {
      continue;
    }
    const offset = i * 4;
    const key =
      (src.data[offset] << 16) | (src.data[offset + 1] << 8) | src.data[offset + 2];
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        color: {
          r: src.data[offset],
          g: src.data[offset + 1],
          b: src.data[offset + 2],
        },
        count: 1,
        first: i,
      });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((entry) => ({ color: entry.color, count: entry.count }));
}

/** `#RGB` / `#RRGGBB`, case-insensitive, `#` optional, trimmed (R14). */
const HEX_INPUT_PATTERN = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parse a user-typed hex color: trims, accepts 3- or 6-digit forms with an
 * optional leading `#`, case-insensitive; anything else → `null` (R14).
 * Unlike `hexToRgb` this is a USER-INPUT path, so it never throws.
 */
export function parseHexInput(input: string): Rgb | null {
  const trimmed = input.trim();
  if (!HEX_INPUT_PATTERN.test(trimmed)) {
    return null;
  }
  const body = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return hexToRgb(`#${body.toLowerCase()}`);
}

/**
 * Set every masked pixel's RGB to `fill` in a NEW buffer (alpha untouched);
 * the input buffer is never mutated (R16).
 */
export function applyFillToMask(
  src: PixelBuffer,
  mask: Mask,
  fill: Rgb,
): PixelBuffer {
  const data = src.data.slice();
  const total = src.width * src.height;
  for (let i = 0; i < total; i++) {
    if (mask.data[i] === 0) {
      continue;
    }
    const offset = i * 4;
    data[offset] = fill.r;
    data[offset + 1] = fill.g;
    data[offset + 2] = fill.b;
  }
  return { width: src.width, height: src.height, data };
}

/**
 * Recolor every match (R17): return a NEW buffer with every pixel EXACTLY
 * equal to `from` (RGB, alpha ignored) recolored to `to`; a near-miss on any
 * channel is left untouched. The input buffer is never mutated.
 */
export function recolorExact(src: PixelBuffer, from: Rgb, to: Rgb): PixelBuffer {
  const data = src.data.slice();
  const total = src.width * src.height;
  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    if (
      data[offset] === from.r &&
      data[offset + 1] === from.g &&
      data[offset + 2] === from.b
    ) {
      data[offset] = to.r;
      data[offset + 1] = to.g;
      data[offset + 2] = to.b;
    }
  }
  return { width: src.width, height: src.height, data };
}

// ---- canvas overlay (R4, R10) -----------------------------------------------

/**
 * Build the flatten-canvas overlay: a faint tint over selected pixels, the
 * selection outline on top of it, and the hover-mask outline painted last so
 * hover wins where they overlap. Returns `null` when there is nothing to
 * draw (both masks null); otherwise an RGBA buffer of `width · height · 4`.
 */
export function buildFlattenOverlay(args: {
  width: number;
  height: number;
  hover: Mask | null;
  selection: Mask | null;
}): Uint8ClampedArray | null {
  const { width, height, hover, selection } = args;
  if (hover === null && selection === null) {
    return null;
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const total = width * height;
  if (selection !== null) {
    const outline = maskOutline(selection);
    for (let i = 0; i < total; i++) {
      const offset = i * 4;
      if (selection.data[i] === 1) {
        out[offset] = SELECTION_OUTLINE_RGBA[0];
        out[offset + 1] = SELECTION_OUTLINE_RGBA[1];
        out[offset + 2] = SELECTION_OUTLINE_RGBA[2];
        out[offset + 3] = SELECTION_FILL_ALPHA;
      }
      if (outline.data[i] === 1) {
        out[offset + 3] = SELECTION_OUTLINE_RGBA[3];
      }
    }
  }
  if (hover !== null) {
    const outline = maskOutline(hover);
    for (let i = 0; i < total; i++) {
      if (outline.data[i] === 1) {
        const offset = i * 4;
        out[offset] = HOVER_OUTLINE_RGBA[0];
        out[offset + 1] = HOVER_OUTLINE_RGBA[1];
        out[offset + 2] = HOVER_OUTLINE_RGBA[2];
        out[offset + 3] = HOVER_OUTLINE_RGBA[3];
      }
    }
  }
  return out;
}

// ---- whole-image cleanup (R18, R19) -----------------------------------------

/**
 * Remove-small-regions (R18, R19) — the shared algorithm behind Despeckle
 * (`DESPECKLE_MAX_REGION_PX`) and the Low/Medium/High presets
 * (`PRESET_MAX_REGION_PX`). Label every 4-connected EXACT-color component on
 * the INPUT; each component whose area is ≤ `maxRegionPx` is recolored — in an
 * OUTPUT copy — to the most common color among its border pixels, sampled from
 * the INPUT so overlapping recolors never interfere. Ties break by the border
 * color's first row-major appearance; components are processed smallest-area
 * first, then by ascending first-pixel index. Larger components are left
 * untouched and the input buffer is never mutated.
 */
export function removeSmallRegions(
  src: PixelBuffer,
  maxRegionPx: number,
): PixelBuffer {
  const { width, height, data } = src;
  const total = width * height;
  const out = data.slice();

  // Precompute an exact-color key per pixel: labeling and border tallies both
  // reduce to a single integer comparison (keeps this branch-simple).
  const keys = new Int32Array(total);
  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    keys[i] = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
  }

  const labels = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  const lastRowStart = width * (height - 1);
  const components: { indices: number[]; first: number }[] = [];

  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1) {
      continue;
    }
    const label = components.length;
    const key = keys[start];
    let head = 0;
    let tail = 0;
    labels[start] = label;
    queue[tail++] = start;
    const indices: number[] = [];
    while (head < tail) {
      const index = queue[head++];
      indices.push(index);
      const x = index % width;
      const tryPixel = (neighbor: number) => {
        if (labels[neighbor] === -1 && keys[neighbor] === key) {
          labels[neighbor] = label;
          queue[tail++] = neighbor;
        }
      };
      if (x > 0) {
        tryPixel(index - 1);
      }
      if (x < width - 1) {
        tryPixel(index + 1);
      }
      if (index >= width) {
        tryPixel(index - width);
      }
      if (index < lastRowStart) {
        tryPixel(index + width);
      }
    }
    // `start` is the smallest index in the component (all smaller pixels are
    // already labeled), so it is the deterministic first-pixel tie-break.
    components.push({ indices, first: start });
  }

  // Smallest regions first, then earliest first-pixel — a stable, documented
  // processing order (R18).
  const order = components
    .map((_, i) => i)
    .sort(
      (a, b) =>
        components[a].indices.length - components[b].indices.length ||
        components[a].first - components[b].first,
    );

  for (const label of order) {
    const component = components[label];
    if (component.indices.length > maxRegionPx) {
      continue;
    }
    // Distinct border pixels: in-bounds 4-neighbors outside this component.
    const border = new Set<number>();
    for (const index of component.indices) {
      const x = index % width;
      const addBorder = (neighbor: number) => {
        if (labels[neighbor] !== label) {
          border.add(neighbor);
        }
      };
      if (x > 0) {
        addBorder(index - 1);
      }
      if (x < width - 1) {
        addBorder(index + 1);
      }
      if (index >= width) {
        addBorder(index - width);
      }
      if (index < lastRowStart) {
        addBorder(index + width);
      }
    }
    if (border.size === 0) {
      continue; // the component is the whole image — nothing to recolor to
    }
    // Tally border colors from the INPUT, visiting borders in row-major order
    // so Map insertion order is ascending first-appearance (the tie-break).
    const sorted = [...border].sort((a, b) => a - b);
    const tally = new Map<number, { count: number; color: Rgb }>();
    for (const neighbor of sorted) {
      const key = keys[neighbor];
      const existing = tally.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const offset = neighbor * 4;
        tally.set(key, {
          count: 1,
          color: {
            r: data[offset],
            g: data[offset + 1],
            b: data[offset + 2],
          },
        });
      }
    }
    // Most common wins; because entries are already in ascending
    // first-appearance order, only a STRICTLY larger count replaces the
    // current best — which is exactly the first-appearance tie-break (R18).
    const entries = [...tally.values()];
    let best = entries[0];
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].count > best.count) {
        best = entries[i];
      }
    }
    for (const index of component.indices) {
      const offset = index * 4;
      out[offset] = best.color.r;
      out[offset + 1] = best.color.g;
      out[offset + 2] = best.color.b;
    }
  }

  return { width, height, data: out };
}

// ---- view math (R23) --------------------------------------------------------

/**
 * Clamp a view: zoom into [MIN_ZOOM, MAX_ZOOM]; pan so the scaled content
 * never exposes a margin on the leading edge (pan ≤ 0) nor past its own
 * trailing edge (pan ≥ box − content · zoom) (R23).
 *
 * The bounds derive from the CONTENT's untransformed layout size
 * (`contentW`/`contentH`), NOT from the viewport: the content is only
 * guaranteed to fill the viewport at zoom 1 when it happens to be exactly as
 * large as the box. `Math.min(0, …)` keeps the origin forced on an axis where
 * the scaled content FITS inside the box (nothing to reveal), while an axis
 * whose scaled content OVERFLOWS stays pannable — including at zoom 1, which
 * is how a tall image's clipped bottom is reached.
 */
export function clampView(
  view: ViewTransform,
  boxW: number,
  boxH: number,
  contentW: number,
  contentH: number,
): ViewTransform {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const minPanX = Math.min(0, boxW - contentW * zoom);
  const minPanY = Math.min(0, boxH - contentH * zoom);
  return {
    zoom,
    panX: Math.min(0, Math.max(minPanX, view.panX)),
    panY: Math.min(0, Math.max(minPanY, view.panY)),
  };
}

/**
 * Zoom one notch toward a focal point (R23): scale the zoom by `ZOOM_FACTOR`
 * (direction 1) or divide by it (direction -1), clamped, then adjust the pan
 * so the content point currently under `(focalX, focalY)` stays put — finally
 * clamping the pan against the CONTENT bounds (see `clampView`).
 */
export function zoomAt(
  view: ViewTransform,
  direction: 1 | -1,
  focalX: number,
  focalY: number,
  boxW: number,
  boxH: number,
  contentW: number,
  contentH: number,
): ViewTransform {
  const nextZoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      direction === 1 ? view.zoom * ZOOM_FACTOR : view.zoom / ZOOM_FACTOR,
    ),
  );
  const ratio = nextZoom / view.zoom;
  return clampView(
    {
      zoom: nextZoom,
      panX: focalX - ratio * (focalX - view.panX),
      panY: focalY - ratio * (focalY - view.panY),
    },
    boxW,
    boxH,
    contentW,
    contentH,
  );
}

/** Pan by a screen-pixel delta, clamped to the content bounds (R23). */
export function panBy(
  view: ViewTransform,
  dx: number,
  dy: number,
  boxW: number,
  boxH: number,
  contentW: number,
  contentH: number,
): ViewTransform {
  return clampView(
    { zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy },
    boxW,
    boxH,
    contentW,
    contentH,
  );
}
