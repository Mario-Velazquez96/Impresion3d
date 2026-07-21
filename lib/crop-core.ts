import { MAX_WORKING_DIMENSION, type PixelBuffer } from "@/lib/image-prep-core";

/**
 * Pure crop core (13_crop) — geometry and physical units for the
 * crop-to-print-size stage: millimetre parsing, aspect ratio + orientation, the
 * built-in preset table, ratio-locked rectangle construction and constraints,
 * handle hit-testing, `object-contain` box↔image mapping, the px/mm readout,
 * and the pixel crop itself.
 *
 * WHY A SIBLING CORE (design.md): `lib/image-prep-core.ts` owns the COLOUR
 * domain (adjust → quantize → palette) and `lib/flatten-core.ts` owns the
 * MASK/REGION domain, both at 100% branch coverage over a closed problem. Crop
 * is a third, distinct domain — geometry and physical units — so it gets its
 * own file, keeping every core's 100%-branch target reviewable. The dependency
 * direction is one-way: this module imports `PixelBuffer` +
 * `MAX_WORKING_DIMENSION` from `image-prep-core` and nothing imports it back.
 *
 * Same rules as its siblings: no DOM types beyond typed arrays, no React, no
 * `server-only`, every function pure (fresh objects/buffers out, inputs never
 * mutated), and determinism is a contract — every rounding rule below is fixed
 * so two calls with the same inputs are deeply equal.
 *
 * OPTION A (ratio-only): the millimetre values exist ONLY to derive an aspect
 * ratio and to make the effective px/mm readout honest. Nothing here ever
 * resamples, rescales, upscales, or stretches — the crop keeps the pixels it
 * already has.
 */

// ---- types ------------------------------------------------------------------

/** Integer image-pixel rectangle. */
export type CropRect = { x: number; y: number; width: number; height: number };

/** Target physical print size; ratio-only — never a pixel target (option A). */
export type PrintSize = { widthMm: number; heightMm: number };

/** The 8 resize handles: 4 corners + 4 edge midpoints (R8). */
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** What a pointer press landed on: a handle, the rect interior, or nothing. */
export type HitTarget = Handle | "inside" | null;

export type Orientation = "portrait" | "landscape" | "square";

/** Resolution grading of the effective px/mm (R11). */
export type ResolutionLevel = "ok" | "low" | "critical";

export type CropPreset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
};

/** The drawn content box of an `object-contain` canvas (R18). */
export type ContentBox = {
  scale: number;
  offsetX: number;
  offsetY: number;
  drawnW: number;
  drawnH: number;
};

// ---- constants (exported so tests + UI pin the same values) ------------------

/** R3 — below a millimetre the ratio math is noise. */
export const MIN_PRINT_MM = 1;
/** R3 — a metre is far past any hobby printer bed. */
export const MAX_PRINT_MM = 1000;
/** R2 — `71.7` and `71.75` are accepted; more precision is meaningless. */
export const MM_MAX_DECIMALS = 2;
/** R1 — the workshop's standing HueForge size. */
export const DEFAULT_PRINT_SIZE: PrintSize = { widthMm: 71.7, heightMm: 94 };
/** R6 — below this the readout and the handles stop being usable. */
export const MIN_CROP_PX = 16;
/** R8 — handle grab slop in SCREEN px; the canvas divides it by the view scale. */
export const HANDLE_HIT_SCREEN_PX = 10;
/** R19 — arrow-key nudge, and the Shift-held coarse nudge. */
export const NUDGE_PX = 1;
export const NUDGE_COARSE_PX = 10;
/** R11 — two image px per 0.4 mm-nozzle feature (the Nyquist-style margin). */
export const PX_PER_MM_COMFORTABLE = 5;
/** R11 — one image px per 0.4 mm-nozzle feature: the floor. */
export const PX_PER_MM_MIN = 2.5;
/** R10 — DPI readout. */
export const MM_PER_INCH = 25.4;
/**
 * R12 — the working image's longest side is capped at this on load, so the
 * readout is computed from at most this many pixels and cropping can only ever
 * LOWER the effective px/mm. Re-exported from `image-prep-core` so the core and
 * the crop panel's cap note pin the same number.
 */
export const WORKING_CAP_PX = MAX_WORKING_DIMENSION;

/**
 * The built-in presets (R4) — compile-time constants, never persisted (R22).
 * All are portrait-or-square; **Swap orientation** (R5) covers the landscape
 * variants, so six constants give twelve usable sizes.
 */
