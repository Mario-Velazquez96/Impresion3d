# Requirements — 13_crop

**Feature:** Crop-to-print-size stage for the image-prep tool — enter a target
physical print size in millimetres, crop the working image to that exact
aspect ratio keeping the maximum available pixels, and commit the crop so the
whole pipeline runs on the cropped image
**Source:** product-owner decision (2026-07-21) — kills the external Canva
round-trip
**Depends on:** 11_image_prep (`/image-prep`, `lib/image-prep-core.ts`, the
Stage union in `ImagePrep.tsx`, the R16 upstream-invalidation invariant, the
R21 click geometry `mapClickToPixel`), 12_flatten (`lib/flatten-core.ts` view
math, the `FlattenCanvas` overlay + `ResizeObserver` content-measurement
pattern, the stage-with-`resume` pattern)

## Purpose

The workshop generates images at **3:4**, then leaves the app for **Canva** to
crop them to an exact physical print size (the standing reference: **71.7 ×
94 mm**) before feeding HueForge. This feature removes that round-trip.

A physical print size in millimetres is really **two** requirements:

1. the **aspect ratio** — exact, and needs no DPI choice; and
2. an **absolute pixel size** — which would need a px/mm decision and a
   resample.

For HueForge only (1) matters: HueForge maps the image onto the physical
footprint and resamples internally. The product owner therefore chose
**option A — ratio-only**: crop to the exact aspect ratio derived from the mm
values and **keep the maximum available pixels**. The tool **never resamples**
to an explicit pixel target, never upscales, and never stretches. The mm values
exist to derive a ratio and to make the **effective px/mm** readout honest.

Like features 11 and 12, this is **stateless and client-only**: nothing is
persisted, no schema/server/dependency change, and the result still leaves the
app only through the existing Download PNG. All new geometry/unit math is
**pure** and lives in a new sibling core, `lib/crop-core.ts`, unit-tested to
**100% branch coverage**.

## In scope

- A **crop stage** added to the existing `/image-prep` pipeline (no new route,
  no new server surface): a "Crop to print size" card that enters the stage
  from **any** loaded stage (`loaded`, `adjusted`, `quantized`, `flatten`),
  and a crop workspace that replaces the before/after preview while active.
- **Target print size in millimetres**: two numeric inputs accepting decimals
  (e.g. `71.7` × `94`), a small set of **built-in constant presets**, and a
  **swap orientation** control that exchanges the two mm values
  (portrait ↔ landscape).
- A **crop rectangle locked to the derived aspect ratio**, drawn over the
  working image: drag the interior to reposition, drag any of 8 handles to
  resize; the rectangle can never leave the locked ratio, never leave the
  image bounds, and never shrink below a minimum side.
- **Fit** (largest ratio-locked rectangle, centred), **Fill** (grow the current
  rectangle to the maximum size around its own centre), and **Reset** (target
  size back to stage-entry value + rectangle back to Fit).
- A **live readout**: resulting crop pixel dimensions, share of working pixels
  kept, target mm, and **effective px/mm** (crop px ÷ target mm) with an
  equivalent DPI, plus a **low-resolution warning** with a justified threshold.
- **Apply crop**, which commits the crop to the pipeline's source image so
  every downstream stage (adjust, posterize, flatten) operates on the cropped
  result, discarding stale downstream results exactly as Apply-adjustments does
  (11/R16); **Cancel**, which leaves the stage with nothing changed; and
  **Revert to uncropped**, which restores the full uploaded image.
- **`lib/crop-core.ts`** — the pure core: mm parsing/validation, aspect ratio +
  orientation, the built-in preset table, ratio-locked rectangle construction
  (fit / fill / refit-to-new-ratio), rectangle move / handle-resize / clamping,
  handle hit-testing, `object-contain` box↔image point mapping, effective
  px/mm + the resolution grading, and the pixel crop itself. Zero DOM
  dependency, no new npm dependency.
- Reuse of proven pieces rather than new geometry: the R21 `mapClickToPixel`
  geometry, the `paint()` jsdom-guarded canvas helper, the `ResizeObserver`
  content measurement, and the `zoomAt`/`panBy`/`clampView` view math of
  feature 12.

## Out of scope

