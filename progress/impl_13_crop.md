# Implementation log — 13_crop

**Feature:** Crop-to-print-size stage for `/image-prep` (option A, ratio-only).
**Spec:** `specs/13_crop/{requirements,design,tasks}.md` (approved, single phase).
**Started:** 2026-07-21 · **Completed:** 2026-07-21

## Running log

- [x] Read the spec (requirements/design/tasks), `docs/conventions.md`,
  `docs/architecture.md`, `docs/verification.md`, and the shipped code being
  extended (`ImagePrep.tsx`, `FlattenCanvas.tsx`, `FlattenWorkspace.tsx`,
  `BeforeAfterPreview.tsx`, `canvas-paint.ts`, `lib/image-prep-core.ts`,
  `lib/flatten-core.ts`, and the flatten/island test suites).

### 1. Core math (`lib/crop-core.ts`)

- [x] **Part 1 — units, constants, geometry helpers.** Types (`CropRect`,
  `PrintSize`, `Handle`, `HitTarget`, `Orientation`, `ResolutionLevel`,
  `CropPreset`, `ContentBox`); constants pinned exactly as specified
  (`MIN_PRINT_MM` 1, `MAX_PRINT_MM` 1000, `MM_MAX_DECIMALS` 2,
  `DEFAULT_PRINT_SIZE` 71.7 × 94, `MIN_CROP_PX` 16, `HANDLE_HIT_SCREEN_PX` 10,
  `NUDGE_PX` 1, `NUDGE_COARSE_PX` 10, `PX_PER_MM_COMFORTABLE` 5,
  `PX_PER_MM_MIN` 2.5, `MM_PER_INCH` 25.4) plus the six `CROP_PRESETS` with
  their one-line justifications; `parseMmInput`, `aspectRatio`,
  `swapOrientation`, `describeAspect`, `matchingPreset`. Header comment
  justifies the sibling-core decision. Imports only `PixelBuffer` +
  `MAX_WORKING_DIMENSION` from `@/lib/image-prep-core`. (R2–R5)
- [x] **Part 2 — the ratio-locked rectangle.** `clampRectToImage` (idempotent
  invariant enforcer), `fitRect`, `fillRect`, `refitRect`, `moveRect`,
  `resizeRect` (8 handles, anchor rules, growth stops at the bounds),
  `hitTestHandle`, `handleCursor`. Every rect-producing function ends in
  `clampRectToImage`, so R6 holds by construction. (R6–R9, R19)
- [x] **Part 3 — box geometry, readout, the crop.** `contentBoxOf`,
  `boxPointToImage`, `imageRectToBoxFractions`, `effectivePxPerMm`,
  `pxPerMmToDpi`, `resolutionLevel`, `pixelsKeptPercent`, `cropPixels`.
  (R10, R11, R13, R18, R21)

### 2. Shared canvas view

- [x] **`components/image-prep/use-canvas-view.ts` extracted from
  `FlattenCanvas.tsx`**, and `FlattenCanvas` refactored to consume it. See the
  dedicated section below — this was the one risky task in the feature.

### 3–5. Components + island wiring

- [x] `CropCanvas.tsx` — `useCanvasView` viewport + transform wrapper, base
  canvas via the shared jsdom-guarded `paint`, DOM overlay (content-box wrapper
  `overflow-hidden`/`pointer-events-none`/`aria-hidden`, rect div with ring +
  `shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]` dim, 8 decorative handle squares)
  positioned from `imageRectToBoxFractions`; press → `mapClickToPixel` →
  `hitTestHandle` (tolerance `HANDLE_HIT_SCREEN_PX / contentBox.scale`); window
  `mousemove`/`mouseup` → `boxPointToImage` → `moveRect`/`resizeRect`; hover
  cursor via `handleCursor`; Space/middle-button defer to the hook's pan;
  Expand toggle; hints strip. No Download button. (R6–R8, R17, R18, R20)
- [x] `CropSizePanel.tsx` — two `inputMode="decimal"` mm inputs with per-field
  `role="alert"`, the `CROP_PRESETS` buttons with `aria-pressed` via
  `matchingPreset`, Swap orientation, Fit/Fill/Reset, the readout
  (`W × H px · N% of pixels kept · W × H mm · N.N px/mm (D dpi)`), the
  `role="status"` caution / `role="alert"` warning, the R12 working-cap note,
  and Apply crop (disabled while `busy` or invalid) + Cancel.
  (R2–R5, R9–R14, R21)
