# Review — 12_flatten, Phase C + whole-feature final gate

**Reviewer pass:** 2026-07-20 · **Scope:** Phase C (R18, R19, R23, R24) AND the
final whole-feature validation (R1–R28), because Phase C closes the feature.

**Verdict: APPROVED** — the feature may be marked `done`.

---

## 1. Phase C correctness (code read)

### removeSmallRegions (Despeckle + presets) — correct

- **Iterative, no recursion blowup.** Component labeling and the border walk
  use an explicit `Int32Array` queue with FIFO head/tail indices. No recursion
  anywhere; the queue is preallocated to `width·height`, which bounds even a
  full-image single-color component.
- **Deterministic.** Component discovery scans row-major; BFS neighbor order is
  fixed (left, right, up, down); processing order is sorted by ascending area,
  then ascending first-pixel index. The border tally visits border indices
  sorted ascending, so Map insertion order is ascending first row-major
  appearance, and only a STRICTLY larger count replaces the running best —
  exactly the documented first-appearance tie-break.
- **Correct threshold semantics.** `if (component.indices.length > maxRegionPx)
  continue;` means area <= threshold is absorbed, matching R18/R19. Pinned by
  the "area == max absorbed, area == max+1 kept" test.
- **Does not erase legitimate detail.** Only components at or under the
  threshold are touched; larger ones are copied through untouched, and a
  borderless (whole-image) component is skipped rather than recolored.
- **Purity / no cross-contamination.** Labels, color keys and border colors are
  all sampled from the INPUT, never from the output copy, so overlapping
  recolors cannot interfere and the result is independent of processing order.
  Input never mutated. Pinned by the INPUT-sampling test.

### Presets Low / Medium / High — distinct and monotonically stronger

`PRESET_MAX_REGION_PX = { low: 8, medium: 32, high: 128 }`, Despeckle = 2 —
four distinct thresholds, each its own button calling `onCleanup(threshold)`.
Because components are labeled on the input independently of the threshold, the
absorbed set is a strict superset as the threshold grows, so
High ⊃ Medium ⊃ Low ⊃ Despeckle is structural, not incidental. Pinned by the
progressive-presets core test and by the component test asserting the wire
values 8 / 32 / 128 / 2.

### Zoom/pan click-mapping (the flagged main risk) — correct

Checked specifically for an off-by-scale bug. It is not present:

- `resolvePixel` reads `event.currentTarget.getBoundingClientRect()` on the
  base canvas, which sits INSIDE the CSS-transformed wrapper. The rect
  therefore already reflects `translate(panX,panY) scale(zoom)`: `rect.width`
  is the scaled box and `rect.left` the panned origin.
- `mapClickToPixel` is purely ratio-based (`scale = min(rectW/imgW,
  rectH/imgH)`, then `contentX / scale`), so the zoom factor cancels exactly
  and pan is absorbed by `clientX - rect.left`. Zero new click math was added —
  the R21 geometry is reused verbatim and is already unit-tested.
- Aspect ratio is safe: `paint()` sets `canvas.width/height` to the image
  dimensions and the canvas is `w-full h-auto`, so the box aspect matches the
  image; letterbox rejection still returns `null` via the existing guard.
- The view math (`clampView`, `zoomAt`, `panBy`) is PURE, lives in
  `lib/flatten-core.ts`, has no DOM dependency, and is unit-tested for zoom
  clamping at both ends, focal-point invariance under zoom in/out, pan bounds,
  and zoom-1-forces-origin.
- Behaviorally pinned by "resolves clicks to the correct pixel under a zoomed
  canvas box (R24)": a 2x2 image with a stubbed 4x4 box, clicking (1,1) must
  resolve to pixel (0,0). This test genuinely discriminates the bug — with a
  missing scale division the click would land on pixel (1,1), a different color
  region, and the assertion would fail.
- Hover uses the same `resolvePixel`, so the hover mask lands on the same pixel
  as the click at any view.

### Reset all, counter, undo participation

- `handleFlattenReset` restores `current: entry`, `regionsFlattened: 0`, and
  reseeds history to the single baseline. `entry` is held OUTSIDE the capped
  stack, so Reset all is correct even after `MAX_FLATTEN_HISTORY` trimming —
  pinned by the "even past the history cap" test.
- Counter is accurate: `handleFlattenMutated` bumps by `regionsCollapsed`
  (`regions.length` for fill, 0 for recolor/preset/despeckle);
  `handleFlattenUndo` restores pixels AND counter as one paired snapshot, so it
  can never drift.