export const CROP_PRESETS: readonly CropPreset[] = [
  // The workshop's standing HueForge size — the value that forced the Canva
  // round-trip this feature removes. Also DEFAULT_PRINT_SIZE.
  { id: "hueforge", label: "71.7 × 94", widthMm: 71.7, heightMm: 94 },
  // Square: the common single-plate HueForge test/coaster size.
  { id: "square-100", label: "100 × 100", widthMm: 100, heightMm: 100 },
  // 2:3 — the classic 4×6" photo proportion in round metric numbers.
  { id: "photo-100-150", label: "100 × 150", widthMm: 100, heightMm: 150 },
  // A6 (postcard) — a standard paper size, so off-the-shelf frames exist.
  { id: "a6", label: "105 × 148", widthMm: 105, heightMm: 148 },
  // A5 — the largest common paper size that still fits a 220–250 mm bed.
  { id: "a5", label: "148 × 210", widthMm: 148, heightMm: 210 },
  // 3:4 — the generator's native output ratio: the "no-crop" reference.
  { id: "native-3-4", label: "120 × 160", widthMm: 120, heightMm: 160 },
];

// ---- mm / ratio (R2–R5, R10) ------------------------------------------------

/**
 * Parse one millimetre input (R2, R3). Accepts surrounding whitespace and `,`
 * or `.` as the decimal separator. Returns `null` — meaning "invalid, change
 * nothing" — for empty, non-numeric (including signs and exponent notation),
 * more than `MM_MAX_DECIMALS` decimals, or a value outside
 * `[MIN_PRINT_MM, MAX_PRINT_MM]` (which covers zero and negatives).
 */
export function parseMmInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const dot = normalized.indexOf(".");
  if (dot >= 0 && normalized.length - dot - 1 > MM_MAX_DECIMALS) {
    return null;
  }
  const parsed = Number(normalized);
  if (parsed < MIN_PRINT_MM || parsed > MAX_PRINT_MM) {
    return null;
  }
  return parsed;
}

/** The target aspect ratio: width ÷ height, in millimetres or in pixels. */
export function aspectRatio(size: PrintSize): number {
  return size.widthMm / size.heightMm;
}

/** Portrait ↔ landscape (R5): exchange the two millimetre values. */
export function swapOrientation(size: PrintSize): PrintSize {
  return { widthMm: size.heightMm, heightMm: size.widthMm };
}

export function describeAspect(size: PrintSize): {
  ratio: number;
  orientation: Orientation;
} {
  const ratio = aspectRatio(size);
  const orientation: Orientation =
    ratio > 1 ? "landscape" : ratio < 1 ? "portrait" : "square";
  return { ratio, orientation };
}

/** The preset exactly matching this size, for `aria-pressed` (R4). */
export function matchingPreset(size: PrintSize): CropPreset | null {
  return (
    CROP_PRESETS.find(
      (preset) =>
        preset.widthMm === size.widthMm && preset.heightMm === size.heightMm,
    ) ?? null
  );
}

// ---- rectangle construction & constraints (R6, R9) --------------------------

/**
 * THE invariant enforcer (R6), and idempotent by construction: every
 * rect-producing function below ends with this call.
 *
 * The WIDTH is authoritative and the height is DERIVED (`round(width / ratio)`)
 * — never both independently — so the residual ratio error is at most half a
 * pixel on one side and a second call reproduces the first exactly.
 *
 * Order: cap the width so both sides fit the image → floor both sides at
 * `MIN_CROP_PX` → derive the height → translate the rect inside the bounds →
 * integers out. On a degenerate image too small to hold `MIN_CROP_PX` (or the
 * ratio), staying INSIDE the image wins over the usability floor and each side
 * is floored at 1 px, so the rect is never empty and never escapes the bounds.
 */
export function clampRectToImage(
  rect: CropRect,
  ratio: number,
  imgW: number,
  imgH: number,
): CropRect {
  const maxWidth = Math.max(1, Math.floor(Math.min(imgW, imgH * ratio)));
  const minWidth = Math.min(
    maxWidth,
    Math.ceil(Math.max(MIN_CROP_PX, MIN_CROP_PX * ratio)),
  );
  const width = Math.min(
    maxWidth,
    Math.max(minWidth, Math.round(rect.width)),
  );
  const height = Math.min(
    Math.max(1, Math.floor(imgH)),
    Math.max(1, Math.round(width / ratio)),
  );
  return {
    x: Math.min(Math.max(0, Math.round(rect.x)), Math.max(0, imgW - width)),
    y: Math.min(Math.max(0, Math.round(rect.y)), Math.max(0, imgH - height)),
    width,
    height,
  };
}