- [x] `CropStartCard.tsx` — inactive copy + Start crop; inactive-and-cropped
  adds "Cropped to W × H px — from W₀ × H₀" + Revert to uncropped; active shows
  the pipeline-restart notice. (R1, R13, R15)
- [x] `CropWorkspace.tsx` — owns the transient state (`size`, the two drafts +
  errors, `rect`, the active-drag ref inside `CropCanvas`), wires the panel and
  the canvas, `[working]` re-fit effect, derived readout, and the crop keyboard
  map (arrows / Shift+arrows with the feature-12 text-entry guard, Esc
  cancels). (R2–R6, R9–R11, R14, R19)
- [x] `ImagePrep.tsx` — `LoadedFields` gains `uploaded`; the Stage union gains
  `CropStage { kind: "crop"; resume: CropResume }`; `baseOf(stage)` replaces the
  inline ternary and unwraps `crop → resume → (flatten → resume)`;
  `workingImageOf(stage)` gains the crop arm; `handleEnterCrop`,
  `handleCancelCrop`, `handleApplyCrop`, `handleRevertCrop`; palette hidden and
  Adjust/Posterize/Start-flatten disabled while cropping with the dropzone
  still live; `CropWorkspace` replaces `BeforeAfterPreview`. No worker request
  anywhere in this path. (R1, R13–R16, R21)

### 6. Tests

- [x] `lib/__tests__/crop-core.test.ts` — **60 tests**, `lib/crop-core.ts` at
  **100% statements / 100% branch / 100% functions / 100% lines**.
- [x] `components/image-prep/__tests__/CropWorkspace.test.tsx` — **29 tests**.
- [x] `components/image-prep/__tests__/ImagePrep.test.tsx` extended with the
  `crop stage integration (13_crop: R1, R13–R16, R21, R22)` block (8 tests);
  the file's flatten and palette blocks are otherwise unchanged.
- [x] `e2e/crop.spec.ts` — Playwright, credential-gated (`test.skip` without
  `E2E_EMPLOYEE_EMAIL` / `E2E_EMPLOYEE_PASSWORD`), reusing
  `e2e/fixtures/image-prep-sample.png`. **Written, not executed**, per repo
  convention.

### 7. Close-out

- [x] No-persistence contract verified (see below).
- [x] `typecheck` / `lint` / `test` green (see final check results).

## The `use-canvas-view` extraction — what was done and why it is safe

design.md's riskiest item: extracting ~150 lines of *working, shipped* view glue
out of `FlattenCanvas` into a hook shared with the new crop canvas.

**Outcome: the extraction was done, and it is verbatim.** The moved code is
character-for-character the same logic — viewport ref, `ResizeObserver` content
measurement, the non-passive `wheel` listener, Space tracking, window
`mousemove`/`mouseup` drag pan, the Expand toggle, and the
`capClass`/`fitClass`/`transformStyle` derivation. Critically, **the pan-bounds
fix survives intact**: the hook still measures the *content* with
`el.offsetWidth/offsetHeight` (layout pixels, unaffected by the CSS zoom
transform) into `contentSizeRef`, still falls back to the viewport box only
before the first measurement lands, and still passes that measured content size
into `clampView`/`panBy`/`zoomAt` — so `minPan = Math.min(0, box - content ×
zoom)` is still derived from measured content, never from the viewport. The math
itself was **not touched**: `lib/flatten-core.ts` has an empty diff and the hook
imports `zoomAt` / `panBy` / `clampView` / `IDENTITY_VIEW` from it.

Only three mechanical differences exist, all no-ops:

1. `contentBox`, `handlePanStart` and `toggleExpanded` became `useCallback`s
   with `[]` deps (stable identities), so the effects that now list them in
   their dependency arrays re-run exactly as often as before (never).
2. The measured-size ref was renamed `contentRef` → `contentSizeRef`, because
   `contentRef` is now the hook's *parameter* (the element to measure). The
   canvas element ref is passed in by the consumer.
3. The effect that measures keys on `resetKey` (which `FlattenCanvas` passes as
   `current`) instead of on `current` directly — the same value.

