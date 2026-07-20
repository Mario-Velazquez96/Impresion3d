# Implementation log — 12_flatten

## Phase A — flood/brush select + flatten + undo (COMPLETE, 2026-07-19)

All 18 Phase A tasks in `specs/12_flatten/tasks.md` are done and checked.
Phases B and C not started (per the phased-delivery instruction). Nothing
here changes `feature_list.json`; the feature stays `in_progress` pending
review.

### What was built

**New files**
- `lib/flatten-core.ts` — pure sibling core (Phase-A slice): constants
  (`DEFAULT_FLOOD_TOLERANCE` 24, tolerance 0–150 step 4, brush radius 8 /
  1–100 step 2, `MAX_RUNNER_UPS` 6, `MAX_FLATTEN_HISTORY` 12, overlay RGBA
  constants), types (`Mask`, `MaskMode`, `ColorCount`), `floodMask` (FIFO
  4-connected BFS, fixed left/right/up/down neighbor order, seed clamped and
  always included, negative tolerance treated as 0), `brushMask`
  (`dx²+dy² ≤ r²`, clipped, radius clamped), `maskPixelCount`,
  `maskContains`, `subtractMask`, `unionMasks`, `maskOutline` (image edge =
  outside), `maskStats` (count desc, first-row-major-appearance tie-break),
  `colorAtPixel` (clamped), `parseHexInput` (trim, optional `#`, 3/6 digits,
  never throws), `applyFillToMask` (new buffer, alpha untouched),
  `buildFlattenOverlay` (selection tint + selection outline + hover outline,
  hover painted last so it wins; `null` when both masks null).
- `components/image-prep/canvas-paint.ts` — `paint()` extracted verbatim
  from `BeforeAfterPreview` (jsdom guards intact), now shared with the
  flatten canvas.
- `components/image-prep/FlattenStartCard.tsx` — Start flatten (disabled
  when no image / busy) ⇄ active notice + Exit flatten with discard-warning
  copy.
- `components/image-prep/FlattenWorkspace.tsx` — transient flatten UI state
  (mode, tolerance/radius, disjoint selection regions, hover mask + seed,
  chosen fill = override ?? suggested, hex draft/error, pick mode); hover
  pipeline (background worker `mask` requests, ONE in flight, stale
  responses discarded and re-issued via seed-identity refresh; brush masks
  synchronous); click add / click-remove / Esc-Clear; `[current]` effect
  clears selection + hover; `[regions]` effect resets the chosen fill;
  flatten-scoped keyboard map (W/S, Enter, Esc, Z + Ctrl/Cmd+Z with
  text-entry guard and focused-button Enter passthrough).
- `components/image-prep/FlattenCanvas.tsx` — base + overlay canvases,
  pointer→pixel via the reused `mapClickToPixel` against
  `getBoundingClientRect()` (letterbox rejected), crosshair in pick mode,
  hints strip (R25), Download PNG (same offscreen-canvas flow, R27).
  Identity view in Phase A; zoom/pan/Expand land in Phase C.
- `components/image-prep/FlattenControls.tsx` — Flood/Brush radio group,
  tolerance-or-radius readout + "W grow · S shrink", Undo, Reset all,
  "N regions flattened" counter.
- `components/image-prep/FlattenFillPanel.tsx` — "N px selected", suggested
  swatch (hex + % of selection, 1 dp), runner-ups, hex input with
  `role="alert"` error, Pick toggle (`aria-pressed`), Flatten selection,
  Clear.

**Modified files**
- `components/image-prep/worker-messages.ts` — FULL new protocol shapes
  (all phases, per tasks.md): `FlattenAction` (`fill`/`recolor`/
  `removeSmall`), `mask` + `flatten` request variants, `MaskResult`,
  `FlattenResult`, extended `WorkerResponse`. Existing ops untouched.
- `components/image-prep/image-prep.worker.ts` — logic-free dispatch:
  `mask`(flood) → `floodMask` + count; `flatten`/`fill` → `applyFillToMask`;
  smooth/catch-strays/recolor/removeSmall throw a clear error over the
  existing `{ ok: false }` path until their phase. Transfer lists both ways.
  Keeps its pre-existing coverage exclusion; no config change.
