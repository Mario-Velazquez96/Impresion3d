# Requirements — 11_image_prep

**Feature:** Client-side image prep tool for HueForge designs — adjust,
posterize, clean the palette, snap to the filament catalog, download PNG
**Source:** product-owner decision (2026-07-16)
**Depends on:** 02_catalog_management (the `Color` catalog: name + hex),
01_auth (`requireUser`, the `(app)` layout guard)

## Purpose

Give any signed-in user a tool to turn a source image into a **HueForge-ready
design**: a posterized image whose few flat colors correspond to the filaments
the workshop actually owns (the `Color` catalog). The tool is **stateless** —
like the price calculator (09), it is a thinking tool, not a record. Nothing it
produces is saved anywhere; the only server dependency is a **read** of the
existing `Color` catalog. The result leaves the app exclusively as a
**downloaded PNG**.

All image math lives in a **pure core** (`lib/image-prep-core.ts`) mirroring
`lib/pricing-core.ts` / `lib/planning-core.ts`: no DOM, no Prisma, no React, no
`server-only` — it operates on plain arrays and `ImageData`-like structures, so
it is unit-testable to **100% branch coverage** with tiny synthetic buffers.
Pixel-heavy operations run in a **Web Worker** so the UI never freezes; the
worker is a thin, stateless dispatcher over the pure core.

## In scope

- A new route **`/image-prep`** inside the authenticated `(app)` group, so it
  inherits that layout's guard plus its own `requireUser()` — **any** signed-in
  user (EMPLOYEE or ADMIN); no admin gating. An **"Image prep"** link in the
  shared `components/layout/MainNav.tsx`, visible to all authenticated users.
- **`lib/image-prep-core.ts`** — the pure core: color conversions (hex↔RGB,
  RGB→HSL, Rec. 601 luminance), adjustment LUTs (brightness/contrast/gamma),
  saturation, auto-levels, the luminance histogram, **median-cut quantization**,
  nearest-palette mapping, **Floyd–Steinberg dithering**, palette statistics
  (per-entry coverage %), palette classification (neutrals vs colors), the three
  merge operations (tap-two, merge-similar, merge-tiny), nearest-catalog
  snapping, and indexed→RGBA rendering. Zero DOM dependency; no new dependency.
- A **Web Worker** (stateless) that receives an operation + pixel buffers,
  calls the core, and transfers the result back, plus a small client hook that
  wraps it in a Promise-based, busy-tracked API.
- The page's **reference-data read** (Server Component, one Prisma query): the
  `Color` catalog (`id`, `name`, `hex`), name-ordered.
- A **Client island** (`ImagePrep` + panels) owning the whole pipeline state:
  1. **Upload/drop** an image (PNG/JPEG/WebP), shown with its dimensions and
     file size; alpha is flattened over white on decode; oversized images are
     downscaled to a working size.
  2. **Adjust** (optional, applied on demand via an Apply button): brightness,
     contrast, saturation, gamma sliders (identity defaults) and an auto-levels
     checkbox, plus a 256-bin **luminance histogram** of the adjusted image.
  3. **Posterize**: reduce to N colors (slider **2–32, default 8**) via
     median-cut quantization in the worker; optional **Floyd–Steinberg
     dithering** (checkbox, **off by default** — flat bands print better in
     HueForge).
  4. **Palette cleanup** on the quantized result: entries with hex + coverage
     %, split into **neutrals** (low saturation, sorted light→dark) and
     **colors** (sorted by hue); **tap two** entries to merge; **merge
     similar** (pairwise color-distance threshold); **merge tiny** (absorb
     entries below a coverage % into the nearest remaining color).
  5. **Snap to filaments**: remap every palette entry to the nearest hex in
     the `Color` catalog, labelling entries with the filament's name.
  6. **Before/after preview** (original vs current working image) and
     **Download PNG** of the current working image.
- Constants with defaults, exported from the core so tests pin them: max
  working dimension **2048 px**, max file size **20 MB**, neutral saturation
  threshold **0.12**, merge-similar and merge-tiny defaults.

## Out of scope

- **Persistence of any kind.** No Prisma model, no field, **no migration**, no
  RLS change, no Server Action, no route handler, **no Supabase Storage
  write**, no `localStorage`/cookie/URL state, no env var. The prepared image
  leaves the app only via the Download button. Reload = a fresh, empty tool.
- **AI upscaling** and any generative enhancement.
- **Background removal.**
- **Crop, rotate, flatten, or brush/paint tools** — no geometry edits and no
  manual pixel editing. (The automatic proportional **downscale** of oversized
  images is a working-size guard, not a crop tool.)
