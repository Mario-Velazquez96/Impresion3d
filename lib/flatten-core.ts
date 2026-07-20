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
 * R10–R16). Smooth masks, stray capture, recolor, remove-small-regions, and
 * view math land in Phases B and C.
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

/**
 * The three hover-mask tools (R5–R7). "smooth" is part of the wire protocol
 * from Phase A but its builder ships in Phase B; the Phase-A UI offers only
 * flood and brush.
 */
export type MaskMode = "flood" | "smooth" | "brush";

/** One exact color and how many masked pixels carry it (R13). */
export type ColorCount = { color: Rgb; count: number };

// ---- constants (exported so tests + UI pin the same values) -----------------

/** Default flood tolerance, in redmean `colorDistance` units (R5). */
export const DEFAULT_FLOOD_TOLERANCE = 24;
export const MIN_TOLERANCE = 0;
export const MAX_TOLERANCE = 150;
/** W/S tolerance step for flood/smooth (R8). */
export const TOLERANCE_STEP = 4;

export const DEFAULT_BRUSH_RADIUS = 8;
export const MIN_BRUSH_RADIUS = 1;
export const MAX_BRUSH_RADIUS = 100;
/** W/S radius step for the brush (R8). */
export const BRUSH_RADIUS_STEP = 2;

/** How many next-most-common colors the fill panel offers (R13). */
export const MAX_RUNNER_UPS = 6;

/** Bounded flatten undo history — oldest snapshots drop first (R20). */
export const MAX_FLATTEN_HISTORY = 12;

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