- `components/image-prep/useImagePrepWorker.ts` — `request(body, opts?)`
  with `{ background?: boolean }`: background requests skip the
  `inFlight`/busy accounting (Pending carries the flag so the response side
  skips the decrement too); `RequestFn` overloads for `mask`→`MaskResult`
  and `flatten`→`FlattenResult`; flatten-fill transfers `[buffer, mask]`.
  Foreground behavior byte-for-byte unchanged.
- `components/image-prep/ImagePrep.tsx` — Stage union refactored to named
  aliases (pure rename) + `FlattenStage { resume, entry, current, history,
  regionsFlattened }`; `base = flatten ? resume : stage` feeds upload info,
  Adjust, Posterize, and the Histogram, so upstream ops build fresh stages
  from `resume` and structurally discard flatten (R2); working-image
  derivation gains the `flatten.current` arm; handlers:
  `handleEnterFlatten` (snapshot + seeded history + counter 0),
  `handleExitFlatten` (`setStage(resume)`), `handleFlattenMutated`
  (replace/bump/push capped at `MAX_FLATTEN_HISTORY`), `handleFlattenUndo`
  (pure pop of pixels AND counter), `handleFlattenReset` (restore `entry`
  held outside the capped stack); PalettePanel rendered only when
  quantized; preview column renders `FlattenWorkspace` during flatten.
- `components/image-prep/BeforeAfterPreview.tsx` — imports `paint` from
  `canvas-paint.ts`; zero behavior change.
- Tests: `lib/__tests__/flatten-core.test.ts` (new, 28 tests),
  `components/image-prep/__tests__/FlattenWorkspace.test.tsx` (new, 22
  tests — renders the FULL island per the R21 suite pattern so undo/counter
  run against the real stage wiring), `__tests__/canvas-paint.test.ts`
  (new, 3 tests), `__tests__/ImagePrep.test.tsx` (+9 flatten
  stage-integration tests; fake worker extended with core-backed
  `mask`/`flatten`), `__tests__/useImagePrepWorker.test.ts` (+3: background
  busy-skip, mixed background/foreground, flatten transfer list).
- `e2e/flatten.spec.ts` (new, credential-gated, NOT executed — repo
  pattern): posterize → Start flatten → hover/click → Flatten selection →
  counter 1 → `z` → counter 0 → Exit restores palette → Download name.

### Decisions & deviations (design.md vs. code)

- **Keyboard text-entry guard**: design.md lists a blanket
  `HTMLInputElement` guard; that would swallow W/S while a mode RADIO has
  focus. R8 says "focus is not in a *text* input", so the guard exempts
  radio/checkbox/range/button input types. Also, Enter is ignored when a
  button has focus so native button activation keeps working (a11y).
- **Hover coalescing**: implemented as an effect keyed on (seed, mode,
  size, image, pick, busy) with a one-in-flight ref; a stale response
  re-triggers the effect by refreshing the seed identity instead of a
  recursive pump — same observable behavior as design.md's description.
- **`applyFillToMask` leaves alpha untouched** (fills RGB only); images in
  this pipeline are opaque, and not touching alpha is the more conservative
  pure-function contract. Pinned by a test.
- **Exit flatten is disabled while busy** (design leaves it open): prevents
  swapping the stage out from under an in-flight mutation; the
  `handleFlattenMutated` guard would drop the result anyway, but disabling
  is the honest R26 behavior.
- **E2E written Phase-A-scoped**: tasks.md places the E2E at feature
  close-out (its flow includes Phase-C Despeckle). Per the phase
  instruction I wrote `e2e/flatten.spec.ts` now covering the Phase-A flow
  only, with a header note that the close-out extends it with Despeckle.
  The close-out checkbox in tasks.md remains unchecked.
- `MaskMode` includes `"smooth"` from Phase A (the wire protocol ships
  whole per tasks.md); the Phase-A UI offers only Flood/Brush and the
  worker throws a clear error for smooth/catch-strays/recolor/removeSmall.

### Requirements satisfied in Phase A (test traceability)