- All Phase C ops go through the same `onMutated` path, so presets and
  Despeckle push undo history, clear the selection (via the `[current]`
  effect), and are reverted by Z — pinned by the test that runs all four
  cleanups then walks Z back until Undo re-disables.

### Coverage

`lib/flatten-core.ts` — **100% statements / 100% branch / 100% functions /
100% lines**, verified in my own run.

---

## 2. Whole-feature traceability R1-R28 - complete, no gaps

| R | Covering test(s) |
|---|---|
| R1 | ImagePrep.test "Start flatten is disabled with no image and enabled once loaded", "disabled while the worker is busy"; e2e (counter 0 on entry) |
| R2 | ImagePrep.test "Apply discards", "Posterize discards", "loading a new file discards"; palette-hidden assertion in the exit test; e2e |
| R3 | ImagePrep.test exit test - restores palette %, re-enables palette Undo, and EXERCISES it back to the pre-merge state; e2e Exit restores Palette |
| R4 | flatten-core buildFlattenOverlay suite; FlattenWorkspace "shows the outline overlay via a BACKGROUND flood request and clears over the letterbox", "clears the outline when the pointer leaves" |
| R5 | flatten-core floodMask suite (boundary, 4-connectivity, clamp, negative tol, determinism); workspace click-add |
| R6 | flatten-core smoothMask suite (chains a gradient floodMask rejects, step boundary, determinism); workspace smooth mode with its own W/S-stepped tolerance |
| R7 | flatten-core brushMask suite; workspace "a brush click selects the clipped circle without any worker mask call" |
| R8 | workspace "steps the flood tolerance, clamps at both ends, and refreshes the hover", "steps the brush radius, clamping at the minimum" |
| R9 | flatten-core addStrayIslands suite (absorb, size cap, margin bbox, no-op, unmutated); workspace catch-strays checkbox plus value riding the mask request |
| R10 | flatten-core mask set ops; workspace "click adds the hovered flood region and shows the union px count" |
| R11 | workspace "clicking a selected pixel removes exactly that region" |
| R12 | workspace "Esc empties the selection", "Clear empties the selection", "clears the selection when a cleanup replaces the image" |
| R13 | flatten-core maskStats suite; workspace "shows the suggested color with % of selection plus ordered runner-ups" |
| R14 | flatten-core parseHexInput suite; workspace "a valid typed hex becomes the fill; invalid shows an alert and changes nothing", "clicking a runner-up sets the chosen fill" |
| R15 | flatten-core colorAtPixel; workspace "Pick sets the fill from the clicked pixel WITHOUT altering the selection" |
| R16 | flatten-core applyFillToMask; workspace "the button collapses the selection and bumps the counter by the REGION count", "Enter flattens too"; e2e |
| R17 | flatten-core recolorExact; workspace "disabled at the suggested fill, enabled after choosing another, and swaps every match" (incl. a pixel OUTSIDE the selection) |
| R18 | flatten-core removeSmallRegions suite (majority border, tie-break, INPUT sampling, threshold boundary, progressive presets, determinism); workspace preset thresholds 8/32/128 |
| R19 | flatten-core speck-absorb plus borderless no-op; workspace Despeckle sends maxRegionPx 2; e2e Despeckle step |
| R20 | workspace "Z walks back to the baseline restoring pixels AND counter, then disables", "typing z in the hex input does NOT undo", "disables Undo while the worker is busy", plus the Phase-C cleanup undo walk; e2e z |
| R21 | workspace "Reset all restores the entry snapshot and counter 0 even past the history cap" |
| R22 | counter assertions across the R16/R18-R21 tests; e2e 0 -> 1 -> 0 regions flattened |
| R23 | flatten-core view math suite; workspace wheel-zoom in/out, middle-drag pan, Space-drag pan, Expand toggle |
| R24 | workspace "resolves clicks to the correct pixel under a zoomed canvas box"; letterbox rejection in the hover test; mapClickToPixel unit tests (R21 suite) |
| R25 | workspace "shows the keyboard-hints strip"; e2e Click add region visible |
| R26 | useImagePrepWorker.test background suite; workspace "disables the mutation controls while busy", "disables the preset + Despeckle buttons while busy", "surfaces a user-safe error"; e2e busy state |
| R27 | ImagePrep.test "Download during flatten names base-prepped.png with no network"; e2e suggestedFilename |
| R28 | git-status / diff verification below |

