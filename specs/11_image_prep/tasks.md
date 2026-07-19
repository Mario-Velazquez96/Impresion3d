# Tasks — 11_image_prep

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.
> Read `design.md` first. **This feature touches NO schema and adds NO
> migration, Server Action, route handler, Storage bucket/policy, env var, or
> dependency** — if a task seems to need one, stop and re-read the spec. The
> only allowed config edit is the vitest coverage exclude noted below.

## Implementation

- [x] Create `lib/image-prep-core.ts` — part 1, foundations: the exported constants (`MAX_WORKING_DIMENSION` 2048, `MAX_FILE_BYTES` 20 MB, `MIN_COLORS`/`MAX_COLORS`/`DEFAULT_COLORS` 2/32/8, `NEUTRAL_SATURATION_THRESHOLD` 0.12, `DEFAULT_MERGE_DISTANCE`, `DEFAULT_TINY_COVERAGE_PERCENT`, `AUTO_LEVELS_CLIP`), the types (`Rgb`, `PixelBuffer`, `PaletteEntry`, `IndexedImage`, `AdjustSettings`), and the color math: `hexToRgb`/`rgbToHex`, `rgbToHsl`, `luminance601` (Rec. 601), `colorDistance` (redmean), `fitWithin`, `downloadFileName`, `formatByteSize`. Pure — no DOM, no Prisma, no React, no `server-only`, no new dependency; document why it lives outside `lib/services/` (R2, R4, R7, R9, R17)
- [x] `lib/image-prep-core.ts` — part 2, adjust stage: `IDENTITY_ADJUSTMENTS`, `buildAdjustmentLut` (brightness → contrast → gamma in that fixed order, 256 entries, clamped, identity in = identity table), `luminanceHistogram` (256-bin Uint32Array), `autoLevelsRange` (percentile clip, flat-image edge → identity range), `applyAdjustments` (LUT → saturation mix around luma → optional auto-levels; returns a NEW buffer, never mutates) (R5, R6)
- [x] `lib/image-prep-core.ts` — part 3, posterize: `medianCutPalette` (clamp n to 2–32, longest-axis median split weighted by count, count-weighted box means, defined tie-breaks, NO randomness), `nearestIndex` (redmean argmin, lowest index wins ties), `quantize(src, n, dither)` → `IndexedImage` — flat nearest mapping, or Floyd–Steinberg error diffusion (7/16, 3/16, 5/16, 1/16, clamped) when `dither`; counts filled from the mapping (R7, R8)
- [x] `lib/image-prep-core.ts` — part 4, palette ops + rendering: `coveragePercent`, `classifyPalette` (neutrals `s < 0.12` sorted lightness desc; colors sorted hue asc; returns index arrays), `mergeEntries` (index remap via old→new table, counts summed, `from === into` no-op), `mergeSimilar` (repeat closest-pair-below-threshold, smaller count into larger, defined tie-break), `mergeTiny` (smallest-first absorb into nearest remaining by distance, stop at one entry), `snapToCatalog` (nearest catalog hex, same-target entries merged, `catalog` label set, empty catalog → input unchanged), `indexedToPixels`. All pure/immutable (R9, R10, R11, R12, R13, R14, R15)
- [x] Create `components/image-prep/worker-messages.ts` (typed `WorkerRequest`/`WorkerResponse` protocol incl. the serialized `IndexedImage` shape) and `components/image-prep/image-prep.worker.ts` — a stateless, logic-free dispatcher: deserialize → call the core (`applyAdjustments`+`luminanceHistogram` for `adjust`; `quantize` for `quantize`; merge/snap + `indexedToPixels` for `palette` ops) → respond with buffers in the transfer list; catch errors into `{ ok: false, error }` (R5, R6, R7, R8, R10–R13, R18)
- [x] Create `components/image-prep/useImagePrepWorker.ts` (`"use client"`) — lazy `new Worker(new URL("./image-prep.worker.ts", import.meta.url))` in a ref, terminate on unmount, Promise-per-request correlated by id, rejection on `ok: false`, and a `busy` flag while any request is in flight (R18)
- [x] Create `components/image-prep/types.ts` (`ColorView`) and `components/image-prep/ImageDropzone.tsx` (`"use client"`) — labelled file input (`accept="image/png,image/jpeg,image/webp"`) + drag/drop target; client-side type + `MAX_FILE_BYTES` guards BEFORE decode; user-safe errors in a `role="alert"` region that leave prior state untouched; caption "W × H px · size" via `formatByteSize`; downscale notice when the working image was reduced (R2, R3, R4)
- [x] Create `components/image-prep/AdjustPanel.tsx` and `components/image-prep/HistogramChart.tsx` (`"use client"`) — brightness/contrast/saturation/gamma range sliders (labelled, value shown, identity defaults), auto-levels checkbox, Reset, and Apply (disabled while busy); slider movement alone triggers NO computation. Histogram = inline SVG bars over the 256-bin array with an accessible label (R5, R6, R18)
- [x] Create `components/image-prep/PosterizePanel.tsx` (`"use client"`) — N slider `min=2 max=32` default 8 (value shown), dithering checkbox default OFF, Posterize button (disabled with no image / while busy) (R7, R8, R18)
- [x] Create `components/image-prep/PalettePanel.tsx` (`"use client"`) — Neutrals/Colors groups from `classifyPalette`, each entry a `<button aria-pressed>` with hex-filled swatch dot (`aria-hidden`, app convention), hex text, coverage % (1 dp); tap-two merge with deselect-on-same-tap; "Merge similar" (0–150 slider, default `DEFAULT_MERGE_DISTANCE`), "Merge tiny" (0–20% slider, default `DEFAULT_TINY_COVERAGE_PERCENT`), "Snap to filaments" — disabled + explanatory note when the catalog is empty; snapped entries show filament name + hex (R9, R10, R11, R12, R13, R14)
- [x] Create `components/image-prep/BeforeAfterPreview.tsx` (`"use client"`) — "Original" and "Preview" canvases painted via `putImageData` in a ref-guarded effect (jsdom-safe), plus the Download PNG button: offscreen canvas → `toBlob("image/png")` → object URL → `<a download={downloadFileName(name)}>` click → revoke; no network (R15, R17)
- [x] Create `components/image-prep/ImagePrep.tsx` (`"use client"`) — the island: the `Stage` union state (`empty → loaded → adjusted → quantized`) so upstream changes structurally discard downstream results; File decode helper (white-flattened, `fitWithin`-downscaled canvas draw → `PixelBuffer`); wire all panels to `useImagePrepWorker` (Apply → adjust+histogram; Posterize → quantize; palette buttons → palette ops with preview back); working image = newest stage; busy propagation (R2, R4, R5, R7, R10–R16, R18)
- [x] Create `app/(app)/image-prep/page.tsx` (Server Component, thin): `await requireUser()` (**no** `requireAdmin`), ONE query `db.color.findMany({ select: { id, name, hex }, orderBy: { name: "asc" } })`, `metadata.title = "Image prep — Tower Layers"`, render heading + `<ImagePrep catalogColors={…} />` with serializable props (R1, R13, R19)
- [x] Add an **"Image prep"** `<Link href="/image-prep">` to `components/layout/MainNav.tsx`, after "Finances" and **outside** the `showAdmin` block (R1)
- [x] **Palette undo (R20)** — add a bounded, client-only undo history of palette states to the `quantized` stage in `components/image-prep/ImagePrep.tsx`: a `history: { image; preview }[]` field seeded by Posterize with the baseline result, pushed by each palette-cleanup action (capped at `MAX_PALETTE_HISTORY` = 20, oldest dropped), and a `handleUndo` that pops it as PURE client state (no worker re-post, no recompute) restoring the prior `image`/`preview`; `canUndo = quantized && !busy && history.length > 1`; a `Ctrl/Cmd+Z` listener that reuses `handleUndo` and only `preventDefault`s when `canUndo`. Add `canUndo`/`onUndo` props + a secondary-styled **Undo** button to `components/image-prep/PalettePanel.tsx`. No worker, `lib/image-prep-core.ts`, schema, dependency, or persistence change (R20)
- [x] **Pick-from-image / eyedropper (R21)** — client-only. Add ONE pure helper `paletteIndexAt(image, x, y)` to `lib/image-prep-core.ts` (clamp x/y into bounds → `indices[y·width + x]`); no other core/worker/protocol/schema/dependency change. Lift the palette `selected` index from `PalettePanel` into `ImagePrep` as controlled props (`selected`/`onSelectedChange`), preserving R10 tap-to-merge, and move the `[image]` selection-reset up (reset when the quantized image ref changes / stage leaves quantized). Add a `pickMode` flag + a "Pick from image" toggle in `PalettePanel` (`aria-pressed`, active style); pass `pickMode`/`onPick` to `BeforeAfterPreview`, which gives the Preview canvas `cursor-crosshair` and an onClick that maps via the pure `mapClickToPixel` (inverts object-contain scale/centering, rejects letterbox clicks). `ImagePrep.handlePick` guards quantized, computes `paletteIndexAt`, and selects the entry; pick mode stays on for repeated picking. Optional "Picked" readout (R21)
- [x] Confirm the no-persistence contract holds: `prisma/schema.prisma` and `prisma/migrations/` untouched, no `actions/` file, no `app/api/` route, no Storage code, no `.env.example` entry, no new `package.json` dependency; the only config diff (if used) is the vitest coverage exclude for the worker entry with its one-line reason (R19)
- [x] **Multi-select merging (R22, supersedes tap-two R10)** — core: add `mergeManyEntries(image, from[], into)` (dedupe `from`, ignore `into` inside it, remap + sum counts, survivor keeps color AND catalog, no-op when nothing left) and `mergeEntriesToAverage(image, indices[])` (count-weighted average RGB rounded per channel at the LOWEST selected index, catalog cleared on the survivor, `< 2` distinct indices no-op, unweighted-mean fallback for an all-zero-count selection) to `lib/image-prep-core.ts`; protocol: swap `{ kind: "merge" }` for `{ kind: "mergeMany" }` + `{ kind: "mergeAverage" }` in `PaletteAction` and dispatch them in the worker with identical preview regeneration (R22)
- [x] **Multi-select merging (R22)** — UI: `ImagePrep` selection becomes `number[]` with a `toggleSelected` handler shared by swatch taps (R10) and the eyedropper (R21 now TOGGLES membership); reset-on-palette-change invariant preserved. `PalettePanel` gets `selected[]`/`onToggleSelected`/`onClearSelection`/`onMergeMany`/`onMergeAverage` props, swatches toggle with the existing `ring-2 ring-ring` + `aria-pressed` marking, and a selection action bar under the swatch groups: "N selected", **Merge to average** + **Merge into one of them…** (disabled below 2 selected; the latter an inline dependency-free chooser listing the selected entries with swatch + hex + filament name), **Clear**. Helper copy rewritten for multi-select; the "Picked" readout folded into the bar's count (R10, R21, R22)

