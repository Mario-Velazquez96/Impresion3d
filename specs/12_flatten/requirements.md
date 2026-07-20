# Requirements — 12_flatten

**Feature:** Region-by-region manual flatten stage for the image-prep tool —
hover a mask, grow/shrink it, click to select regions, collapse them to one
color, plus whole-image cleanup helpers (presets, despeckle) and undo
**Source:** product-owner decision (2026-07-19, reference-tool screenshots)
**Depends on:** 11_image_prep (the `/image-prep` page, `lib/image-prep-core.ts`,
the Web Worker + typed protocol, the Stage union in `ImagePrep.tsx`, the R20
undo pattern, and the R21 click geometry `mapClickToPixel`)

## Purpose

Posterize gets a HueForge design 90% of the way; the last 10% is manual: a
muddy patch that quantized into three near-identical colors, a noisy gradient
sky, a stray band of the wrong filament. **Flatten** is the manual cleanup
stage: hover an area of the working image to preview a mask (Flood snaps to
the contiguous similar-color region under the cursor, Smooth is flood tuned
for gradients, Brush is a plain circle), press **W/S** to grow or shrink the
next mask, **click** to add the region to a selection, and collapse the whole
selection to its single most-common color (or an alternate, a typed hex, or an
eyedropper pick). Whole-image helpers (Low/Medium/High auto-flatten presets
and Despeckle) remove HueForge spike pixels in one click. **Z** undoes the
last operation.

Like feature 11, this is **stateless and client-only**: nothing is persisted,
no schema or dependency changes, and the result leaves the app only via the
existing Download PNG. All new pixel math is **pure** and lives in a new
sibling core, `lib/flatten-core.ts`, unit-tested to **100% branch coverage**;
heavy operations (flood/smooth masks, fill, recolor, remove-small-regions) run
in the **existing Web Worker** as new typed actions.

## In scope

- A **flatten stage** added to the existing `/image-prep` pipeline (no new
  route): a "Flatten" card that enters the stage from **any** loaded image
  (loaded, adjusted, or quantized — post-posterize is the primary use),
  snapshotting the current working image. Entering preserves the pre-flatten
  stage internally so **Exit flatten** restores it exactly; upstream
  operations (Apply, Posterize, new file) discard the flatten stage per the
  pipeline's R16-style invalidation invariant.
- **`lib/flatten-core.ts`** — the pure core: mask type + flood / smooth /
  brush mask builders, catch-stray-islands expansion, mask set operations
  (union, subtract, contains, count, outline), selection color statistics
  (most-common + runner-ups), fill application, exact-color image-wide
  recolor, remove-small-regions (the shared algorithm behind Despeckle and
  the Low/Medium/High presets), the flatten-canvas overlay builder, zoom/pan
  view math, hex-input parsing, and every tuning constant. Zero DOM
  dependency; no new npm dependency.
- **Web Worker extensions** (existing worker, new typed actions): `mask`
  (flood/smooth region under a seed, with optional stray capture) and
  `flatten` (fill selection, recolor every match, remove small regions), plus
  a `background` request option on the client hook so hover-mask requests do
  not flip the global busy state.
- A dedicated **flatten workspace** replacing the before/after preview while
  the stage is active: an interactive canvas (hover mask outline, selection
  outlines, scroll zoom, middle-/space-drag pan, Expand toggle, keyboard
  hints strip, Download PNG), a tool controls panel (mode, size, catch
  strays, presets, Despeckle, Undo, Reset all, regions-flattened counter,
  Exit), and a fill panel (suggested color + runner-ups, hex input,
  eyedropper Pick, Flatten selection, Clear, Recolor every match).
- **Flatten-scoped undo** (Z), mirroring the R20 pattern of feature 11: a
  bounded, client-only history inside the flatten stage, pure client-state
  pop, entirely separate from the palette undo history.
- Constants exported from the core so tests and UI pin the same values:
  tolerance/radius defaults, ranges, and W/S steps; stray-island limits;
  runner-up cap; despeckle and preset region thresholds; history cap; zoom
  limits and factor; overlay colors/alphas.

## Out of scope