- Saving results to Supabase Storage or any DB table; linking a prepped image
  to a `Print`. **In-session, client-only undo of palette-cleanup edits is in
  scope (R20)**; anything beyond it — persisted/cross-reload undo, a Redo
  stack, or undoing Posterize/Apply/file-load (all re-runnable via their own
  controls) — is not.
- HueForge project files (`.hfp`), layer/slice calculations, or filament TD
  values — the output is a plain PNG.
- Server-side image processing; everything after the catalog read is
  client-local.
- Zod validation: there is **no server boundary** to validate — nothing is
  submitted. File checks are client-side.

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall provide an `/image-prep` page inside the
authenticated `(app)` route group, such that an unauthenticated request is
redirected to `/login` and any signed-in user (EMPLOYEE or ADMIN) may use it
without admin gating, and shall render an **"Image prep"** link in the shared
nav for **all** authenticated users (both the app and admin navs).

**R2 (Event-driven):** When the user selects a file via the picker **or** drops
one onto the drop zone, and the file is a PNG, JPEG, or WebP within the size
limit, the system shall decode it into the working image (flattening any alpha
over white), display it with its **pixel dimensions** (width × height) and
**file size**, and enable the adjustment stage.

**R3 (Unwanted behavior):** If the selected/dropped file is not a PNG, JPEG, or
WebP, exceeds **20 MB**, or fails to decode, then the system shall show a
user-safe error message, shall not crash, and shall leave any previously loaded
image and pipeline state unchanged.

**R4 (Unwanted behavior):** If the decoded image's longest side exceeds
**2048 px**, then the system shall proportionally downscale the working image
so its longest side is 2048 px and shall display a notice showing the original
and working dimensions.

**R5 (Event-driven):** When the user activates **Apply** in the adjust panel,
the system shall produce the adjusted working image by applying, in this fixed
order: **brightness** (−100…100, default 0), **contrast** (−100…100, default
0), **gamma** (0.2…3.0, default 1.0), **saturation** (−100…100, default 0),
and — where the **auto-levels** checkbox is checked — a percentile-clipped
levels stretch; with all controls at their defaults and auto-levels off, Apply
shall leave the image pixel-identical (identity). Moving a slider alone shall
**not** recompute the image (adjustments are applied on demand).

**R6 (Ubiquitous):** The system shall display a **256-bin luminance histogram**
(Rec. 601 luma) of the current adjusted image, recomputed after every Apply.

**R7 (Event-driven):** When the user activates **Posterize** with a color count
N chosen on a slider (**2–32, default 8**), the system shall quantize the
adjusted image to **at most N distinct colors** via **median-cut** running in
the **Web Worker**, deterministically (the same input and N always yield the
same palette and output).

**R8 (Optional):** Where the **dithering** checkbox is enabled (it is **off by
default**), the system shall apply **Floyd–Steinberg error diffusion** against
the quantized palette during posterization; where it is disabled, each pixel
shall map to its nearest palette color, producing flat bands.

**R9 (State-driven):** While a quantized result exists, the system shall
display the computed palette — each entry with its color swatch, hex value, and
**coverage %** (entry pixels ÷ total pixels; the displayed percentages summing
to 100% within rounding) — split into **neutrals** (HSL saturation below the
neutral threshold, sorted by lightness, light→dark) and **colors** (sorted by
hue ascending).

**R10 (Event-driven):** When the user taps a palette entry it becomes the
selected source (visually marked); when the user then taps a **different**
entry, the system shall merge the source into that target — remapping all
source pixels to the target color, combining their coverage, and removing the
source entry; tapping the already-selected entry shall deselect it without
merging.

**R11 (Event-driven):** When the user activates **"Merge similar"** with a
color-distance threshold, the system shall repeatedly merge the closest pair of
palette entries whose distance is below the threshold — absorbing the
smaller-coverage entry into the larger — until no pair remains below the
threshold.

**R12 (Event-driven):** When the user activates **"Merge tiny"** with a
coverage-% threshold, the system shall absorb every entry whose coverage is
below the threshold into its **nearest remaining** entry by color distance,
processing the smallest entries first, until every remaining entry meets the
threshold (or one entry remains).