- **Persistence of any kind.** No Prisma model/field/**migration**, no RLS
  change, no Server Action, no route handler, no Supabase Storage read/write,
  no `localStorage`/cookie/URL state, no env var, no new npm dependency. Reload
  = a fresh, empty tool. (Same contract as 11/R19 and 12/R28.)
- **Persisted user-defined presets** — explicitly excluded **because they would
  break the no-persistence contract**: remembering a user's own print sizes
  requires either `localStorage` or a Prisma table + migration. Presets in this
  feature are **built-in module constants** only; a user's one-off size is
  typed into the two mm inputs for that session.
- **Resampling to an explicit pixel target (option B)** — no px/mm or DPI input
  that rescales the image, no upscaling, no "export at 300 dpi". The crop keeps
  the pixels it already has.
- **Rotation** (any angle, including 90°), **non-uniform stretch/squash**,
  perspective correction, and content-aware / smart-subject cropping.
- **Padding or outpainting** to reach a ratio (letterboxing the image with
  bars) — the tool only removes pixels.
- Multiple saved crops, crop presets per image, or a crop history stack beyond
  the single-level **Revert to uncropped** (R15).
- Touch/pinch gestures (mouse + keyboard, internal desktop tool), matching
  12's scope decision.
- Zod validation: there is **no server boundary** to validate — the mm inputs
  are client-side only.

## Requirements (EARS)

**R1 (Event-driven):** When the user activates **Start crop** — offered
whenever an image is loaded (stage `loaded`, `adjusted`, `quantized`, or
`flatten`) and no worker operation is running — the system shall enter the
**crop stage** showing the **current working image** as the framing reference,
with the target print size defaulting to `DEFAULT_PRINT_SIZE` (**71.7 ×
94 mm**), the crop rectangle at its default **Fit** position (largest
ratio-locked rectangle, centred), and a default view (zoom 1, no pan, Expand
off); the exact pre-crop stage shall be preserved internally so **Cancel**
(R14) can restore it.

**R2 (Event-driven):** When the user edits either millimetre input — two
separate numeric fields accepting **decimal** values (e.g. `71.7`), with `.`
or `,` accepted as the decimal separator — to a value within
`[MIN_PRINT_MM, MAX_PRINT_MM]`, the system shall re-derive the target aspect
ratio and **re-lock the existing rectangle** to it, preserving the
rectangle's centre and pixel area as closely as the image bounds allow, and
shall update the readout (R10).

**R3 (Unwanted behavior):** If a millimetre input is empty, non-numeric, zero,
negative, or outside `[MIN_PRINT_MM, MAX_PRINT_MM]`, then the system shall
show an inline field error, shall leave the target size, aspect ratio, and
crop rectangle **unchanged**, shall disable **Apply crop**, and shall not
crash.

**R4 (Event-driven):** When the user activates one of the **built-in preset**
buttons — module constants exported as `CROP_PRESETS`, including the
workshop's **71.7 × 94 mm** — the system shall set both millimetre inputs to
that preset, re-derive the ratio, and re-lock the rectangle exactly as R2
does, marking the matching preset as active (`aria-pressed`).

**R5 (Event-driven):** When the user activates **Swap orientation**, the
system shall exchange the two millimetre values (portrait ↔ landscape),
re-derive the ratio, and re-lock the rectangle as R2 does; activating it twice
shall return to the original size.

**R6 (Ubiquitous):** The system shall maintain the crop rectangle so that, at
every moment and after every operation (R2, R4, R5, R7, R8, R9, R19), it has
**integer pixel** coordinates and size, lies **entirely inside** the working
image, has both sides ≥ `MIN_CROP_PX`, and matches the target aspect ratio to
within the unavoidable rounding of **one pixel** on the derived side (the
derived side is `round(other × ratio)`, so the achieved ratio error is below
0.1% — under 0.05 mm on a 94 mm print — and is physically irrelevant to
HueForge, which resamples onto the footprint anyway).

**R7 (Event-driven):** When the user presses the primary mouse button inside
the crop rectangle (not on a handle) and drags, the system shall **translate**
the rectangle by the pointer movement — its size and ratio unchanged — clamped
so it stays fully inside the image, and shall keep tracking the drag when the
pointer leaves the image content, clamping instead of losing the drag.

**R8 (Event-driven):** When the user presses one of the **eight handles**
(4 corners + 4 edge midpoints) and drags, the system shall **resize** the
rectangle from the opposite anchor (corner handles anchor the opposite corner;
edge handles anchor the opposite edge and hold the perpendicular axis centred)
with the **aspect ratio locked**, clamped so that both sides stay ≥
`MIN_CROP_PX` and the rectangle never crosses the image bounds — a drag beyond
the bounds shall stop growing rather than break the ratio or overflow.

**R9 (Event-driven):** When the user activates **Fit**, the system shall set
the rectangle to the largest ratio-locked rectangle that fits inside the image,
centred; when the user activates **Fill**, the system shall grow the current
rectangle to that same maximum size **around its own centre**, translating
minimally to stay inside the image (keeping the user's framing while
recovering maximum pixels); when the user activates **Reset**, the system
shall restore both the target print size it had on entering the stage **and**
the default Fit rectangle.

**R10 (Ubiquitous):** While the crop stage is active the system shall display a
live readout of: the **resulting crop size in pixels** (`W × H px`), the share
of the working image's pixels kept, the **target size in mm**, and the
**effective px/mm** (crop pixels ÷ target mm, 1 decimal — reported as the
smaller of the two axes, which agree to within R6's rounding) together with its
equivalent **DPI** (`px/mm × 25.4`), all recomputed on every rectangle or
target-size change.

**R11 (Unwanted behavior):** If the effective px/mm falls below
`PX_PER_MM_COMFORTABLE` (**5 px/mm**), then the system shall show a gentle,
non-blocking caution that the print may look soft; if it falls below
`PX_PER_MM_MIN` (**2.5 px/mm**), then the system shall show a stronger warning
that detail will be visibly lost. *Justification, tied to a 0.4 mm-nozzle
HueForge print:* a 0.4 mm nozzle can lay down at most **2.5 distinguishable
features per millimetre** in XY, so 2.5 px/mm is exactly **one image pixel per
printable feature** — the floor below which the image, not the printer, is the
limit; `PX_PER_MM_COMFORTABLE = 5` is **two image pixels per printable
feature**, the Nyquist-style margin that keeps colour transitions from
aliasing into visible stair-steps. Neither threshold blocks **Apply crop** —
they inform, they do not gate.

**R12 (Ubiquitous):** The system shall state in the crop panel that the readout
is computed from the **working image**, whose longest side is capped at
`MAX_WORKING_DIMENSION` (**2048 px**) on load, and that cropping only ever
**removes** pixels — so the effective px/mm can only **decrease** from its
current value and can be raised only by choosing a smaller target size in mm
(never by cropping, and never by re-uploading a larger file, which is
downscaled to the same cap).

**R13 (Event-driven):** When the user activates **Apply crop** with a valid
target size and no operation running, the system shall crop the pipeline's
**source (original) image** — not the posterized/flattened preview — to the
current rectangle, entirely on the main thread, and shall commit the result as
a **fresh loaded stage** whose original is the cropped image, thereby
**discarding every downstream result** (adjusted image, histogram, quantized
image, palette **and its palette-undo history**, and any flatten edits) under
the same upstream-invalidation invariant as Apply-adjustments (11/R16) and
leaving the crop stage; the before/after preview, all subsequent stages, and
Download PNG shall then operate on the cropped image, at exactly the
rectangle's pixel dimensions (**no resampling**). The rectangle chosen against
the working image is valid on the original because every pipeline stage is
dimension-preserving.

**R14 (Event-driven):** When the user activates **Cancel** (or the crop card's
exit control), the system shall restore the **exact** pre-crop stage —
including, when entered from a quantized stage, the palette and its
palette-undo history, and when entered from a flatten stage, the flatten
working image, its undo history, and its regions-flattened counter — leaving
the image untouched; the crop stage itself holds **no image edits**, so there
is nothing to undo within it beyond **Reset** (R9), and there is no Redo.

**R15 (Event-driven):** When the user activates **Revert to uncropped** —
offered whenever the current original is a crop of the uploaded image — the
system shall restore the **as-uploaded** (decoded, cap-downscaled) image as a
fresh loaded stage, discarding downstream results exactly as R13 does; this is
a single level that always returns to the full upload, so repeated crops can
never strand the user, and it disappears once the uncropped image is restored.

**R16 (State-driven):** While the crop stage is active, the system shall hide
the palette panel and disable the Adjust, Posterize, and Start-flatten
controls (cropping is a modal geometry decision whose commit discards them
anyway), while keeping the **dropzone live** — loading a new file shall
discard the crop stage and start a fresh pipeline.

**R17 (Event-driven):** When the user scrolls the wheel over the crop canvas,
the system shall zoom toward the cursor by `ZOOM_FACTOR` per notch within
`[MIN_ZOOM, MAX_ZOOM]` without scrolling the page; when the user drags with the
**middle button** or with **Space held + primary drag**, the system shall pan
the clamped view; an **Expand** toggle shall enlarge the canvas area; the view
shall reset on entering the stage (R1). Primary-button drags without Space are
crop interactions (R7, R8), never pans.

**R18 (Ubiquitous):** The system shall resolve every pointer position to an
exact image pixel under the combination of `object-contain` letterboxing
**and** the current zoom/pan — reusing the 11/R21 geometry against the
CSS-transformed canvas box — such that a press landing in the letterbox margin
starts **no** drag, while an in-progress drag whose pointer leaves the content
continues with coordinates **clamped** into the image.

**R19 (Event-driven):** When the user presses an **arrow key** while the crop
stage is active and focus is not in a text input, the system shall nudge the
rectangle by `NUDGE_PX` (1 px) in that direction — `NUDGE_COARSE_PX` (10 px)
while Shift is held — clamped per R6, so the crop is fully operable from the
keyboard; **Esc** shall cancel the stage (R14).

**R20 (Ubiquitous):** While the crop stage is active the system shall display a
visible **keyboard/mouse hints strip**: drag to move · handles to resize ·
arrows nudge (Shift ×10) · scroll zoom · space-drag pan · Esc cancel.

**R21 (Ubiquitous):** The crop shall run **on the main thread with no Web
Worker action** — it is a single row-wise buffer copy of at most one working
image (≤ 2048² RGBA ≈ 16 MB, a few milliseconds), and a worker round-trip
would add two extra copies plus a protocol change for no gain — so the system
shall add **no** new worker op, message type, or hook change; the Apply control
shall still be disabled while another worker operation is running or the target
size is invalid.

**R22 (Ubiquitous):** The system shall persist **nothing**: this feature adds no
Prisma model/field/migration, no RLS change, no Server Action, no route
handler, no Storage access, no `localStorage`/cookie/URL state, no env var,
and no npm dependency; the page's only server interaction remains the existing
`Color` catalog read, the built-in presets are compile-time constants, and a
reload starts from a fresh, empty tool.

## Acceptance

- With any image loaded, **Start crop** enters the stage showing the current
  working image with a centred rectangle at 71.7 × 94 mm and the default view;
  the palette panel disappears and Adjust/Posterize/Start-flatten are disabled
  while the dropzone still accepts a new file (R1, R16).
- Typing `100` / `150` re-locks the rectangle to 2:3 keeping its centre;
  clicking the **71.7 × 94** preset restores that ratio with the preset marked
  active; **Swap orientation** turns 71.7 × 94 into 94 × 71.7 and the rectangle
  turns landscape; typing `abc` or `0` shows an inline error, changes nothing,
  and disables Apply (R2–R5).
- Dragging the interior moves the rectangle and it stops at the image edges;
  dragging a corner or edge handle resizes it with the ratio visibly locked and
  it refuses to grow past the bounds or below the minimum size; arrow keys
  nudge by 1 px and Shift+arrows by 10 px (R6–R8, R19).
- **Fit** returns the largest centred rectangle; after moving the rectangle to
  a corner, **Fill** grows it to maximum size around that framing; **Reset**
  restores both the entry target size and the Fit rectangle (R9).
- The readout shows e.g. `1562 × 2048 px · 71.7 × 94 mm · 21.8 px/mm (553
  dpi)`; setting the target to `400 × 500 mm` drops it under 5 px/mm and the
  caution appears, and a large enough target trips the stronger warning — Apply
  stays enabled in both cases; the panel states the 2048 px working cap and
  that cropping only reduces px/mm (R10–R12).
- On a posterized image, **Apply crop** yields a fresh pipeline whose Original
  pane **is** the cropped image at the readout's exact pixel size, with the
  palette panel and any flatten edits gone, and Download PNG exports the
  cropped image (R13).
- **Cancel** from a quantized stage returns the palette *and its Undo depth*
  exactly as left; Cancel from a flatten stage returns the flatten image,
  history, and counter exactly as left (R14).
- After a crop, **Revert to uncropped** restores the full uploaded image and
  then disappears; cropping again re-offers it (R15).
- Scroll zooms toward the cursor without scrolling the page, middle-drag and
  space-drag pan, Expand enlarges the canvas, and a handle drag while zoomed
  and panned still resizes about the correct pixel; a press in the letterbox
  starts no drag, and a drag continued off-image clamps rather than jumps
  (R17, R18). The hints strip is visible (R20).
- No worker message is posted by any crop interaction or by Apply
  (`worker-messages.ts` is unchanged), and Apply is disabled while another
  worker operation runs (R21).
- `prisma/schema.prisma` and `prisma/migrations/` are untouched; no action,
  route handler, Storage code, `.env.example` entry, or `package.json`
  dependency is added; presets exist only as constants in `lib/crop-core.ts`
  (R22).
