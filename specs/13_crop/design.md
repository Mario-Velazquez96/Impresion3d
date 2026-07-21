# Design — 13_crop

**Source:** product-owner decision (2026-07-21), option A (ratio-only)
**Depends on:** 11_image_prep and 12_flatten — this feature EXTENDS the
`/image-prep` page and reuses their architecture wholesale: pure core in
`lib/`, the Stage union in the client island, the R16 upstream-invalidation
invariant, the R21 click geometry (`mapClickToPixel`), and feature 12's
stage-with-`resume`, overlay/`ResizeObserver` canvas, and zoom/pan view math.

## Approach

No new route, no server change, **no worker change**. The crop stage is a sixth
member of the island's Stage union plus a dedicated workspace that replaces
`BeforeAfterPreview` while active. All new math is pure and lives in a new
sibling core, `lib/crop-core.ts`. Applying the crop is a single main-thread
buffer copy that produces a **fresh `loaded` stage** — i.e. crop is the most
upstream operation in the pipeline.

```
app/(app)/image-prep/page.tsx                    UNCHANGED (auth + Color catalog read)
  └─ components/image-prep/ImagePrep.tsx             Island — Stage union gains "crop"; LoadedFields gains `uploaded`;
       │                                              enter/cancel/apply/revert handlers
       ├─ …existing panels (Dropzone/Adjust/Histogram/Posterize/Flatten card/Palette)…  disabled or hidden while cropping
       ├─ components/image-prep/CropStartCard.tsx     Client — Start crop / active notice / Revert to uncropped
       ├─ components/image-prep/CropWorkspace.tsx     Client — crop UI state (target mm drafts, rect, drag)
       │    ├─ components/image-prep/CropCanvas.tsx      Client — base canvas + DOM rect overlay + zoom/pan + hints strip
       │    └─ components/image-prep/CropSizePanel.tsx   Client — mm inputs, presets, swap, Fit/Fill/Reset, readout, Apply/Cancel
       ├─ components/image-prep/use-canvas-view.ts    NEW shared hook — viewport/ResizeObserver/wheel/pan (EXTRACTED from FlattenCanvas)
       ├─ components/image-prep/FlattenCanvas.tsx     Refactor only: consumes the extracted hook (zero behavior change)
       ├─ components/image-prep/canvas-paint.ts       UNCHANGED (reused `paint`)
       ├─ components/image-prep/BeforeAfterPreview.tsx UNCHANGED (its `mapClickToPixel` is imported, not modified)
       └─ components/image-prep/worker-messages.ts    UNCHANGED — no new op (see "Why no worker")
lib/crop-core.ts                                 NEW pure core — all crop/aspect/mm math
lib/image-prep-core.ts                           UNCHANGED (crop-core imports PixelBuffer + MAX_WORKING_DIMENSION)
lib/flatten-core.ts                              UNCHANGED (crop reuses zoomAt/panBy/clampView/IDENTITY_VIEW)
```

### No persistence — explicit statement (R22)

Identical contract to features 11 and 12: **no** Prisma model/field/migration,
RLS change, Server Action, route handler, Zod schema (no server boundary
exists), Storage access, `localStorage`/cookie/URL state, env var, or npm
dependency. **Persisted user-defined presets are deliberately excluded**
because the only ways to remember a user's own print sizes are `localStorage`
or a Prisma table + migration — either one breaks this contract. `CROP_PRESETS`
is a compile-time constant array in the pure core; a one-off size is typed into
the two mm inputs for the session.

## Why a sibling core (`lib/crop-core.ts`), not more `image-prep-core.ts`

- `lib/image-prep-core.ts` is ~940 lines at 100% branch coverage over a closed
  **colour** domain (adjust → quantize → palette); `lib/flatten-core.ts` owns
  the **mask/region** domain. Crop is a third, distinct domain — **geometry and
  physical units** (mm ↔ ratio ↔ pixels, rectangles, handles, `object-contain`
  box mapping). Feature 12 set the sibling precedent for exactly this reason,
  and a third file keeps each one's 100%-branch target reviewable and honest.