| R | Test |
|---|---|
| R1 | ImagePrep.test "Start flatten is disabled with no image…", "enters from a LOADED stage with counter 0…", "…disabled while busy"; e2e/flatten.spec |
| R2 | ImagePrep.test "entering from a QUANTIZED stage hides the palette", "Apply discards…", "Posterize discards…", "loading a new file discards…" |
| R3 | ImagePrep.test "Exit restores the exact prior stage INCLUDING the palette-undo depth" |
| R4 | flatten-core.test `buildFlattenOverlay` suite; FlattenWorkspace.test "shows the outline overlay via a BACKGROUND flood request and clears over the letterbox", "clears the outline when the pointer leaves" |
| R5 | flatten-core.test `floodMask` suite (boundary, 4-connectivity, clamp, determinism); FlattenWorkspace.test click-add tests |
| R7 | flatten-core.test `brushMask` suite; FlattenWorkspace.test "a brush click selects the clipped circle without any worker mask call" |
| R8 | FlattenWorkspace.test "steps the flood tolerance, clamps at both ends, and refreshes the hover", "steps the brush radius…" |
| R10 | flatten-core.test mask set ops; FlattenWorkspace.test "click adds the hovered flood region and shows the union px count" |
| R11 | FlattenWorkspace.test "clicking a selected pixel removes exactly that region" |
| R12 | FlattenWorkspace.test "Esc empties…", "Clear empties…", selection-clear assertions after each mutation |
| R13 | flatten-core.test `maskStats` suite; FlattenWorkspace.test "shows the suggested color with % of selection plus ordered runner-ups" |
| R14 | flatten-core.test `parseHexInput` suite; FlattenWorkspace.test "a valid typed hex becomes the fill; invalid shows an alert…", "clicking a runner-up sets the chosen fill" |
| R15 | flatten-core.test `colorAtPixel`; FlattenWorkspace.test "Pick sets the fill from the clicked pixel WITHOUT altering the selection" |
| R16 | flatten-core.test `applyFillToMask`; FlattenWorkspace.test "the button collapses the selection…", "Enter flattens too…" |
| R20 | FlattenWorkspace.test "Z walks back to the baseline restoring pixels AND counter…", "typing z in the hex input does NOT undo", "disables Undo while the worker is busy" |
| R21 | FlattenWorkspace.test "Reset all restores the entry snapshot and counter 0 even past the history cap" |
| R22 | counter assertions across the R16/R20/R21 tests + ImagePrep.test "…counter 0, Undo disabled" |
| R24 (zoom 1) | letterbox rejection in the hover test (via reused `mapClickToPixel`, unit-tested in the R21 suite) |
| R25 | FlattenWorkspace.test "shows the keyboard-hints strip"; ImagePrep.test entry test |
| R26 | useImagePrepWorker.test background suite; FlattenWorkspace.test "disables the mutation controls while busy", "surfaces a user-safe error…", background assertion in the hover test |
| R27 | ImagePrep.test "Download during flatten names <base>-prepped.png with no network" |
| R28 | git-status spot-check (below) |

R6, R9, R17 → Phase B. R18, R19, R23, full R24-under-zoom → Phase C.

### Final check results (Phase A gate)

- `corepack pnpm typecheck` — clean (0 errors).
- `corepack pnpm lint` — 0 errors; only the 4 pre-existing warnings in
  `components/planning/__tests__/WeekPlanner.test.tsx` (untouched).
- `corepack pnpm test` — **954 tests / 65 files, all passing** (was 889/62:
  +61 tests, +3 files; 4 pre-existing tests extended in place).
- Coverage: `lib/flatten-core.ts` **100% branch / 100% lines**. Changed
  modules: `worker-messages.ts` 100%, `useImagePrepWorker.ts` 100%,
  `canvas-paint.ts` 100%, `FlattenControls` 100%, `FlattenFillPanel` 100%,
  `FlattenStartCard` 100%, `FlattenCanvas` 96.2% lines, `FlattenWorkspace`
  92.4% lines, `ImagePrep.tsx` 94.1% lines, `BeforeAfterPreview` 95.9%
  lines — all ≥ 80%. `image-prep.worker.ts` keeps its pre-existing
  exclusion (no config change).
- `pnpm build` NOT run (standing instruction: dev-server/.next conflict).
- E2E NOT executed (credential-gated, repo-wide pattern).
- R28 spot-check via `git status`: `prisma/` untouched, no `actions/`, no
  `app/api/` route, no Storage code, no `.env.example` entry, no
  `package.json` change, no vitest/next config change;
  `lib/image-prep-core.ts` diff empty.