**Evidence the behavior is unchanged:**
`components/image-prep/__tests__/FlattenWorkspace.test.tsx` has an **empty git
diff** and its **35 tests all pass unmodified**, including the two regression
tests named in the task brief —
`"clampView allows panning to the bottom of content taller than the box at zoom 1"`
and `"panBy reaches the bottom of a tall image at zoom 1 (regression)"` (both in
`lib/__tests__/flatten-core.test.ts`, also unmodified, 57 tests passing) — and
the R24 click-to-pixel-under-zoom tests. No assertion anywhere was weakened;
`lib/flatten-core.ts`, `BeforeAfterPreview.tsx` and `canvas-paint.ts` all have
empty diffs. So the deviation clause in the brief ("prefer duplicating a small
amount of logic if the extraction is risky") was **not** needed.

## Decisions and deviations from design.md

1. **`WORKING_CAP_PX` re-export.** design.md's core sketch imports
   `MAX_WORKING_DIMENSION` but never names what the panel renders.
   `lib/crop-core.ts` re-exports it as `WORKING_CAP_PX` so `CropSizePanel`'s R12
   note and the core pin the *same* number instead of the panel hard-coding
   2048. Pinned by a core test.
2. **`clampRectToImage` on a degenerate image.** design.md specifies the
   `MIN_CROP_PX` floor but not what happens on an image too small to hold it.
   Implemented rule: *staying inside the image wins over the usability floor*,
   with each side floored at 1 px, so the rect is never empty and never escapes
   the bounds. Documented in the function's comment and covered by the test
   `"lets the image bounds win over the min size on a tiny image"`.
3. **`refitRect` sizes before it centres.** Sizing after positioning let the
   clamp drift the centre when the preserved area did not fit the new ratio.
   The implementation clamps the *size* first, then centres the final size.
   Covered by `"Refit keeps the centre even when the new size must SHRINK to fit
   (regression)"`.
4. **`moveRect` reads the ratio off the rect** (`rect.width / rect.height`)
   rather than taking a `ratio` argument, so the clamp's derived height
   reproduces the input height exactly and a nudge can never drift the size.
   Matches design.md's signature.
5. **Reset restores `DEFAULT_PRINT_SIZE`, not a captured `entrySize` prop.**
   design.md's component sketch passes `entrySize` from the island, but the crop
   stage is always entered fresh (R1 fixes the entry size at
   `DEFAULT_PRINT_SIZE`), so the prop would have been a constant. Dropping it
   keeps the island free of transient crop state. Behaviour is identical and is
   asserted by `"Reset restores BOTH the entry target size and the Fit
   rectangle"`.
6. **The text-entry guard is duplicated inside `CropWorkspace`.** It is private
   to `FlattenWorkspace`, which this feature is not allowed to modify; a
   ~10-line predicate was copied rather than exporting new surface from a file
   outside the spec's scope. Noted in a comment at the definition.
7. **`CropCanvas` measures the canvas box itself** (a small `layout` state +
   `ResizeObserver`) in addition to the hook's measurement, because the overlay
   needs the box in *render* while the hook keeps its measurement in a ref for
   the view math only. Before layout lands (and in jsdom) the wrapper falls back
   to the full canvas box, i.e. the no-letterbox assumption.
8. **`baseOf` is an overloaded function** (`Exclude<Stage, EmptyStage>` →
   `FlattenResume`, `Stage` → `FlattenResume | null`) so the crop handlers get a
   non-null base without a `!` assertion, per the no-non-null-assertion rule.

Nothing outside the spec was added: no Prisma model/field/migration, no Server
Action, route handler, Storage access, env var, npm dependency, worker op, or
config/coverage change.

## Requirement traceability

| R | Covered by |
|---|---|
| R1 | `ImagePrep.test.tsx` › "offers Start crop from every loaded stage and blocks it while busy (R1)"; `CropWorkspace.test.tsx` › "opens with the default 71.7 × 94 mm target, the Fit rectangle and the readout"; `e2e/crop.spec.ts` |
| R2 | `crop-core.test.ts` › "accepts decimals with either separator and surrounding whitespace", "Refit re-locks to a new ratio preserving the centre and the pixel area"; `CropWorkspace.test.tsx` › "re-locks the rectangle to a typed ratio, keeping its centre", "accepts a comma decimal separator" |
| R3 | `crop-core.test.ts` › "rejects empty, non-numeric, signed and exponent forms", "rejects too many decimals, zero, negatives and out-of-range values"; `CropWorkspace.test.tsx` › "shows an inline error, changes nothing and disables Apply on invalid input (R3)" |
| R4 | `crop-core.test.ts` › "matches a preset exactly, and only exactly", "ships the six built-in presets including the workshop default"; `CropWorkspace.test.tsx` › "applies each built-in preset with aria-pressed (R4)"; `e2e/crop.spec.ts` |
| R5 | `crop-core.test.ts` › "derives the ratio and swaps orientation reversibly", "describes portrait, landscape and square"; `CropWorkspace.test.tsx` › "swaps orientation and back (R5)"; `e2e/crop.spec.ts` |
| R6 | `crop-core.test.ts` › the whole `clampRectToImage (R6)` block incl. "is idempotent — the invariant enforcer never keeps moving"; `CropWorkspace.test.tsx` › "refuses to grow a handle past the image bounds (R6, R8)" |
| R7 | `crop-core.test.ts` › `moveRect (R7, R19)` block; `CropWorkspace.test.tsx` › "an interior drag translates the rectangle and clamps at the edges (R7)" |
| R8 | `crop-core.test.ts` › `resizeRect — all 8 handles, ratio locked (R8)` and `hitTestHandle / handleCursor (R8)` blocks; `CropWorkspace.test.tsx` › "a corner-handle drag resizes from the opposite corner, ratio locked (R8)", "an edge-handle drag resizes about the perpendicular centre (R8)"; `e2e/crop.spec.ts` |
| R9 | `crop-core.test.ts` › `fitRect / fillRect / refitRect (R9, R2)` block; `CropWorkspace.test.tsx` › "Fit returns the largest centred rectangle", "Fill grows the current framing to the maximum size around its centre", "Reset restores BOTH the entry target size and the Fit rectangle"; `e2e/crop.spec.ts` |
| R10 | `crop-core.test.ts` › "reports px/mm per axis and the smaller of the two", "converts px/mm to dpi", "reports the share of working pixels kept"; `CropWorkspace.test.tsx` › "opens with the default 71.7 × 94 mm target, the Fit rectangle and the readout"; `e2e/crop.spec.ts` |
| R11 | `crop-core.test.ts` › "grades both thresholds from both sides, including exact equality"; `CropWorkspace.test.tsx` › "cautions below 5 px/mm without blocking Apply", "warns harder below 2.5 px/mm, still without blocking Apply" |
| R12 | `crop-core.test.ts` › "pins the working-image cap it reports (R12)"; `CropWorkspace.test.tsx` › "marks the matching preset active and states the working-image cap (R4, R12)" |
| R13 | `crop-core.test.ts` › `cropPixels (R13, R21)` block; `ImagePrep.test.tsx` › "Apply crops the SOURCE into a fresh loaded stage, discarding palette + flatten (R13)", "Download after Apply exports the CROPPED image, client-side (R13, R22)"; `e2e/crop.spec.ts` |
| R14 | `ImagePrep.test.tsx` › "Cancel restores the quantized stage WITH its palette-undo depth (R14)", "Cancel restores the flatten stage with its image, history and counter (R14)"; `CropWorkspace.test.tsx` › "Esc cancels the crop stage (R14)", "Cancel leaves the stage with the image untouched (R14)" |
| R15 | `ImagePrep.test.tsx` › "Revert to uncropped restores the upload and then disappears (R15)"; `e2e/crop.spec.ts` |
| R16 | `ImagePrep.test.tsx` › "goes modal: palette hidden, Adjust/Posterize/Start-flatten disabled, dropzone live (R16)" |
| R17 | `CropWorkspace.test.tsx` › `zoom / pan / expand on the crop canvas (R17)` block ("scroll zooms toward the cursor and Expand enlarges the canvas area", "Space-held left drag pans and does NOT move the crop rectangle", "a middle-button press pans instead of cropping"), plus `FlattenWorkspace.test.tsx` and `flatten-core.test.ts` passing **unmodified** after the extraction |
| R18 | `crop-core.test.ts` › `contentBoxOf / boxPointToImage / imageRectToBoxFractions (R18)` block incl. "AGREES with mapClickToPixel on every in-content point (anti-fork)"; `CropWorkspace.test.tsx` › "a press in the object-contain letterbox starts NO drag (R18)", "a drag continued off the image CLAMPS instead of being lost (R18)", "resolves a handle drag correctly under a zoomed, panned canvas box (R17, R18)" |
| R19 | `CropWorkspace.test.tsx` › "nudges by 1 px with arrows and 10 px with Shift, clamped (R19)", "typing in a millimetre field never nudges the rectangle (R19)" |
| R20 | `CropWorkspace.test.tsx` › "shows the keyboard/mouse hints strip (R20)" |
| R21 | `crop-core.test.ts` › `cropPixels (R13, R21)` block; `CropWorkspace.test.tsx` › "posts NO worker request for any crop interaction (R21)"; `ImagePrep.test.tsx` › "posts NO worker request for entering, cancelling or applying a crop (R21)" |
| R22 | `ImagePrep.test.tsx` › "Download after Apply exports the CROPPED image, client-side (R13, R22)"; the close-out diff check below; `e2e/crop.spec.ts` reload assertion |

## Final check results

Run with `corepack pnpm`. `pnpm build` was deliberately **not** run (repo's
dev-server/`.next` gotcha); `./init.sh e2e` was not run either — the E2E suite is
credential-gated and skips without `.env.local` credentials, per repo
convention.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | **PASS** — 0 errors |
| `corepack pnpm lint` | **PASS** — 0 errors, 0 new warnings (the only 4 warnings are pre-existing, in `components/planning/__tests__/WeekPlanner.test.tsx`) |
| `corepack pnpm test` | **PASS** — **67 test files, 1094 tests, all passing** |

Coverage on changed modules (v8):

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `lib/crop-core.ts` | **100** | **100** | **100** | **100** |
| `components/image-prep/CropStartCard.tsx` | 100 | 100 | 100 | 100 |
| `components/image-prep/CropWorkspace.tsx` | 98.83 | 98.03 | 100 | 98.83 |
| `components/image-prep/CropSizePanel.tsx` | 98.08 | 94.44 | 100 | 98.08 |
| `components/image-prep/FlattenCanvas.tsx` | 97.08 | 90 | 100 | 97.08 |
| `components/image-prep/ImagePrep.tsx` | 93.64 | 86.23 | 100 | 93.64 |
| `components/image-prep/use-canvas-view.ts` | 90.06 | 86.66 | 100 | 90.06 |
| `components/image-prep/CropCanvas.tsx` | 83.76 | 77.77 | 71.42 | 83.76 |

`lib/crop-core.ts` hits the 100%-branch target; every other changed module is
above the ≥ 80% lines target. No coverage exclusion or threshold was edited.

New-test counts: `crop-core.test.ts` 60 · `CropWorkspace.test.tsx` 29 ·
`ImagePrep.test.tsx` +8 crop tests (56 total in the file) = **97 new tests**.

## No-persistence contract (R22) — verified

`git diff` is **empty** for all of: `prisma/` (schema + migrations),
`package.json`, `pnpm-lock.yaml`, `.env.example`, `vitest.config.ts`,
`next.config.ts`, `actions/`, `app/api/`, `lib/image-prep-core.ts`,
`lib/flatten-core.ts`, `components/image-prep/worker-messages.ts`,
`components/image-prep/image-prep.worker.ts`,
`components/image-prep/useImagePrepWorker.ts`,
`components/image-prep/BeforeAfterPreview.tsx`,
`components/image-prep/canvas-paint.ts`, and
`components/image-prep/__tests__/FlattenWorkspace.test.tsx`.

No Storage access, no `localStorage`/cookie/URL state, no Zod schema (no server
boundary exists). The presets are compile-time constants in `lib/crop-core.ts`.
No `console.log` and no `any` in any new or changed file.

## Files created

- `lib/crop-core.ts`
- `lib/__tests__/crop-core.test.ts`
- `components/image-prep/use-canvas-view.ts`
- `components/image-prep/CropCanvas.tsx`
- `components/image-prep/CropSizePanel.tsx`
- `components/image-prep/CropStartCard.tsx`
- `components/image-prep/CropWorkspace.tsx`
- `components/image-prep/__tests__/CropWorkspace.test.tsx`
- `e2e/crop.spec.ts`

## Files modified

- `components/image-prep/ImagePrep.tsx` (stage integration)
- `components/image-prep/FlattenCanvas.tsx` (consumes the extracted hook only)
- `components/image-prep/__tests__/ImagePrep.test.tsx` (crop integration block)
- `specs/13_crop/tasks.md` (all 16 tasks marked `[x]`)

## Status

Implementation complete and verified. `feature_list.json` is **not** touched by
this implementer and `13_crop` remains `in_progress` — the reviewer gate runs
next.