- The dependency direction is clean and one-way: `crop-core` **imports**
  `PixelBuffer` and `MAX_WORKING_DIMENSION` from `image-prep-core` (lib → lib)
  and nothing imports `crop-core` from the other cores. `image-prep-core.ts`
  and `flatten-core.ts` are **not modified**, so their tests and coverage are
  untouched.
- Same rules as its siblings: no DOM types beyond typed arrays, no
  `server-only`, no React, all functions pure (new objects/buffers out, inputs
  never mutated), determinism is a contract (every rounding rule and tie-break
  is specified, no floating-point-dependent branching beyond documented
  comparisons).

## Why crop is an UPSTREAM operation (R13) — and what it discards

Every existing pipeline stage is **dimension-preserving**: `adjust`,
`quantize`, palette ops, and every flatten op return a buffer with the same
width/height as `original`. Two consequences drive the design:

1. A rectangle chosen while looking at the **working image** (the posterized or
   flattened preview — the most informative framing reference, which is what
   the canvas shows, R1) is **valid coordinates on `original`**. So the user
   frames against what they see, and the crop is applied to the pipeline's
   source.
2. Cropping `original` invalidates everything derived from it. Rather than
   trying to crop the derived state as well, Apply builds a **fresh `loaded`
   stage** — structurally identical to what loading a file does. The adjusted
   buffer, histogram, `IndexedImage` + palette + palette-undo history, and any
   flatten stage simply have no field to survive in. This is exactly 11/R16
   ("upstream changes discard downstream results"), applied one stage further
   upstream than Apply-adjustments.

**Alternative considered and rejected:** cropping *every* buffer in the current
stage so a posterize/flatten session survives. Rejected because the quantized
`IndexedImage.indices` would need cropping too, every palette entry's `count`
and coverage % would be wrong (the pixel population changes), the histogram
would be stale, and the palette-undo history would hold uncroppable snapshots —
a large amount of derived state to keep consistent for a workflow (crop after
posterize) that is not the intended one. The crop card's copy warns before the
commit, and **Cancel** costs nothing.

**Also rejected:** cropping the *working* image and installing it as the new
`original`. That would bake posterization into the "Original" pane and make
subsequent Adjust run on already-quantized pixels — a lie in the UI and a
worse pipeline.

## Stage integration and the `uploaded` source (R1, R13, R14, R15)

`LoadedFields` gains **one** field:

```ts
type LoadedFields = {
  original: PixelBuffer;        // the pipeline source — the CROPPED image after a crop
  uploaded: PixelBuffer;        // NEW: the as-decoded (cap-downscaled) upload; === original until a crop
  fileName: string;
  fileBytes: number;
  originalDims: { width: number; height: number };  // the FILE's dimensions (11/R4 notice) — unchanged by crop
  downscaled: boolean;
};
```

`uploaded` is the **same reference** as `original` until the first crop, so an
uncropped session costs zero extra memory; after a crop it holds one extra
buffer (≤ 16 MB at the 2048 cap) and powers **Revert to uncropped** (R15).
`cropped = original !== uploaded` is a derived boolean — no flag to keep in
sync. Revert always returns to `uploaded` (a single level), so repeated crops
can never strand the user in a chain of partial reversions.

The Stage union gains one member; `FlattenStage` is unchanged:

```ts
/** Every non-empty stage crop can be entered from — and restored to (R1, R14). */
type CropResume = LoadedStage | AdjustedStage | QuantizedStage | FlattenStage;

type CropStage = {
  kind: "crop";
  resume: CropResume;     // the EXACT pre-crop stage object (cheap references)
};

type Stage = EmptyStage | LoadedStage | AdjustedStage | QuantizedStage
           | FlattenStage | CropStage;
```

- The crop stage carries **no image state at all** — it edits nothing. The
  target size and rectangle are transient UI state owned by `CropWorkspace`
  (feature 12's split: durable stage state in the island, transient tool state
  in the workspace). This is why Cancel is a one-line pure restore and why the
  stage needs no `entry`, no history, and no counter.