## Phase B — smooth mode, catch strays, recolor every match (COMPLETE, 2026-07-20)

All 4 Phase B tasks in `specs/12_flatten/tasks.md` are done and checked
(R6, R9, R17). Phase C not started. `feature_list.json` unchanged; the feature
stays `in_progress` pending review.

### What was built

**`lib/flatten-core.ts` (part 3)**
- Constants: `DEFAULT_SMOOTH_TOLERANCE` 10, `STRAY_MAX_ISLAND_PX` 16,
  `STRAY_MARGIN_PX` 8. Updated the header + `MaskMode` doc comment (smooth is
  now a shipped builder, not a Phase-B stub).
- `smoothMask` (R6) — the same deterministic FIFO 4-connected BFS and fixed
  neighbor order as `floodMask`, but the inclusion test compares each neighbor
  against the CURRENT pixel (local chaining) instead of the seed, so gradients
  drift far from the seed color are captured.
- `addStrayIslands` (R9) — new mask = mask ∪ every 4-connected component of
  seed-color-matching, non-mask pixels that is fully inside the mask bbox
  dilated by `STRAY_MARGIN_PX` (clipped) and whose area ≤ `STRAY_MAX_ISLAND_PX`.
  Row-major component discovery, FIFO BFS; empty input mask returned unchanged;
  input mask never mutated (works on a `.slice()` copy).
- `recolorExact` (R17) — new buffer; every pixel EXACTLY equal to `from` (RGB,
  alpha ignored) recolored to `to`; near-miss on any channel untouched; input
  never mutated.

**`components/image-prep/image-prep.worker.ts`** — still logic-free dispatch:
`mask` now picks `smoothMask` for `mode: "smooth"` and applies `addStrayIslands`
when `catchStrays` (seed color via `colorAtPixel`); `flatten`/`recolor` →
`recolorExact`. `removeSmall` still throws the clear "not available yet" error
over the existing `{ ok: false }` path until Phase C. Transfer lists unchanged.

**`components/image-prep/FlattenControls.tsx`** — added the **Smooth** radio
(Flood / Smooth / Brush) and the "Catch stray pixels" checkbox rendered for
flood/smooth only (`mode !== "brush"`), wired via new `catchStrays` /
`onCatchStraysChange` props.

**`components/image-prep/FlattenFillPanel.tsx`** — added **Recolor every match**
(disabled while `busy` or when the chosen hex equals the suggested hex), wired
via a new `onRecolor` prop.

**`components/image-prep/FlattenWorkspace.tsx`** — separate `floodTolerance` and
`smoothTolerance` state (each with its own default; the active `tolerance` is
derived by mode), a `catchStrays` state, `stepSize` now steps the active mode's
size (brush radius / flood tolerance / smooth tolerance), the hover request
carries the real `catchStrays` and re-issues when strays/smooth-tolerance
change, and a `recolorEveryMatch` handler that posts `recolor(from: suggested,
to: chosen)`, reports up via `onMutated(pixels, 0)` (counter unchanged), and
lets the `[current]` effect clear the selection.

**Tests**
- `lib/__tests__/flatten-core.test.ts` — +10 tests (Phase B constants,
  `smoothMask` gradient-vs-flood / step boundary / uniform-region+clamp /
  determinism, `addStrayIslands` absorb / size-cap / margin-bbox / no-op+empty,
  `recolorExact` exact-only+unmutated). `lib/flatten-core.ts` stays **100%
  branch / 100% lines**.
- `components/image-prep/__tests__/FlattenWorkspace.test.tsx` — fake worker
  extended to smooth/catch-strays/recolor; +3 tests (smooth mode with its own
  W/S-stepped tolerance independent of flood; catch-strays checkbox flood/smooth
  only + value rides the mask request; Recolor every match disabled at suggested
  / enabled after choosing / swaps a match OUTSIDE the selection / clears
  selection / undoable / counter unchanged).

### Decisions & deviations (design.md vs. code)

- **Two tolerance states, not one** (design implies "own tolerance state" for
  smooth): the workspace keeps independent `floodTolerance` (24) and
  `smoothTolerance` (10); switching modes preserves each, and W/S steps only the
  active one. The `FlattenControls` `tolerance` prop receives the active value.