## Tests

**Coverage target: `lib/image-prep-core.ts` at 100% BRANCH coverage** (the
repo's pure-core standard, matching `lib/pricing-core.ts`); ≥ 80% lines on the
other changed modules. `components/image-prep/image-prep.worker.ts` may be
coverage-excluded (logic-free browser shell, exercised by E2E — see design.md).

- [x] Vitest `lib/__tests__/image-prep-core.test.ts` — foundations: `hexToRgb`/`rgbToHex` round trip (#RGB and #RRGGBB, case-insensitive, malformed throws), `rgbToHsl` known values (greys s=0), `luminance601` (black 0, white 255, known mid), `colorDistance` orders a near pair below a far pair and is 0 for identical colors, `fitWithin` (no-op under max; 4096×2048 → 2048×1024), `downloadFileName` ("photo.jpg" → "photo-prepped.png", extensionless and dotted names), `formatByteSize` (R2, R4, R17)
- [x] Vitest (core) — adjust: identity settings ⇒ pixel-identical output and identity LUT; brightness raises, contrast spreads around 128, gamma known value, saturation ±100 (grey unchanged; -100 fully desaturates to luma); clamping at 0/255; a new buffer is returned and the source is unmutated (R5)
- [x] Vitest (core) — histogram + auto-levels: 256 bins summing to pixel count with known placement; `autoLevelsRange` percentile bounds on a synthetic histogram; flat single-luma image → identity range (no divide-by-zero); `applyAdjustments` with `autoLevels: true` stretches a low-contrast buffer to full range (R5, R6)
- [x] Vitest (core) — median cut: an image with k ≤ N distinct colors returns exactly those k colors; two clear RGB clusters at N=2 split into their means; n clamps (1→2, 50→32); **determinism** — two runs on the same input are deeply equal; `nearestIndex` picks the true nearest and breaks ties to the lowest index (R7)
- [x] Vitest (core) — quantize + dither: flat mapping gives ≤ N distinct output colors with correct `counts` (sum = w·h); a hand-computed Floyd–Steinberg case (e.g. 2×2 grey vs black/white palette) matches the 7/16-3/16-5/16-1/16 diffusion exactly; dither off produces flat bands on a gradient (fewer distinct colors than dither on) (R7, R8)
- [x] Vitest (core) — palette stats + classification: `coveragePercent` values sum to 100 (± float epsilon); `classifyPalette` puts `s < 0.12` entries in neutrals sorted light→dark and the rest in colors sorted by ascending hue; boundary entry at exactly the threshold lands per the documented comparison (R9)
- [x] Vitest (core) — merges: `mergeEntries` remaps all `from` pixels to `into`, sums counts, drops the entry, no-ops on `from === into`, and does not mutate its input; `mergeSimilar` merges the closest sub-threshold pair first (smaller count absorbed), iterates until none remain, and leaves distant palettes untouched; `mergeTiny` absorbs smallest-first into the nearest remaining color, respects the threshold boundary, and stops at one entry (R10, R11, R12)
- [x] Vitest (core) — snap: each entry maps to its nearest catalog hex with the `catalog` label set and `color` replaced; two entries nearest the same filament merge into one (counts summed); empty catalog returns the input unchanged; `indexedToPixels` renders exact palette colors per index (R13, R14, R15)
- [x] Component `components/image-prep/__tests__/ImagePrep.test.tsx` (worker hook mocked with a synchronous core-backed fake) — upload path: a valid PNG File shows dimensions + formatted size; a `.txt` and an oversize file each show the `role="alert"` error and leave prior state intact; the downscale notice appears for an oversized image (decode helper mocked) (R2, R3, R4)
- [x] Component — adjust: sliders render with identity defaults; moving a slider fires NO worker request; Apply fires exactly one and the histogram chart re-renders with the returned bins; controls disabled while the mocked request is pending (busy) (R5, R6, R18)
- [x] Component — posterize: slider bounds 2–32 with default 8, dither checkbox unchecked by default; Posterize sends `{ colors, dither }` and the palette panel appears with swatches, hexes, and coverage % (R7, R8, R9)
- [x] Component — palette interactions: tap A then B issues the merge (A into B) and the panel updates; tapping A twice deselects without merging; "Merge similar" / "Merge tiny" send their threshold values; with an empty catalog the snap button is disabled with the note; with a catalog, snap relabels entries with filament names (R10, R11, R12, R13, R14)
- [x] Component — pipeline integrity: after posterize, re-running Apply discards the palette and the preview reverts to the adjusted stage; loading a new file resets everything; the Download button carries the `<a download>` name `<base>-prepped.png` (`toBlob`/object-URL mocked) and triggers no fetch (R15, R16, R17)
- [x] Component `components/image-prep/__tests__/ImagePrep.test.tsx` (extend) — palette undo: Undo is disabled at the fresh-posterize baseline; after a palette action it enables and restores the previous palette/preview with NO worker call; repeated Undo walks back to the baseline then disables; re-running Posterize resets the history (Undo disabled again); Undo is disabled while the worker is busy; `Ctrl+Z` reverts the last action (R20)
- [x] Vitest (core) — `paletteIndexAt` returns the entry index at (x, y) and clamps out-of-bounds coordinates on each axis (in-bounds, edge, low/high clamp) so the core stays at 100% branch (R21)
- [x] Unit `components/image-prep/__tests__/BeforeAfterPreview.test.tsx` — `mapClickToPixel` inverts the object-contain scale/centering, rejects letterbox-margin and far-edge clicks, and returns null for a degenerate zero-size box (R21)
- [x] Component `components/image-prep/__tests__/ImagePrep.test.tsx` (extend) — pick from image: toggling "Pick from image" sets `aria-pressed` + a crosshair on the Preview canvas; with pick mode on, a click (mocked rect) selects the entry the pixel maps to and shows the "Picked" readout; pick-then-tap-another still merges; a letterbox click selects nothing (R21)
- [x] Component `components/layout/__tests__/MainNav.test.tsx` (extend) — the **Image prep** link renders with `href="/image-prep"` for BOTH `showAdmin={false}` and `showAdmin={true}` (R1)
- [x] Commit a small fixture `e2e/fixtures/image-prep-sample.png` (a few solid color blocks, ≤ 64×64) for the E2E flow (R7, R9)
- [x] E2E `e2e/image-prep.spec.ts` (Playwright, **credential-gated** on the employee credentials, skipping when absent — mirrors `e2e/calculator.spec.ts`) — signed out, `/image-prep` redirects to `/login`; signed in as an EMPLOYEE, the **Image prep** nav link is visible and navigates there (R1)
- [x] E2E — signed in: upload the fixture, Apply defaults, Posterize at 8, see the palette with coverage percentages, snap to filaments (seeded catalog) and see filament names, then Download and assert the suggested filename `image-prep-sample-prepped.png` via the download event — this path exercises the REAL worker and canvas decode (R2, R5, R7, R9, R13, R17, R18, R19)
- [x] Vitest (core) — multi-select merges: `mergeManyEntries` remaps every source into the survivor, sums counts, drops sources, dedupes `from` and ignores the survivor inside it, no-ops (same reference) when nothing is left, keeps the survivor's color + catalog, and matches `mergeEntries` for a single source; `mergeEntriesToAverage` puts the rounded count-weighted average at the lowest index with the catalog cleared, leaves unselected entries alone, dedupes, no-ops below two distinct indices, and falls back to the unweighted mean for an all-zero-count selection — keeping the core at 100% branch (R22)
- [x] Component `components/image-prep/__tests__/ImagePrep.test.tsx` (rewrite tap-merge model) — tapping swatches toggles a multi-selection with no worker call; the action bar shows the right count with merges disabled at 1 selected and enabled at ≥ 2; Clear empties the selection; "Merge to average" sends `mergeAverage` and renders the weighted-average result; "Merge into one of them…" lists only the selected entries and keeps the chosen survivor (incl. its filament label after snap) while sending `mergeMany`; pick-from-image TOGGLES membership (same pixel deselects; a pick adds to a tap-selection and the pair merges via the bar); Undo after a multi-merge restores the prior palette; the existing undo suite runs on the new merge flow (R10, R20, R21, R22)
- [x] `typecheck`, `lint`, and `test` (with coverage) pass; the 100% branch target on `lib/image-prep-core.ts` is met

## Verification

- `/image-prep` is reachable by any signed-in user from the nav (app **and**
  admin); signed-out redirects to `/login` (R1).
- Upload/drop works for PNG/JPEG/WebP with dimensions + size shown; bad or
  oversize files error safely; > 2048 px images downscale with a notice
  (R2–R4).
- Apply is on-demand, identity by default, and refreshes the histogram
  (R5, R6).
- Posterize (2–32, default 8) is deterministic median cut in the worker; dither
  is opt-in Floyd–Steinberg (R7, R8).
- The palette shows coverage %, neutrals vs colors; multi-select toggling +
  the action-bar merges (average / into-one-of-them / clear), merge-similar,
  and merge-tiny behave as specified (R9–R12, R22).
- Snap maps every entry to the nearest catalog filament, merging duplicates;
  empty catalog disables it gracefully (R13, R14).
- Before/after stays truthful; upstream changes discard downstream results;
  Download yields `<base>-prepped.png` client-side (R15–R17).
- Worker ops show busy state and never freeze the page (R18).
- **Nothing is persisted**: no schema/migration diff, no action or route
  handler, no Storage code, no env var, no dependency (R19).

## Coverage target

- **`lib/image-prep-core.ts`: 100% branch coverage** (pure-core standard).
- ≥ 80% lines on the other changed modules (island, panels, hook, page, nav);
  the worker entry may be excluded per design.md.
- **Traceability:** R1 → MainNav test + E2E redirect/nav; R2 → core
  foundations + component upload + E2E; R3 → component reject tests; R4 →
  core `fitWithin` + component notice; R5 → core adjust/auto-levels +
  component adjust + E2E; R6 → core histogram + component histogram; R7 →
  core median-cut/quantize + component posterize + E2E; R8 → core dither +
  component dither default; R9 → core stats/classify + component palette +
  E2E; R10 → core `mergeEntries`/`mergeManyEntries` + component
  toggle-selection tests (amended: multi-select, see R22); R11 → core
  `mergeSimilar` + component; R12 → core `mergeTiny` + component; R13 → core
  snap + component + E2E; R14 → core empty-catalog + component disabled
  state; R15 → core `indexedToPixels` + component pipeline test; R16 →
  component pipeline-integrity test; R17 → core `downloadFileName` +
  component download + E2E; R18 → component busy tests + E2E; R19 → the
  no-persistence implementation check + E2E (no writes anywhere); R20 →
  component palette-undo tests (baseline-disabled, restore-previous,
  walk-back-to-baseline, re-posterize-resets, busy-disabled, Ctrl+Z,
  restore-after-multi-merge); R22 → core `mergeManyEntries` /
  `mergeEntriesToAverage` tests + component multi-select suite (toggle
  accumulates, enablement/count, merge-to-average math, survivor-keeps-
  catalog, Clear, pick toggles membership, undo restores). Every R1–R22
  traces to at least one test task.