/** The largest ratio-locked rectangle that fits the image, centred (R9). */
export function fitRect(imgW: number, imgH: number, ratio: number): CropRect {
  const sized = clampRectToImage(
    { x: 0, y: 0, width: imgW, height: imgH },
    ratio,
    imgW,
    imgH,
  );
  return clampRectToImage(
    {
      ...sized,
      x: Math.round((imgW - sized.width) / 2),
      y: Math.round((imgH - sized.height) / 2),
    },
    ratio,
    imgW,
    imgH,
  );
}

/**
 * Fit's SIZE around the current rectangle's own centre, then clamped (R9):
 * "keep my framing, take the maximum pixels".
 */
export function fillRect(
  rect: CropRect,
  ratio: number,
  imgW: number,
  imgH: number,
): CropRect {
  const target = fitRect(imgW, imgH, ratio);
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  return clampRectToImage(
    {
      x: Math.round(centreX - target.width / 2),
      y: Math.round(centreY - target.height / 2),
      width: target.width,
      height: target.height,
    },
    ratio,
    imgW,
    imgH,
  );
}

/**
 * Re-lock an existing rectangle to a NEW ratio (R2, R4, R5), preserving its
 * centre and its pixel AREA as closely as the image bounds allow:
 * `w' = round(√(area × ratio))`, `h' = round(w' / ratio)`, then clamped.
 */
export function refitRect(
  rect: CropRect,
  ratio: number,
  imgW: number,
  imgH: number,
): CropRect {
  const area = Math.max(1, rect.width * rect.height);
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  // Size FIRST (the clamp may shrink it to fit the image), then centre the
  // final size — sizing after positioning would drift the centre off.
  const sized = clampRectToImage(
    { x: 0, y: 0, width: Math.round(Math.sqrt(area * ratio)), height: 0 },
    ratio,
    imgW,
    imgH,
  );
  return clampRectToImage(
    {
      x: Math.round(centreX - sized.width / 2),
      y: Math.round(centreY - sized.height / 2),
      width: sized.width,
      height: sized.height,
    },
    ratio,
    imgW,
    imgH,
  );
}

/**
 * Translate the rectangle, clamped inside the image (R7, R19). The size and
 * ratio are unchanged: the ratio is read back off the rect itself, so the
 * clamp's derived height reproduces the input height exactly.
 */
export function moveRect(
  rect: CropRect,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
): CropRect {
  return clampRectToImage(
    { ...rect, x: rect.x + dx, y: rect.y + dy },
    rect.width / rect.height,
    imgW,
    imgH,
  );
}

/**
 * Per-handle anchor semantics (R8). `x`: which side the rectangle grows toward
 * — `left` anchors the RIGHT edge, `right` anchors the LEFT edge, `center`
 * holds the horizontal centre fixed (the N/S edge handles). `y` likewise.
 */
const HANDLE_AXES: Record<
  Handle,
  { x: "left" | "right" | "center"; y: "up" | "down" | "center" }
> = {
  nw: { x: "left", y: "up" },
  n: { x: "center", y: "up" },
  ne: { x: "right", y: "up" },
  e: { x: "right", y: "center" },
  se: { x: "right", y: "down" },
  s: { x: "center", y: "down" },
  sw: { x: "left", y: "down" },
  w: { x: "left", y: "center" },
};

/**
 * Resize from a handle with the aspect ratio LOCKED (R8).
 *
 * Corner handles anchor the opposite corner; edge handles anchor the opposite
 * edge and hold the perpendicular axis centred. The pointer drives the width
 * (E/W), the height (N/S), or the larger of the two (corners, so the rect
 * follows the pointer diagonally). The width is then limited by the space
 * available FROM THE ANCHOR on both axes — growth STOPS at the image edge
 * instead of breaking the ratio or overflowing — floored at `MIN_CROP_PX` on
 * both sides, and the result goes through `clampRectToImage`.
 */