- **`smoothMask` visited-on-first-touch**: like `floodMask`, a pixel is marked
  visited when first examined, so the reachable set is determined by BFS order
  (local chaining). Matches design's "local chaining" description and is
  deterministic; pinned by a determinism test.
- **`addStrayIslands` also absorbs matching pixels touching the region**: the
  design's precise algorithm is "components of non-mask matching pixels disjoint
  from the mask" — a matching pixel adjacent to the mask forms its own such
  component and is absorbed (this is why the BFS `mask`-neighbor branch exists).
  For real flood masks this never arises (flood is maximal); it can for smooth
  masks. Covered by the rich 6×1 absorb test.
- **`recolorExact` ignores alpha** (RGB-exact match, alpha preserved) — same
  conservative pure-function contract as `applyFillToMask`; pinned by a test.

### Requirements satisfied in Phase B (test traceability)

| R | Test |
|---|---|
| R6 | flatten-core.test `smoothMask` suite (gradient-vs-flood, step boundary, uniform+clamp, determinism); FlattenWorkspace.test "smooth mode … own W/S-stepped tolerance" (asserts `mode: "smooth"` on the mask request) |
| R9 | flatten-core.test `addStrayIslands` suite (absorb, size-cap, margin-bbox, no-op/empty, unmutated); FlattenWorkspace.test "catch stray pixels … rides its value on the mask request" |
| R17 | flatten-core.test `recolorExact` suite; FlattenWorkspace.test "recolor every match … swaps every match" (from/to on the `recolor` request, OUTSIDE-selection pixel changes, counter unchanged, undoable) |

### Final check results (Phase B gate)

- `corepack pnpm typecheck` — clean (0 errors).
- `corepack pnpm lint` — 0 errors; only the 4 pre-existing warnings in
  `components/planning/__tests__/WeekPlanner.test.tsx` (untouched).
- `corepack pnpm test` — **967 tests / 65 files, all passing** (was 954: +13
  tests). The one `act(...)` stderr warning is in a pre-existing Phase-A test
  ("W/S sizing"), not Phase-B code.
- Coverage: `lib/flatten-core.ts` **100% branch / 100% lines**. Changed
  modules: `worker-messages.ts` 100%, `FlattenControls` 100%,
  `FlattenFillPanel` 100%, `FlattenCanvas` 96.2%, `FlattenWorkspace` 95.2%
  lines, `ImagePrep.tsx` 94.1% lines — all ≥ 80%. `image-prep.worker.ts` keeps
  its pre-existing coverage exclusion (no config change).
- `pnpm build` NOT run (standing instruction).
- E2E NOT executed (credential-gated; the E2E extension lives in close-out).
- R28 spot-check: no schema/migration, no `actions/`, no `app/api/` route, no
  Storage code, no `.env.example` entry, no `package.json` dependency, no
  config change; `lib/image-prep-core.ts` untouched.

## Phase C — presets, despeckle, zoom/pan/expand (COMPLETE, 2026-07-20)

All 6 Phase C tasks AND the 3 feature close-out tasks in
`specs/12_flatten/tasks.md` are done and checked (R18, R19, R23, R24, plus the
E2E / no-persistence / full-suite close-out). **This completes all Phase A–C
tasks for feature 12_flatten.** `feature_list.json` is unchanged and the feature
stays `in_progress` pending the reviewer gate.

### What was built

**`lib/flatten-core.ts` (parts 4 + 5)**
- Constants: `DESPECKLE_MAX_REGION_PX` 2, `PRESET_MAX_REGION_PX`
  `{ low: 8, medium: 32, high: 128 }`, `MIN_ZOOM` 1, `MAX_ZOOM` 16,
  `ZOOM_FACTOR` 1.25, `IDENTITY_VIEW`; new `ViewTransform` type.
- `removeSmallRegions(src, maxRegionPx)` (R18, R19) — the shared algorithm
  behind Despeckle and the Low/Medium/High presets. 4-connected exact-color
  component labeling on the INPUT (via a precomputed per-pixel color key so
  labeling/border tallies reduce to single-integer comparisons); each component
  with area ≤ threshold is recolored, in an OUTPUT copy, to the most common
  color among its distinct border pixels sampled from the INPUT (so overlapping
  recolors never interfere); ties break by the border color's first row-major
  appearance (Map insertion order = ascending first appearance, so only a
  STRICTLY larger count replaces the running best); components are processed
  smallest-area-first, then ascending first-pixel index; larger components and
  whole-image (borderless) components are left untouched; the input is never
  mutated.