- **Persistence of any kind.** No Prisma model/field/migration, no RLS
  change, no Server Action, no route handler, no Supabase Storage read/write,
  no `localStorage`/cookie/URL state, no env var, no new dependency. Reload =
  a fresh tool. (Same contract as feature 11's R19.)
- **AI anything** — no ML-assisted segmentation, upscaling, or generative
  fill. Masks are deterministic geometry/color math.
- **Changing the posterize pipeline itself** — no edits to the adjust /
  posterize / palette algorithms, the palette undo semantics, or the existing
  worker ops; feature 12 only *adds* to the protocol and the Stage union.
- **Touch/mobile gestures** beyond basic clicks — no pinch-zoom, no
  touch-drag panning, no long-press. Mouse + keyboard is the target (internal
  desktop tool).
- Redo, persisted/cross-reload undo, or undoing Enter/Exit-flatten themselves
  (Exit already discards; entering is free of edits).
- Free-form painting (the brush *selects*; it never paints color directly),
  lasso/polygon selection, crop/rotate/geometry edits.
- Anti-aliased or feathered masks — masks are binary; this is a posterized-
  output tool where hard edges are the point.

## Requirements (EARS)

**R1 (Event-driven):** When the user activates **Start flatten** — offered
whenever an image is loaded (stage `loaded`, `adjusted`, or `quantized`) and
no worker operation is running — the system shall enter the **flatten stage**
with the current working image as both the flatten working image and the
Reset-all entry snapshot, an undo history seeded with that single baseline
(Undo disabled), a **regions-flattened counter at 0**, and a default view
(zoom 1, no pan, Expand off).

**R2 (State-driven):** While the flatten stage is active, the system shall
hide the palette panel (any quantized palette is stale against manual pixel
edits), shall keep the Adjust and Posterize panels functional against the
**pre-flatten** upstream images, and — when the user applies adjustments,
re-posterizes, or loads a new file — shall **discard the flatten stage and
all its edits** (the upstream-invalidation invariant of 11/R16 extended one
stage further); the flatten stage shall internally preserve the exact
pre-flatten stage so R3 can restore it.

**R3 (Event-driven):** When the user activates **Exit flatten**, the system
shall restore the exact pre-flatten stage — including, when entered from a
quantized stage, the palette **and its palette-undo history** unchanged —
discarding all flatten edits, with control copy warning that flatten edits
are discarded.

**R4 (State-driven):** While the flatten stage is active and the pointer is
over image content on the flatten canvas (not letterbox margin), the system
shall display an **outline preview of the mask a click would add**, computed
for the active mode, current tolerance/radius, and catch-strays setting, and
shall refresh it as the cursor moves or those inputs change and clear it when
the pointer leaves the content area; flood/smooth hover masks shall be
computed **in the Web Worker** with at most one hover request in flight and
stale responses discarded (only the newest pointer state wins), while brush
hover masks are computed synchronously on the main thread (O(radius²)).

**R5 (Ubiquitous):** In **Flood** mode the system shall build the mask as the
**4-connected** region of pixels reachable from the seed whose color distance
(the core's redmean metric) **from the seed pixel's color** is ≤ the current
tolerance, deterministically (same image, seed, and tolerance always yield
the same mask).

**R6 (Ubiquitous):** In **Smooth** mode the system shall build the mask as
the 4-connected region reachable from the seed by steps whose color distance
**between neighboring pixels** is ≤ the current tolerance (local chaining, so
gradients and skies that drift far from the seed color are still captured),
deterministically.

**R7 (Ubiquitous):** In **Brush** mode the system shall build the mask as the
filled circle of the current radius centered on the cursor (pixels with
`dx² + dy² ≤ r²`), clipped to the image bounds.

**R8 (Event-driven):** When the user presses **W** (grow) or **S** (shrink)
while the flatten stage is active and focus is not in a text input, the
system shall step the active mode's size — tolerance by `TOLERANCE_STEP` for
Flood/Smooth, radius by `BRUSH_RADIUS_STEP` for Brush — clamped to the
exported ranges, shall display the current value, and shall apply it to the
**next** mask (the hover preview refreshes; already-selected regions are
untouched).

**R9 (Optional):** Where the **"Catch stray pixels"** checkbox is enabled (it
applies to Flood and Smooth only), the system shall also include in the mask
every 4-connected island of pixels matching the seed color within the current
tolerance that is **disconnected** from the main region, has an area ≤
`STRAY_MAX_ISLAND_PX`, and lies within the main region's bounding box
expanded by `STRAY_MARGIN_PX` on each side.

**R10 (Event-driven):** When the user clicks image content on a pixel that is
**not** in the current selection (and eyedropper pick mode is off), the
system shall add the hovered mask — **minus any already-selected pixels**, so
stored regions stay disjoint — to the selection as a new region and shall
update a running **"N px selected"** count (the size of the union).

**R11 (Event-driven):** When the user clicks a pixel that **is** in the
current selection, the system shall **remove the region containing that
pixel** from the selection (adding nothing), updating the count.

**R12 (Event-driven):** When the user presses **Esc** or activates **Clear**,
the system shall empty the selection without changing the image; the
selection (and any hover mask) shall also be cleared automatically whenever
the flatten working image is replaced (fill, recolor, preset, despeckle,
undo, reset) — stale masks over changed pixels are never shown.

**R13 (State-driven):** While the selection is non-empty, the fill panel
shall show the **suggested fill**: the selection's most-common exact color
(swatch + hex + its **% of the selection**, 1 decimal) plus up to
`MAX_RUNNER_UPS` runner-up swatches (the next-most-common colors, count
descending, deterministic tie-breaks by first scan-order appearance),
recomputed whenever the selection changes; the **chosen fill** shall reset to
the suggested color each time the selection changes.

**R14 (Event-driven):** When the user clicks a runner-up (or the suggested
swatch), the system shall set it as the chosen fill; when the user types a
valid hex color (3- or 6-digit, case-insensitive, leading `#` optional) it
shall become the chosen fill; **if** the typed value is not a valid hex,
**then** the system shall show an inline error, leave the chosen fill
unchanged, and not crash.

**R15 (Event-driven):** When the user toggles the fill **Pick** (eyedropper)
control on (`aria-pressed`, crosshair cursor) and clicks image content, the
system shall set the chosen fill to that pixel's color from the flatten
working image; while pick mode is on, canvas clicks shall **not** modify the
selection and the hover mask preview is suppressed; pick mode stays on for
repeated picking until toggled off.

**R16 (Event-driven):** When the user activates **Flatten selection** (button
or **Enter**) with a non-empty selection and no operation running, the system
shall set **every selected pixel** to the chosen fill via the Web Worker,
replace the flatten working image, increment the regions-flattened counter by
the **number of regions** in the selection, clear the selection, and push the
prior state onto the flatten undo history.

**R17 (Event-driven):** When the user activates **Recolor every match** —
enabled only while the selection is non-empty **and** the chosen fill differs
from the suggested color — the system shall replace every pixel in the whole
image **exactly equal** to the suggested color with the chosen fill via the
Web Worker, clear the selection, and push the undo history; the
regions-flattened counter is unchanged.

**R18 (Event-driven):** When the user activates a **Low / Medium / High**
auto-flatten preset, the system shall run **remove-small-regions** in the Web
Worker with the corresponding exported threshold
(`PRESET_MAX_REGION_PX.low/medium/high`): every 4-connected exact-color
region with area ≤ the threshold is recolored to the most common color along
its border (deterministic tie-breaks, smallest regions first), the result
replacing the working image with the undo history pushed and the selection
cleared.

**R19 (Event-driven):** When the user activates **Despeckle**, the system
shall run remove-small-regions with `DESPECKLE_MAX_REGION_PX` (isolated stray
pixels/pairs — HueForge spike removal) via the Web Worker, replacing the
working image, pushing the undo history, and clearing the selection.

**R20 (Event-driven):** When the user presses **Z** (no modifier; Ctrl/Cmd+Z
is also accepted while the flatten stage is active) or activates **Undo**,
the system shall revert the last flatten operation (fill, recolor, preset,
despeckle) as a **pure client-state pop** of a bounded history (cap
`MAX_FLATTEN_HISTORY`, oldest entries dropped) restoring **both** the pixels
and the regions-flattened counter — no worker post, no recompute — repeatable
back to the stage-entry baseline where Undo disables again; Undo shall be
disabled while a worker operation runs, the key shall be ignored while focus
is in a text input, and this history shall be **entirely separate** from the
palette undo history of 11/R20 (which is preserved untouched inside the
resume snapshot). There is no Redo.

**R21 (Event-driven):** When the user activates **Reset all**, the system
shall restore the stage-entry snapshot as the working image, reset the
history to that single baseline (Undo disabled), reset the counter to 0, and
clear the selection — correct even after the history cap has dropped early
entries.

**R22 (Ubiquitous):** While the flatten stage is active the system shall
display an **"N regions flattened"** counter obeying R16 (increment by
regions collapsed), R20 (restored by undo), and R21 (reset to 0).

**R23 (Event-driven):** When the user scrolls the wheel over the flatten
canvas, the system shall zoom by `ZOOM_FACTOR` per notch **toward the cursor
position**, clamped to `[MIN_ZOOM, MAX_ZOOM]`, without scrolling the page;
when the user drags with the **middle button** or with **Space held + left
drag**, the system shall pan the view, clamped so the image cannot leave the
viewport entirely; an **Expand** toggle shall enlarge the working canvas
area; the view resets on entering the stage (R1).

**R24 (Ubiquitous):** The system shall resolve every hover, click, and
eyedropper pick to an exact image pixel under the combination of
`object-contain` letterboxing **and** the current zoom/pan — reusing the R21
geometry (`mapClickToPixel`) against the CSS-transformed canvas box — and
shall ignore pointer positions falling in the letterbox margin.

**R25 (Ubiquitous):** While the flatten stage is active the system shall
display a visible **keyboard-hints strip**: Click add region · Click selected
= remove · W/S resize · Enter flatten · Esc clear · Scroll zoom · Z undo.

**R26 (State-driven):** While a flatten **mutation** (fill, recolor, preset,
despeckle) is running, the system shall show the busy indicator and disable
the controls that would start a conflicting operation, with all heavy pixel
work (flood/smooth masks, fill, recolor, remove-small-regions) running in the
**existing Web Worker** so the page stays responsive; hover-mask requests are
**background** requests that never flip the global busy state.

**R27 (Event-driven):** When the user activates **Download PNG** while the
flatten stage is active, the system shall export the current **flatten
working image** as `<original-base-name>-prepped.png`, entirely client-side
(unchanged mechanics from 11/R17).

**R28 (Ubiquitous):** The system shall persist **nothing**: this feature adds
no Prisma model/field/migration, no RLS change, no Server Action, no route
handler, no Storage access, no `localStorage`/cookie/URL state, no env var,
and no npm dependency; the page's only server interaction remains the
existing `Color` catalog read, and a reload starts from a fresh, empty tool.

## Acceptance

- With a posterized image, **Start flatten** appears and enters the stage
  with counter 0, Undo disabled, default view; it also works straight from a
  freshly loaded (never adjusted/posterized) image (R1). The palette panel
  disappears; pressing Apply or Posterize afterwards discards flatten work;
  **Exit flatten** returns to the exact prior stage — after entering from a
  quantized stage, the palette *and its Undo depth* are exactly as left (R2,
  R3).
- Hovering the canvas outlines the region under the cursor; the outline
  tracks the cursor, changes with W/S and with mode switches, and disappears
  over the letterbox (R4, R8, R24). Flood selects only the contiguous
  similar-color patch; Smooth follows a gradient sky far beyond the seed
  color; Brush is a plain circle clipped at the edges (R5–R7). With "Catch
  stray pixels" on, small same-color islands near the region join the mask;
  off, they don't (R9).
- Clicking adds the outlined region and "N px selected" grows; clicking
  inside a selected region removes exactly that region; Esc empties the
  selection (R10–R12).
- With a selection, the panel shows the most-common color with hex + "% of
  selection" and runner-up swatches; clicking an alternate, typing `#ff0000`,
  or eyedropper-picking sets the fill; typing `zzz` shows an inline error and
  changes nothing (R13–R15).
- **Flatten selection** (or Enter) collapses all selected pixels to the fill,
  bumps the counter by the region count, and clears the selection; with a
  different fill chosen, **Recolor every match** swaps the suggested color
  image-wide (a matching pixel outside the selection changes too) (R16, R17,
  R22).
- Low/Medium/High presets progressively remove larger small-regions; Despeckle
  removes an isolated 1-px spike, replacing it with its dominant neighbor
  (R18, R19).
- **Z** reverts the last fill/recolor/preset/despeckle (pixels AND counter),
  repeatedly back to the baseline where Undo disables; typing "z" in the hex
  field does not undo; **Reset all** returns to the entry snapshot with
  counter 0 even after > `MAX_FLATTEN_HISTORY` operations (R20–R22).
- Scroll zooms toward the cursor within limits without scrolling the page;
  middle-drag and space-drag pan; Expand enlarges the canvas; clicks still
  land on the correct pixel while zoomed and panned (R23, R24). The hints
  strip is visible (R25).
- During a preset on a large image the page stays interactive with a busy
  state, and the flatten buttons are disabled until it completes; hover masks
  never flash the global busy indicator (R26).
- Download while flattening yields `<base>-prepped.png` matching the flatten
  working image, with no network request (R27).
- `prisma/schema.prisma` and `prisma/migrations/` are untouched; no action,
  route handler, Storage code, env var, or `package.json` dependency is added
  (R28).