**R13 (Event-driven):** When the user activates **"Snap to filaments"**, the
system shall remap each palette entry to the **nearest `Color` catalog hex**
(by the core's color-distance metric), merge any entries that snap to the same
filament, and label each resulting entry with the filament's **name and hex**.

**R14 (Unwanted behavior):** If the `Color` catalog is empty, then the system
shall disable the snap control and show an explanatory message instead of
throwing or producing an empty result.

**R15 (Ubiquitous):** The system shall show a **before/after preview**: the
original image beside the current working image (the newest completed stage —
adjusted, quantized, merged, or snapped), updated after every pipeline
operation.

**R16 (Event-driven):** When the user re-applies adjustments or loads a new
image, the system shall discard all downstream results (quantized image,
palette, merges, snap labels) so stale output is never shown, reverting the
"after" preview to the newest valid stage.

**R17 (Event-driven):** When the user activates **Download PNG**, the system
shall download the **current working image** at its working resolution as a
PNG named `<original-base-name>-prepped.png`, entirely client-side (no upload,
no network request, no Storage write).

**R18 (State-driven):** While a worker operation is running, the system shall
show a busy indicator and disable the controls that would start a conflicting
operation, and the heavy pixel work shall run **in the Web Worker** (off the
main thread) so the page remains responsive.

**R19 (Ubiquitous):** The system shall persist **nothing**: no database write
of any kind occurs from this feature (no model, no migration, no RLS change,
no Server Action, no route handler, no Storage write, no `localStorage`); its
only server interaction is the page's **read** of the `Color` catalog, and a
reload starts from a fresh, empty tool.

**R20 (Event-driven):** While a quantized result exists, the system shall keep
a bounded, client-only **undo history of palette states** (each the
`{ image, preview }` pair a palette operation produces) capped at a sane depth
(oldest states dropped beyond the cap), such that: a fresh Posterize
establishes the baseline as the sole history entry with **Undo disabled**; each
successful palette-cleanup action (tap-two **merge**, **merge-similar**,
**merge-tiny**, **snap-to-filaments**) pushes the prior state so that when the
user activates **Undo** the system reverts to it — repeatable back to the
fresh-posterize baseline, at which point Undo is disabled again — **without
re-posting work to the Web Worker or recomputing anything** (a pure client-state
pop that also clears any in-progress palette selection). Undo shall be **disabled
while a worker operation is running** and whenever no quantized result exists,
and re-running Posterize, applying adjustments, or loading a new file (which all
discard the quantized stage) shall reset or discard the history accordingly.
Undo does **not** revert the Posterize itself, Apply, or file load, and there is
**no Redo**.

## Acceptance

- Signed out, `/image-prep` redirects to `/login`. Signed in as an EMPLOYEE
  (not just an ADMIN), the page loads and the **Image prep** nav link is
  visible in both the app and admin navs and navigates there (R1).
- Dropping a small PNG shows the preview with e.g. "64 × 64 px" and its file
  size; a `.txt` file or a 25 MB file shows an error and changes nothing
  (R2, R3). A 4096×2048 image becomes a 2048×1024 working image with a notice
  (R4).
- Apply with default sliders and auto-levels off leaves pixels identical;
  raising brightness lightens the image; the histogram redraws after each
  Apply and reflects the adjustment (R5, R6).
- Posterize at the default **8** yields at most 8 distinct colors; running it
  twice on the same input yields identical output; the slider refuses values
  outside 2–32 (R7). With dithering off, areas are flat; toggling it on
  produces the Floyd–Steinberg pattern (R8).
- The palette lists every entry with swatch + hex + coverage %, percentages
  summing to ~100%, greys under the neutral column (light→dark) and the rest
  sorted by hue (R9).
- Tapping entry A then entry B removes A, grows B's coverage by A's, and
  recolors A's pixels to B; tapping A twice merely deselects (R10). "Merge
  similar" collapses near-duplicate entries below the threshold; "Merge tiny"
  absorbs sub-threshold slivers into their nearest color (R11, R12).
- With a seeded catalog, "Snap to filaments" relabels every entry with a
  catalog color's name + hex, and two entries nearest to the same filament
  collapse into one; with an empty catalog the button is disabled with a
  message (R13, R14).
- The before/after panes always show the original vs the newest stage; after
  re-applying adjustments, the old posterized result and palette disappear
  (R15, R16).
- Download produces `photo-prepped.png` (for `photo.jpg`) whose pixels match
  the working image; no network request fires (R17).
- During posterize of a large image the page stays interactive and shows a
  busy state; the posterize button is disabled until it completes (R18).
- No migration is added, `prisma/schema.prisma` is unchanged, no Server Action
  or route handler is created, no Storage bucket/policy is touched, no
  `.env.example` entry is added, and the feature adds **no runtime dependency**
  (R19).