- View math (R23): `clampView` (zoom into [1,16]; pan clamped so the scaled
  content always COVERS the viewport, which forces the origin at zoom 1),
  `zoomAt` (scale ×/÷ `ZOOM_FACTOR`, clamped, keeping the content point under
  the focal cursor fixed, then pan-clamped), `panBy`.

**`components/image-prep/image-prep.worker.ts`** — the `flatten`/`removeSmall`
action now calls `removeSmallRegions` (the Phase-B "not available yet" throw is
gone). Still a logic-free dispatcher; transfer lists unchanged.

**`components/image-prep/FlattenControls.tsx`** — an **Auto-flatten** row with
**Low / Medium / High** and **Despeckle** buttons (all disabled while busy),
each calling the new `onCleanup(maxRegionPx)` prop with the exported thresholds
(imported from `flatten-core`).

**`components/image-prep/FlattenWorkspace.tsx`** — a `runCleanup(maxRegionPx)`
handler posting `flatten`/`removeSmall` and reporting up via `onMutated(pixels,
0)` (counter unchanged); wired to `FlattenControls` via `onCleanup`. The
existing `[current]` effect clears the selection when the image is replaced.

**`components/image-prep/FlattenCanvas.tsx`** — rewritten for navigation (R23,
R24): a clipping viewport `div` (`overflow-hidden`; `max-h-[60vh]` →
`max-h-[85vh]` via the **Expand** toggle) wrapping a transform `div` that
renders `translate(panX, panY) scale(zoom)` (top-left origin). Local `view` +
`expanded` state resets to `IDENTITY_VIEW` on every stage (re)mount (R1). A
non-passive `wheel` listener zooms toward the cursor and `preventDefault`s page
scroll; middle-button drag and Space-held left drag pan via window
`mousemove`/`mouseup`; a Space keydown/keyup pair (guarded against
inputs/textareas/buttons) tracks the pan modifier and `preventDefault`s the page
scroll; a click while Space is held is suppressed so panning never also selects.
Click/hover geometry is unchanged — `resolvePixel` still reads the base canvas's
own `getBoundingClientRect()`, which reflects the CSS transform, so
`mapClickToPixel` maps correctly at any view (R24).

**Tests**
- `lib/__tests__/flatten-core.test.ts` — +11 tests (Phase C constants;
  `removeSmallRegions` speck absorb / majority border color / first-appearance
  tie-break / INPUT-sampling proof / exact threshold boundary / borderless
  whole-image no-op / progressive presets / determinism; view math —
  `clampView` range+origin+covering, `zoomAt` focal invariance + both clamps,
  `panBy` bounds). `lib/flatten-core.ts` stays **100% branch / 100% lines**.
- `components/image-prep/__tests__/FlattenWorkspace.test.tsx` — fake worker
  extended to `removeSmall`; +9 tests across two Phase-C describe blocks
  (preset/Despeckle thresholds 8/32/128/2, undoable + selection-cleared +
  counter-unchanged + busy-disabled; wheel zoom in/out; middle-drag pan;
  Space-drag pan + click suppression; Expand toggle; click resolves correctly
  under a zoomed canvas box).
- `e2e/flatten.spec.ts` — extended (still credential-gated, NOT executed) with
  the **Despeckle** step (busy state + counter unchanged) between the `z` undo
  and Exit, per the close-out flow (R19, R26).

### Decisions & deviations (design.md vs. code)

- **View state lives in `FlattenCanvas`, not `FlattenWorkspace`** (design puts
  it in the workspace): zoom/pan need the live DOM viewport box for
  focal-point zoom and pan clamping, so owning `view`/`expanded` where the
  measurements happen is cleaner and keeps the workspace unchanged. It still
  resets on stage entry because the workspace/canvas remount together (R1).
- **Space handled inside `FlattenCanvas`** (design lists Space in the workspace
  keyboard map): the pan-drag logic lives in the canvas, so tracking the Space
  modifier there (with the same input/button guard) keeps panning
  self-contained. The workspace keyboard map (W/S/Enter/Esc/Z) is untouched and
  the two listeners never conflict (different keys).