export function resizeRect({
  rect,
  handle,
  pointerX,
  pointerY,
  ratio,
  imgW,
  imgH,
}: {
  rect: CropRect;
  handle: Handle;
  pointerX: number;
  pointerY: number;
  ratio: number;
  imgW: number;
  imgH: number;
}): CropRect {
  const axes = HANDLE_AXES[handle];
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  const anchorX =
    axes.x === "left"
      ? rect.x + rect.width
      : axes.x === "right"
        ? rect.x
        : centreX;
  const anchorY =
    axes.y === "up"
      ? rect.y + rect.height
      : axes.y === "down"
        ? rect.y
        : centreY;

  // What the pointer drives, expressed as a width.
  const driven =
    axes.x === "center"
      ? Math.abs(pointerY - anchorY) * ratio
      : axes.y === "center"
        ? Math.abs(pointerX - anchorX)
        : Math.max(
            Math.abs(pointerX - anchorX),
            Math.abs(pointerY - anchorY) * ratio,
          );

  // Space available from the anchor: growth stops here rather than overflowing.
  const spaceX =
    axes.x === "left"
      ? anchorX
      : axes.x === "right"
        ? imgW - anchorX
        : 2 * Math.min(centreX, imgW - centreX);
  const spaceY =
    axes.y === "up"
      ? anchorY
      : axes.y === "down"
        ? imgH - anchorY
        : 2 * Math.min(centreY, imgH - centreY);

  const limited = Math.min(driven, spaceX, spaceY * ratio);
  const width = Math.round(
    Math.max(limited, MIN_CROP_PX, MIN_CROP_PX * ratio),
  );
  const height = Math.round(width / ratio);

  const x =
    axes.x === "left"
      ? anchorX - width
      : axes.x === "right"
        ? anchorX
        : centreX - width / 2;
  const y =
    axes.y === "up"
      ? anchorY - height
      : axes.y === "down"
        ? anchorY
        : centreY - height / 2;

  return clampRectToImage({ x, y, width, height }, ratio, imgW, imgH);
}

/**
 * What an image-space point lands on (R8): corners take precedence over edge
 * midpoints, edges over the interior; anything outside the rectangle proper
 * (and not within `tolerance` of a handle) is `null`, so a press in the
 * letterbox or well away from the rect starts no drag.
 */
export function hitTestHandle(
  rect: CropRect,
  x: number,
  y: number,
  tolerance: number,
): HitTarget {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  const onLeft = near(x, left);
  const onRight = near(x, right);
  const onTop = near(y, top);
  const onBottom = near(y, bottom);
  // Handles are only grabbable from within the tolerance band around the rect.
  const inBand =
    x >= left - tolerance &&
    x <= right + tolerance &&
    y >= top - tolerance &&
    y <= bottom + tolerance;
  if (!inBand) {
    return null;
  }
  if (onLeft && onTop) {
    return "nw";
  }
  if (onRight && onTop) {
    return "ne";
  }
  if (onRight && onBottom) {
    return "se";
  }
  if (onLeft && onBottom) {
    return "sw";
  }
  const onCentreX = near(x, rect.x + rect.width / 2);
  const onCentreY = near(y, rect.y + rect.height / 2);
  if (onTop && onCentreX) {
    return "n";
  }
  if (onBottom && onCentreX) {
    return "s";
  }
  if (onLeft && onCentreY) {
    return "w";
  }
  if (onRight && onCentreY) {
    return "e";
  }
  if (x >= left && x <= right && y >= top && y <= bottom) {
    return "inside";
  }
  return null;
}

/** The CSS cursor for a hit target (R8). */
export function handleCursor(target: HitTarget): string {
  switch (target) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "inside":
      return "move";
    default:
      return "default";
  }
}

// ---- object-contain geometry (R18) ------------------------------------------

/**
 * The drawn content box of an `object-contain` canvas: the SAME uniform
 * `min(rectW/imgW, rectH/imgH)` scale + centring that `mapClickToPixel`
 * (11/R21) inverts. `null` on a degenerate (zero-size) box.
 */
export function contentBoxOf({
  rectW,
  rectH,
  imgW,
  imgH,
}: {
  rectW: number;
  rectH: number;
  imgW: number;
  imgH: number;
}): ContentBox | null {
  if (rectW <= 0 || rectH <= 0 || imgW <= 0 || imgH <= 0) {
    return null;
  }
  const scale = Math.min(rectW / imgW, rectH / imgH);
  const drawnW = imgW * scale;
  const drawnH = imgH * scale;
  return {
    scale,
    offsetX: (rectW - drawnW) / 2,
    offsetY: (rectH - drawnH) / 2,
    drawnW,
    drawnH,
  };
}