**No requirement is left without a genuine behavioral test.**

---

## 3. Full integration

- The whole chain reads coherently: enter -> flood/smooth/brush hover -> click
  add/remove -> fill panel (suggested / runner-ups / hex / eyedropper) ->
  Flatten selection -> recolor -> presets/despeckle -> zoom/pan -> Z-undo /
  Reset all -> Exit. Every mutation funnels through one `onMutated` contract,
  so history, counter, and selection-clearing behave identically for all five
  operation kinds.
- **Resume snapshot (R3):** `handleExitFlatten` is `setStage(current.resume)` -
  the EXACT pre-flatten stage object. The test proves the palette percentages
  AND the R20 palette-undo history survive, by clicking the restored palette
  Undo and asserting it walks back correctly and then disables.
- **R16/R2 invariant:** Apply / Posterize / new-file all read sources through
  `resume` and build fresh stages, so the flatten stage is STRUCTURALLY
  discarded - stale flatten state is unrepresentable. Three tests.
- **Two undo histories never interact:** the palette listener requires the
  `quantized` stage for its canUndo, which is false during flatten; the flatten
  key listener is mounted only while the workspace lives.
- **Features 00-11 unbroken:** the full 989-test suite passes, including the R20
  palette-undo, R21 eyedropper, and R23 palette-highlight suites.
  `lib/image-prep-core.ts` has an empty diff.

---

## 4. Scope

Phase C `git status` touches only `lib/flatten-core.ts`,
`image-prep.worker.ts`, `FlattenCanvas.tsx`, `FlattenControls.tsx`,
`FlattenWorkspace.tsx`, the two test files, `e2e/flatten.spec.ts`, plus
`progress/` and `specs/` docs. Verified empty diffs for `prisma/`,
`package.json`, `pnpm-lock.yaml`, `.env.example`, `next.config.ts`,
`vitest.config.ts`, `playwright.config.ts`. No Prisma model/migration, no
Server Action, no route handler, no Storage access, no localStorage/cookie/URL
state, no env var, no npm dependency, no config change - R28 holds.

---

## 5. Checks re-run by me

- `corepack pnpm typecheck` - clean, 0 errors.
- `corepack pnpm lint` - exit 0, no errors.
- `corepack pnpm test` - **989 passed / 989, 65 files passed / 65**, matching
  the reported figures exactly.
- Coverage: `lib/flatten-core.ts` **100 / 100 / 100 / 100**. Changed modules all
  >= 80% lines: FlattenControls 100, FlattenFillPanel 100, FlattenStartCard 100,
  canvas-paint 100, worker-messages 100, useImagePrepWorker 100, FlattenCanvas
  95.45 (90.19 branch), FlattenWorkspace 94.56, ImagePrep.tsx 94.11,
  BeforeAfterPreview 95.86. `image-prep.worker.ts` keeps its pre-existing
  coverage exclusion.
- `pnpm build` NOT run, per instruction. E2E not executed (credential-gated,
  repo-wide pattern) but reviewed as written; it covers the close-out flow.

---

## Non-blocking observations (no action required)

1. **R24 under pan is covered by construction, not by a dedicated assertion.**
   The zoom test stubs a scaled rect; pan enters the same expression through
   `rect.left`, which the letterbox tests already exercise. A future test
   stubbing a rect with a non-zero `left` would close the last inch, but the
   math is shared and pure, so this is not a defect.
2. **`clampView` forces pan to (0,0) at zoom 1**, exactly as the spec asks. The
   side effect is that a very tall image clipped by `max-h-[60vh]` cannot be
   panned until the user zooms or hits Expand. Spec-conformant, and Expand is
   the intended mitigation - flagged only as a possible future UX tweak.
3. **`removeSmallRegions` decides all components against the input labeling**,
   so a small region bordered only by other small regions absorbs a color that
   may itself be recolored in the same pass. This is the documented,
   deterministic design choice from design.md (border colors "sampled from the
   INPUT so overlapping recolors never interfere"), not a bug.

---

## Verdict

**APPROVED.** Phase C is correct, whole-feature R1-R28 traceability is complete
with no uncovered requirement, integration and the resume/invalidation
invariants hold, scope is clean, and typecheck / lint / test are green at 989
tests with `lib/flatten-core.ts` at 100% branch.

**Leader: feature `12_flatten` may be marked `done`.**