- `FlattenResume` is unchanged (it can never be a crop stage) because Start
  flatten is disabled while cropping (R16), so the nesting is at most
  `crop → flatten → quantized` and is enforced by the types.
- **Base unwrapping.** The island's existing `base` derivation grows one arm:
  `crop → resume → (flatten → resume)`. A tiny `baseOf(stage)` helper replaces
  the inline ternary so the dropzone info and the working-image derivation keep
  working while cropping.
- **Working image derivation** gains one arm: `crop → workingImageOf(resume)`
  (which itself handles the flatten arm), so the crop canvas shows the newest
  completed stage exactly like the "after" pane does.
- **Enter (R1):** `setStage({ kind: "crop", resume: current })`. Disabled while
  `busy` or the stage is `empty`.
- **Cancel (R14):** `setStage(stage.resume)` — a pure restore; the palette and
  its undo history, or the flatten image/history/counter, come back untouched
  because they are the same objects.
- **Apply (R13):** `cropPixels(base.original, rect)` on the main thread, then a
  fresh `loaded` stage: `{ kind: "loaded", ...loadedFields, original: cropped,
  uploaded: base.uploaded }`. `originalDims`/`downscaled`/`fileBytes` keep
  describing the **file**, so the 11/R4 downscale notice stays truthful; the
  crop is reported separately by `CropStartCard` ("Cropped to 1562 × 2048 px —
  from 1536 × 2048"), which keeps `types.ts` and `ImageDropzone` untouched.
- **Revert (R15):** the same fresh-`loaded` construction with
  `original: base.uploaded`.
- **Modality (R16):** while `stage.kind === "crop"` the palette panel is not
  rendered and `AdjustPanel` / `PosterizePanel` / `FlattenStartCard` receive
  `disabled`; the dropzone stays live (loading a file builds a fresh `loaded`
  stage, discarding the crop stage — 11/R16 again). Because those panels are
  unreachable, `handleApply`/`handlePosterize` need **no** crop-specific
  branches; only `baseOf` changes.

## `lib/crop-core.ts` — the pure core

```ts
import { MAX_WORKING_DIMENSION, type PixelBuffer } from "@/lib/image-prep-core";

// ---- types ---------------------------------------------------------------
/** Integer image-pixel rectangle. */
export type CropRect = { x: number; y: number; width: number; height: number };
/** Target physical print size; ratio-only — never a pixel target (option A). */
export type PrintSize = { widthMm: number; heightMm: number };
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type HitTarget = Handle | "inside" | null;
export type Orientation = "portrait" | "landscape" | "square";
export type ResolutionLevel = "ok" | "low" | "critical";
export type CropPreset = { id: string; label: string; widthMm: number; heightMm: number };
/** The drawn content box of an `object-contain` canvas (R18). */
export type ContentBox = { scale: number; offsetX: number; offsetY: number; drawnW: number; drawnH: number };

// ---- constants (exported so tests + UI pin the same values) ---------------
export const MIN_PRINT_MM = 1;            // R3 — below this the ratio math is noise
export const MAX_PRINT_MM = 1000;         // R3 — a metre is far past any hobby printer bed
export const MM_MAX_DECIMALS = 2;         // R2 — 71.7 and 71.75 accepted; more is meaningless
export const DEFAULT_PRINT_SIZE: PrintSize = { widthMm: 71.7, heightMm: 94 }; // R1
export const MIN_CROP_PX = 16;            // R6 — below this the readout/handles stop being usable
export const HANDLE_HIT_SCREEN_PX = 10;   // R8 — hit slop in SCREEN px, converted to image px by the canvas
export const NUDGE_PX = 1, NUDGE_COARSE_PX = 10;                 // R19
export const PX_PER_MM_COMFORTABLE = 5;   // R11 — 2 image px per 0.4 mm nozzle feature
export const PX_PER_MM_MIN = 2.5;         // R11 — 1 image px per nozzle feature
export const MM_PER_INCH = 25.4;          // R10 — DPI readout
export const CROP_PRESETS: readonly CropPreset[];  // see table below

// ---- mm / ratio (R2–R5, R10) ---------------------------------------------
export function parseMmInput(value: string): number | null;
//   trim; accept ',' or '.' as the decimal separator; reject empty, non-numeric,
//   NaN/Infinity, ≤ 0, > MAX_PRINT_MM, < MIN_PRINT_MM, or more than MM_MAX_DECIMALS decimals → null.
export function aspectRatio(size: PrintSize): number;             // widthMm / heightMm
export function swapOrientation(size: PrintSize): PrintSize;      // { w, h } → { h, w }
export function describeAspect(size: PrintSize): { ratio: number; orientation: Orientation };
export function matchingPreset(size: PrintSize): CropPreset | null;  // exact mm match, for aria-pressed

// ---- rectangle construction & constraints (R6, R9) ------------------------
export function clampRectToImage(rect: CropRect, ratio: number, imgW: number, imgH: number): CropRect;
//   THE invariant enforcer, idempotent: shrink to fit the image (ratio kept, derived side
//   = round(other × ratio)), raise to MIN_CROP_PX on both sides, translate inside the bounds,
//   round to integers. Every other rect-producing function ends with this call.
export function fitRect(imgW: number, imgH: number, ratio: number): CropRect;      // largest ratio rect, centred
export function fillRect(rect: CropRect, ratio: number, imgW: number, imgH: number): CropRect;
//   Fit's SIZE around `rect`'s centre, then clamped — "keep my framing, take the max pixels".
export function refitRect(rect: CropRect, ratio: number, imgW: number, imgH: number): CropRect;
//   Re-lock to a NEW ratio preserving the rect's centre and pixel AREA:
//   w' = round(sqrt(area × ratio)), h' = round(w' / ratio), then clamped (R2, R4, R5).
export function moveRect(rect: CropRect, dx: number, dy: number, imgW: number, imgH: number): CropRect;  // R7, R19
export function resizeRect(args: {
  rect: CropRect; handle: Handle; pointerX: number; pointerY: number;
  ratio: number; imgW: number; imgH: number;
}): CropRect;                                                                       // R8
//   Anchor: corner handle → opposite corner fixed; edge handle → opposite edge fixed with the
//   perpendicular axis CENTRE fixed. Corner: w = max(|dx|, |dy| × ratio), h = w / ratio (the rect
//   follows the pointer diagonally). E/W: w = |dx|, h = w / ratio. N/S: h = |dy|, w = h × ratio.
//   Then w is limited by the space available from the anchor (so growth STOPS at the image edge
//   rather than breaking ratio), raised to max(MIN_CROP_PX, MIN_CROP_PX × ratio), and the result
//   goes through clampRectToImage.
export function hitTestHandle(rect: CropRect, x: number, y: number, tolerance: number): HitTarget;
//   Corners take precedence over edges, edges over "inside"; outside the rect (+ tolerance) → null.
export function handleCursor(target: HitTarget): string;  // "nwse-resize" | "nesw-resize" | "ns-resize" | "ew-resize" | "move" | "default"

// ---- object-contain geometry (R18) ---------------------------------------
export function contentBoxOf(args: { rectW: number; rectH: number; imgW: number; imgH: number }): ContentBox | null;
//   The SAME uniform min(rectW/imgW, rectH/imgH) scale + centering that `mapClickToPixel` inverts;
//   null on a degenerate (zero-size) box.
export function boxPointToImage(args: { rectW; rectH; imgW; imgH; offsetX; offsetY }): { x: number; y: number } | null;
//   The CLAMPED, float-precision sibling of `mapClickToPixel`: coordinates outside the drawn content
//   are clamped into [0, imgW-1] / [0, imgH-1] instead of returning null, so a drag survives the
//   pointer leaving the image (R7, R8, R18). Null only for a degenerate box.
export function imageRectToBoxFractions(rect: CropRect, imgW: number, imgH: number):
  { left: number; top: number; width: number; height: number };   // 0..1 fractions of the DRAWN content box

// ---- readout (R10–R12) ----------------------------------------------------
export function effectivePxPerMm(rect: CropRect, size: PrintSize): { x: number; y: number; min: number };
export function pxPerMmToDpi(pxPerMm: number): number;                    // × MM_PER_INCH
export function resolutionLevel(pxPerMm: number): ResolutionLevel;        // < PX_PER_MM_MIN → "critical"; < PX_PER_MM_COMFORTABLE → "low"; else "ok"
export function pixelsKeptPercent(rect: CropRect, imgW: number, imgH: number): number;  // (rect area ÷ image area) × 100

// ---- the crop itself (R13, R21) ------------------------------------------
export function cropPixels(src: PixelBuffer, rect: CropRect): PixelBuffer;
//   Defensive: the rect is clamped into the source bounds first, so it can never throw. Row-wise
//   `subarray` → `set` copy into a fresh Uint8ClampedArray. Input never mutated. NO resampling,
//   NO scaling — the output is exactly rect.width × rect.height source pixels (option A).
```

### The built-in presets (R4) and why these

| Label | mm | Why it earns a button |
|---|---|---|
| `71.7 × 94` | 71.7 × 94 | The workshop's **standing HueForge size** — the exact value that forced the Canva round-trip. Default (`DEFAULT_PRINT_SIZE`). |
| `100 × 100` | 100 × 100 | Square. The most common single-plate HueForge test/coaster size; fits every 180 mm+ bed. |
| `100 × 150` | 100 × 150 | 2:3 — the classic 4×6" photo proportion in round metric numbers. |
| `105 × 148` | 105 × 148 | **A6** (postcard). A standard paper size, so off-the-shelf frames exist. |
| `148 × 210` | 148 × 210 | **A5**. The largest common paper size that still fits a 220–250 mm bed comfortably. |
| `120 × 160` | 120 × 160 | **3:4** — the generator's native output ratio. The "no-crop" reference: Fit selects the entire image, which makes it obvious when no crop is needed (and is a clean E2E/unit anchor). |

All six are portrait-or-square as listed; **Swap orientation** (R5) covers the
landscape variants, so six constants give twelve usable sizes without doubling
the button row.

### Determinism and rounding

Every rect-producing function ends with `clampRectToImage`, which is
**idempotent** and rounds to integers with a fixed rule: the *derived* side is
`round(other × ratio)` (or `round(other / ratio)`), never both independently.
Two calls with the same inputs always produce a deeply-equal rect, so core
tests are exact. The residual ratio error is at most half a pixel on one side —
under 0.1% relative, i.e. under 0.05 mm on a 94 mm print (R6).

## Why no worker action (R21)

`cropPixels` on the largest possible working image is one row-wise memcpy of ≤
2048 × 2048 × 4 bytes ≈ 16 MB — single-digit milliseconds, once, on an explicit
button press. Posting it to the worker would mean copying the source **in**
and the result **out** (two extra 16 MB transfers), plus a new request/response
variant, new hook overloads, and a new dispatch branch — strictly more work and
more surface for zero responsiveness gain. All the interactive math (move,
resize, clamp, hit test, readout) is O(1) per pointer event. So
`worker-messages.ts`, `image-prep.worker.ts`, and `useImagePrepWorker.ts` are
**not touched** by this feature.

## Reuse, not reinvention

- **`mapClickToPixel` (11/R21)** is imported from `BeforeAfterPreview` — as
  `FlattenCanvas` already does — and used for the **pointer-down hit test**:
  it returns `null` in the letterbox margin, which is exactly R18's "a press in
  the margin starts no drag". Its `getBoundingClientRect()`-based input already
  reflects the CSS zoom/pan transform, so no zoom-aware click math is written
  anywhere in this feature.
- **`boxPointToImage`** is the deliberate, documented **clamped sibling** for
  the *continuing* drag (the pointer may leave the content mid-drag, where
  `mapClickToPixel` correctly returns `null` and would abort the drag). It
  shares the identical `object-contain` scale/offset formula via
  `contentBoxOf`, and a core test asserts the two **agree** on in-content
  points so the geometry can never fork.
- **`paint()` (`canvas-paint.ts`)** paints the base canvas — the established
  jsdom paint-guard pattern (null-ref + missing-2D-context guards), so
  components stay testable under jsdom, which has no canvas 2D context.
- **`ResizeObserver` content measurement** and the **zoom/pan view math**
  (`zoomAt` / `panBy` / `clampView` / `IDENTITY_VIEW` / `MIN_ZOOM` / `MAX_ZOOM`
  / `ZOOM_FACTOR` from `lib/flatten-core.ts`, including the corrected
  content-vs-viewport `clampView` bounds) are reused **verbatim** — imported,
  not copied, not re-derived.
- To avoid duplicating the ~60 lines of DOM glue around them, that glue is
  **extracted once** into `components/image-prep/use-canvas-view.ts` and
  consumed by both `FlattenCanvas` (mechanical refactor, zero behavior change,
  its existing Phase-C navigation tests must pass **unmodified**) and
  `CropCanvas`.

```ts
// components/image-prep/use-canvas-view.ts  — extracted from FlattenCanvas, behavior-identical
export function useCanvasView({ contentRef, resetKey }: {
  contentRef: RefObject<HTMLCanvasElement | null>;  // the UNTRANSFORMED element to measure
  resetKey: unknown;                                 // changing it re-measures (new image)
}): {
  viewportRef: RefObject<HTMLDivElement | null>;
  view: ViewTransform;
  expanded: boolean;
  toggleExpanded: () => void;
  handlePanStart: (event: MouseEvent<HTMLDivElement>) => void;  // middle button / Space+left
  spaceHeldRef: RefObject<boolean>;                             // consumers suppress their own drag while panning
  capClass: string;   // "max-h-[60vh]" | "max-h-[85vh]" — literal, for the Tailwind JIT
  fitClass: string;   // `h-auto w-full max-w-full object-contain ${capClass}`
  transformStyle: CSSProperties;                                 // the only dynamic inline style
};
```

### Why the crop overlay is DOM, not a repainted RGBA buffer

`buildFlattenOverlay` rebuilds an image-sized RGBA buffer per selection change
— fine, because selections change on *clicks*. A crop rectangle changes on
every **mousemove of a drag**; rebuilding a 16 MB buffer per frame would drop
frames and blur under zoom. Instead the overlay is a thin DOM layer positioned
from `imageRectToBoxFractions` (pure, unit-tested) inside the same transform
wrapper as the canvas:

- an absolutely-positioned **content-box wrapper** (`overflow-hidden`,
  `pointer-events-none`, `aria-hidden`) matching the drawn content box, so the
  dim never spills into the letterbox;
- the **crop rect** div inside it: a ring/border plus
  `shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]` to dim everything outside in one
  element;
- **8 handle** squares as `pointer-events-none` decorations — hit-testing is
  done in **image space** by the pure `hitTestHandle` against the pointer
  (with `HANDLE_HIT_SCREEN_PX / contentBox.scale` as the tolerance so the grab
  slop stays constant on screen at any zoom), which keeps the interaction logic
  pure and 100%-branch testable instead of scattered across DOM listeners.

Cost per frame: two style updates. Cost of the pure math: O(1).

## Components (all `"use client"`)

- **`CropStartCard.tsx`** — left-column card. Inactive: explanatory copy +
  **Start crop** (disabled with no image / while busy). Inactive **and
  cropped**: also "Cropped to `W × H px` — from `W₀ × H₀`" and **Revert to
  uncropped** (R15). Active: a notice that cropping restarts the pipeline
  (adjustments, palette, and flatten edits are discarded on Apply) — Apply and
  Cancel live in the size panel so the decision and its controls sit together.
- **`CropWorkspace.tsx`** — replaces `BeforeAfterPreview` in the preview column
  while the stage is active. Owns all transient crop state: `size: PrintSize`,
  the two string drafts + per-field error, `rect: CropRect`, and the active
  drag (`{ target: Handle | "inside"; grabDx; grabDy } | null`, a ref so
  pointer moves don't re-render through it). Receives from the island:
  `working` (the framing reference image), `entrySize` (for Reset), `busy`, and
  callbacks `onApply(rect)` / `onCancel`. Derived per render:
  `ratio = aspectRatio(size)`, the readout via `effectivePxPerMm` /
  `pxPerMmToDpi` / `resolutionLevel` / `pixelsKeptPercent`. A `[working]`
  effect re-fits the rect if the reference image is ever replaced. Owns the
  crop keyboard map.
- **`CropCanvas.tsx`** — the interactive canvas: `useCanvasView` viewport +
  transform wrapper holding the base canvas (`paint(working)`) and the DOM
  overlay. `onMouseDown` → `mapClickToPixel` → `hitTestHandle` → begin drag (or
  nothing in the letterbox / outside the rect); window `mousemove`/`mouseup`
  continue and end it using `boxPointToImage` (clamped) → `moveRect` /
  `resizeRect`; hover sets the cursor via `handleCursor`. Space-held or
  middle-button presses defer to the hook's pan (never both). Renders the
  Expand toggle and the hints strip (R20). **No Download button here** — the
  crop stage is a decision, not an export; Download stays on the normal
  preview, which is one Cancel/Apply away.
- **`CropSizePanel.tsx`** — the two labelled mm inputs (`inputMode="decimal"`,
  inline `role="alert"` per field on invalid input, R3), the preset buttons
  (`aria-pressed` via `matchingPreset`), **Swap orientation**, **Fit** /
  **Fill** / **Reset**, the readout block (`W × H px · x% of pixels kept ·
  W × H mm · N.N px/mm (D dpi)`) with the R11 caution/warning (`role="status"`
  / `role="alert"`), the R12 note about the 2048 px working cap, and **Apply
  crop** (disabled while `busy` or any mm field is invalid) + **Cancel**.

### Keyboard map (window listener, mounted only while the crop stage is active)

| Key | Action | Guards |
|---|---|---|
| Arrows | nudge the rect by `NUDGE_PX` (R19) | not in a text input; clamped per R6 |
| Shift + Arrows | nudge by `NUDGE_COARSE_PX` | same |
| `Esc` | Cancel the crop stage (R14) | — |
| `Space` (held) | left-drag pans instead of cropping (R17) | handled inside `useCanvasView` |

The text-entry guard is the same predicate feature 12 uses (`HTMLInputElement`
of a text-ish type / `HTMLTextAreaElement` / `HTMLSelectElement`), so typing
`5` in an mm field never nudges the rectangle. The island's palette Ctrl/Cmd+Z
listener is inert during crop (its `canUndo` requires the quantized stage), and
the flatten key map is unmounted with `FlattenWorkspace`.

## Auth & security

Unchanged from features 11 and 12: the `(app)` layout guard plus the page's
`requireUser()` before the single `Color` catalog read. This feature adds **no**
mutation, no new server surface, and no new data exposure — the image still
never leaves the browser (R13, R22). No Zod schema is added because no server
boundary exists; the mm inputs are validated by the pure `parseMmInput` at the
UI boundary.

## Test approach

- **Vitest — `lib/crop-core.ts` at 100% branch coverage**, tiny synthetic
  images (e.g. 8×8, 100×100, 1536×2048 rect math with no buffers): `parseMmInput`
  (decimals, comma separator, whitespace, empty, `abc`, `0`, negative, `1e9`,
  too many decimals, range ends); `aspectRatio` / `swapOrientation` /
  `describeAspect` (portrait/landscape/square) / `matchingPreset`;
  `fitRect` (portrait target on a landscape image and vice versa, exact-ratio
  identity case where Fit covers the whole image, centring with odd remainders);
  `clampRectToImage` (oversize both axes, min-size floor, translate-inside,
  idempotence); `fillRect` (grows around an off-centre framing and stays
  inside); `refitRect` (centre + area preserved, then clamped); `moveRect`
  (clamps at all four edges); `resizeRect` (all 8 handles, ratio locked, anchor
  fixed, growth stopped at the bounds instead of overflowing, min-size floor,
  determinism); `hitTestHandle` (corner precedence, edge, inside, outside →
  null, tolerance boundary); `contentBoxOf` / `boxPointToImage` (letterbox
  clamping both axes, degenerate box → null, **agreement with
  `mapClickToPixel` on in-content points**); `imageRectToBoxFractions`;
  `effectivePxPerMm` + `pxPerMmToDpi` + `resolutionLevel` (both thresholds from
  both sides) + `pixelsKeptPercent`; `cropPixels` (exact pixels extracted, size
  = rect, input unmutated, out-of-bounds rect clamped rather than throwing, no
  resampling: a 1:1 crop is byte-identical).
- **Component (RTL, `getBoundingClientRect` mocked as in the 11/R21 and
  12 suites; the worker hook keeps its existing core-backed fake):**
  - `CropWorkspace.test.tsx` — mm input → ratio re-lock; invalid input → error,
    unchanged rect, Apply disabled; each preset + swap; Fit / Fill / Reset;
    interior drag moves and clamps; each handle drag resizes ratio-locked and
    refuses to overflow; letterbox press starts no drag; drag continued
    off-image clamps; arrows and Shift+arrows nudge; typing in an mm field does
    not nudge; readout values and both warning tiers; hints strip; Esc cancels;
    a drag while zoomed/panned (mocked transformed rect) resolves correctly.
  - `ImagePrep.test.tsx` (extend) — Start crop offered from loaded / adjusted /
    quantized / flatten and disabled while busy; entering hides the palette and
    disables Adjust/Posterize/Start-flatten while the dropzone still loads a
    file (discarding the crop stage); **Apply** replaces the Original pane with
    the cropped image at the exact rect size and discards palette + flatten
    (fresh `loaded` stage, Undo gone); **Cancel** restores the quantized stage
    with its palette-undo depth intact and the flatten stage with its counter
    and history intact; **Revert to uncropped** restores the upload and then
    disappears; Download after Apply exports the cropped pixels; **no worker
    request is posted** by any crop interaction (assert the fake's call count).
  - `FlattenWorkspace.test.tsx` — **unmodified**, proving the `useCanvasView`
    extraction changed no flatten behavior.
- **E2E `e2e/crop.spec.ts`** (Playwright, credential-gated exactly like
  `e2e/image-prep.spec.ts` — skipped when `E2E_EMPLOYEE_*` are absent, reusing
  `e2e/fixtures/image-prep-sample.png`): upload → **Start crop** → readout
  shows the default 71.7 × 94 mm crop in px and px/mm → pick the `100 × 100`
  preset (readout becomes square) → **Swap orientation** → back to
  `71.7 × 94` → drag a corner handle → **Fit** → **Apply crop** → the Original
  pane reports the cropped dimensions and the palette/flatten controls are back
  in their fresh state → **Revert to uncropped** restores the full size →
  Download suggests `image-prep-sample-prepped.png`. Written, **not executed**
  (repo convention: E2E suites are credential-gated and skip without
  `.env.local` credentials).
- **Coverage targets:** `lib/crop-core.ts` **100% branch**; ≥ 80% lines on every
  other changed module (`ImagePrep`, `CropWorkspace`, `CropCanvas`,
  `CropSizePanel`, `CropStartCard`, `use-canvas-view`, `FlattenCanvas` after
  the extraction). **No config change is authorized** — no new coverage
  exclusion, no threshold edit.

## Delivery

**A single phase.** The feature is materially smaller than 12: one pure core,
one extracted hook, four small components, one island stage with no history and
no mutations, and no worker/protocol work at all. `tasks.md` is sliced by layer
(core math → shared hook/canvas → panel UI → island wiring → tests/E2E) with
each task independently verifiable; inventing phases here would add ceremony,
not reviewability.

## Open items

- None. Option B (resampling to an explicit px/mm), persisted user presets,
  rotation, non-uniform stretch, padding-to-ratio, and touch gestures are
  explicitly deferred (see `requirements.md` → Out of scope).