/**
 * The CLAMPED sibling of `mapClickToPixel` for an IN-PROGRESS drag (R7, R8,
 * R18): identical `object-contain` math via `contentBoxOf`, but a point outside
 * the drawn content is clamped into `[0, imgW-1] × [0, imgH-1]` instead of
 * returning `null`, so a drag survives the pointer leaving the image. `null`
 * only for a degenerate box. (`mapClickToPixel` stays the PRESS test, where
 * `null` correctly means "letterbox — start no drag".)
 */
export function boxPointToImage({
  rectW,
  rectH,
  imgW,
  imgH,
  offsetX,
  offsetY,
}: {
  rectW: number;
  rectH: number;
  imgW: number;
  imgH: number;
  offsetX: number;
  offsetY: number;
}): { x: number; y: number } | null {
  const box = contentBoxOf({ rectW, rectH, imgW, imgH });
  if (box === null) {
    return null;
  }
  const contentX = offsetX - box.offsetX;
  const contentY = offsetY - box.offsetY;
  return {
    x: Math.min(imgW - 1, Math.max(0, Math.floor(contentX / box.scale))),
    y: Math.min(imgH - 1, Math.max(0, Math.floor(contentY / box.scale))),
  };
}

/**
 * The rectangle as 0..1 fractions of the DRAWN content box — what the DOM
 * overlay is positioned from. Because the content box is the image scaled
 * uniformly, fractions of the image are fractions of the content box.
 */
export function imageRectToBoxFractions(
  rect: CropRect,
  imgW: number,
  imgH: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x / imgW,
    top: rect.y / imgH,
    width: rect.width / imgW,
    height: rect.height / imgH,
  };
}

// ---- readout (R10–R12) ------------------------------------------------------

/**
 * Effective px/mm on each axis plus the smaller one, which is what the readout
 * reports (the two agree to within R6's one-pixel rounding).
 */
export function effectivePxPerMm(
  rect: CropRect,
  size: PrintSize,
): { x: number; y: number; min: number } {
  const x = rect.width / size.widthMm;
  const y = rect.height / size.heightMm;
  return { x, y, min: Math.min(x, y) };
}

export function pxPerMmToDpi(pxPerMm: number): number {
  return pxPerMm * MM_PER_INCH;
}

/**
 * R11 — the grading behind the caution/warning, tied to a 0.4 mm nozzle:
 * below `PX_PER_MM_MIN` (one image pixel per printable feature) detail is
 * visibly lost; below `PX_PER_MM_COMFORTABLE` (two per feature) the print may
 * look soft. Neither level blocks Apply.
 */
export function resolutionLevel(pxPerMm: number): ResolutionLevel {
  if (pxPerMm < PX_PER_MM_MIN) {
    return "critical";
  }
  if (pxPerMm < PX_PER_MM_COMFORTABLE) {
    return "low";
  }
  return "ok";
}

/** Share of the working image's pixels the crop keeps, as a percentage. */
export function pixelsKeptPercent(
  rect: CropRect,
  imgW: number,
  imgH: number,
): number {
  return ((rect.width * rect.height) / (imgW * imgH)) * 100;
}

// ---- the crop itself (R13, R21) ---------------------------------------------

/**
 * Extract the rectangle from the source image (R13) — a row-wise
 * `subarray` → `set` copy into a fresh buffer, on the main thread (R21).
 *
 * Defensive: the rectangle is clamped into the source bounds first, so this can
 * never throw or read out of range. The input is never mutated. There is NO
 * resampling and NO scaling: the output is exactly `rect.width × rect.height`
 * SOURCE pixels (option A), so a full-image rect returns a byte-identical copy.
 */
export function cropPixels(src: PixelBuffer, rect: CropRect): PixelBuffer {
  const x = Math.min(
    Math.max(0, Math.round(rect.x)),
    Math.max(0, src.width - 1),
  );
  const y = Math.min(
    Math.max(0, Math.round(rect.y)),
    Math.max(0, src.height - 1),
  );
  const width = Math.min(
    Math.max(1, Math.round(rect.width)),
    Math.max(1, src.width - x),
  );
  const height = Math.min(
    Math.max(1, Math.round(rect.height)),
    Math.max(1, src.height - y),
  );
  const data = new Uint8ClampedArray(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    const start = ((y + row) * src.width + x) * 4;
    data.set(src.data.subarray(start, start + rowBytes), row * rowBytes);
  }
  return { width, height, data };
}
