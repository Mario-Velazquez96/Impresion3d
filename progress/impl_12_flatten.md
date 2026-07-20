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