- **`clampView` uses the stricter "content covers the viewport" clamp** rather
  than merely "content overlaps": at zoom ≥ 1 the scaled content is ≥ the
  viewport, so covering is the natural image-viewer behavior and satisfies both
  "cannot be dragged fully out" and "zoom 1 forces origin" from one formula (no
  special zoom-1 branch — keeps 100% branch coverage honest).
- **Border color counted per distinct border pixel** (not per adjacency): the
  spec says "most common color among its border pixels", so each border pixel is
  tallied once (a `Set` of border indices), sampled from the INPUT and
  tie-broken by first row-major appearance; pinned by the INPUT-sampling test.

### Requirements satisfied in Phase C (test traceability)

| R | Test |
|---|---|
| R18 | flatten-core.test `removeSmallRegions` suite (majority/tie-break/threshold/progressive-presets/determinism); FlattenWorkspace.test "sends removeSmall with each preset/Despeckle threshold …" (Low 8 / Medium 32 / High 128) |
| R19 | flatten-core.test `removeSmallRegions` speck-absorb + borderless no-op; FlattenWorkspace.test Despeckle → `removeSmall` maxRegionPx 2, selection cleared, counter unchanged; e2e/flatten.spec Despeckle step |
| R20 | FlattenWorkspace.test "sends removeSmall … undoable …" (Z walks the four cleanups back, Undo re-disables) |
| R22 | counter-unchanged assertions across the preset/Despeckle tests |
| R23 | flatten-core.test `view math` suite (clampView/zoomAt/panBy); FlattenWorkspace.test wheel-zoom / middle-drag / Space-drag / Expand |
| R24 (under zoom/pan) | FlattenWorkspace.test "resolves clicks to the correct pixel under a zoomed canvas box" (mocked 2× transformed rect via reused `mapClickToPixel`) |

### Final check results (Phase C gate + feature close-out)

- `corepack pnpm typecheck` — clean (0 errors).
- `corepack pnpm lint` — 0 errors; only the 4 pre-existing warnings in
  `components/planning/__tests__/WeekPlanner.test.tsx` (untouched).
- `corepack pnpm test` — **989 tests / 65 files, all passing** (was 967: +22
  tests: +11 core, +9 workspace, +2 net elsewhere). Note: one pre-existing
  Phase-A palette test ("reverts the last palette action via Ctrl+Z", already
  laden with pre-existing `act(...)` warnings) flaked once under full-suite
  ordering and passed on isolated + repeat full runs; it is not Phase-C code.
- Coverage: `lib/flatten-core.ts` **100% branch / 100% lines**. Changed
  modules: `worker-messages.ts` 100%, `useImagePrepWorker.ts` 100%,
  `canvas-paint.ts` 100%, `FlattenControls` 100%, `FlattenFillPanel` 100%,
  `FlattenStartCard` 100%, `FlattenCanvas` 95.5% lines / 90.2% branch,
  `FlattenWorkspace` 94.6% lines, `ImagePrep.tsx` 94.1% lines,
  `BeforeAfterPreview` 95.9% — all ≥ 80%. `image-prep.worker.ts` keeps its
  pre-existing coverage exclusion (no config change).
- `pnpm build` NOT run (standing instruction).
- E2E NOT executed (credential-gated; written to cover the full feature flow
  incl. Despeckle).
- R28 spot-check via `git status`: `prisma/` untouched, no `actions/`, no
  `app/api/` route, no Storage code, no `.env.example` entry, no
  `package.json` dependency, no vitest/next/playwright config change;
  `lib/image-prep-core.ts` diff empty.

## Bug fixes (post-ship, 2026-07-20)

**Report:** "the flatten functionality is working well, however there is a bug,
it doesn't let me move through the image, so I can not see the bottom part of
the image." Screenshot: a wide image whose bottom is clipped by the flatten
viewport, unreachable.

**Root cause.** `clampView` derived the pan bounds from the VIEWPORT box and
treated it as the content size:

```ts
const minPanX = boxW * (1 - zoom);   // ⇒ 0 at zoom 1
const minPanY = boxH * (1 - zoom);   // ⇒ 0 at zoom 1
```

That is only correct when the content exactly fills the viewport at zoom 1. It
did not: the base canvas was `h-auto w-full` (width-driven) inside a viewport
that is `overflow-hidden max-h-[60vh]`, so any image whose layout height exceeded
the cap was TALLER than the box, its excess clipped — while the zoom-1 pan lock
(`panY` forced to exactly 0) made that excess permanently unreachable. The same
failure mode existed horizontally. Zooming in did not help either, because the
bounds still ignored the true content extent.

**Fix (two parts).**

1. *Correct clamp semantics* — `lib/flatten-core.ts`: `clampView` (and its
   delegates `zoomAt` / `panBy`) now take the content's untransformed layout
   size and bound the pan by
   `minPan = Math.min(0, box − content · zoom)` per axis. The `Math.min(0, …)`
   preserves the original "never drag a margin into view" guarantee when the
   scaled content FITS the box, while an OVERFLOWING axis stays pannable —
   including at zoom 1. Functions stay pure; `lib/flatten-core.ts` remains at
   100% lines / 100% branches. `FlattenCanvas.tsx` measures the base canvas with
   `offsetWidth/offsetHeight` (layout px — NOT `getBoundingClientRect`, which is
   already multiplied by the CSS zoom) into a ref, refreshed by a `ResizeObserver`
   (guarded for jsdom, where it is undefined) and re-run on image / Expand change;
   a resize also re-clamps the live view so Expand can't strand a stale pan.
2. *Default view shows the whole image* — both canvases now carry the viewport's
   own height cap (`max-h-[60vh]` / `max-h-[85vh]` under Expand) alongside
   `object-contain`, so the image is fitted in BOTH dimensions at zoom 1 and the
   user zooms in for detail. Expand still only raises the cap. The overlay canvas
   is sized by the identical rules (same intrinsic ratio, same containing block)
   so the outlines stay registered with the pixels.

**R24 click geometry is unaffected:** `resolvePixel` still maps pointer → image
pixel via `mapClickToPixel` against the canvas's own `getBoundingClientRect()`,
which reflects the CSS transform, so clicks land on the exact pixel at zoom 1,
zoomed, panned, and Expanded.

**No scope creep:** no schema, dependency, env, route or persistence change; the
feature stays `done` in `feature_list.json`.

### Tests for the fix

| Requirement | Covering test |
| --- | --- |
| R23 (regression: bottom reachable) | flatten-core.test "clampView allows panning to the bottom of content taller than the box at zoom 1" — fails against the old formula (forced `panY` 0, now reaches `boxH − contentH`) |
| R23 (regression: wider content) | flatten-core.test "clampView allows panning to the right edge of content wider than the box at zoom 1" |
| R23 (no margin drag preserved) | flatten-core.test "clampView still forces the origin on an axis whose content is SMALLER than the box" (incl. the mixed per-axis and zoomed-past-the-box cases) |
| R23 (focal invariance kept) | flatten-core.test "zoomAt scales toward the cursor…" + new "zoomAt keeps the focal point fixed on overflowing content" |
| R23 (pan path end-to-end, pure) | flatten-core.test "panBy reaches the bottom of a tall image at zoom 1 (regression)" |
| R23 (pan path, component) | FlattenWorkspace.test "pans at zoom 1 when the content overflows the viewport (regression)" — 400×900 content in a 100×100 box, middle-drag moves the transform to `translate(0px, -40px)` at `scale(1)` |
| R23 (fit-to-viewport sizing) | FlattenWorkspace.test "fits the whole image in the viewport at zoom 1 and follows Expand" |
| R24 (unregressed) | FlattenWorkspace.test "resolves clicks to the correct pixel under a zoomed canvas box" + the Space-drag suppression test, both still green |

### Verification (bug fix)

- `corepack pnpm typecheck` — clean.
- `corepack pnpm lint` — 0 errors (only the 4 pre-existing `WeekPlanner.test.tsx`
  warnings).
- `corepack pnpm test` — **996 tests / 65 files, all passing** (was 989: +7 —
  +5 core, +2 workspace).
- Coverage: `lib/flatten-core.ts` **100% lines / 100% branches**;
  `FlattenCanvas.tsx` 92.1% lines / 85.2% branches (≥ 80% target).
- `pnpm build` NOT run (standing instruction); no production deploy.
