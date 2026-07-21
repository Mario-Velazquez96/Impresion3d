# Review — 13_crop

**Reviewer verdict: APPROVED**
**Date:** 2026-07-21 · **Feature:** `13_crop` (crop-to-print-size stage, option A ratio-only)
**Spec:** `specs/13_crop/{requirements,design,tasks}.md` (22 requirements, 16 tasks)
**Implementation log:** `progress/impl_13_crop.md`

---

## 1. The regression risk — the `use-canvas-view` extraction (top priority)

This was the one item that refactored working, shipped Flatten code. **It is clean.**

**The pan-bounds fix survived intact.** `components/image-prep/use-canvas-view.ts`
still measures the *content*, not the viewport:

- `contentSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight }` where `el`
  is the **base canvas** (`contentRef`), i.e. untransformed **layout** pixels —
  `getBoundingClientRect` (which the CSS zoom transform multiplies) is
  deliberately *not* used. The original comment explaining exactly this is
  carried over verbatim.
- The `ResizeObserver` survived, still observing **both** the canvas and the
  viewport, still guarded by `typeof ResizeObserver === "undefined"` for jsdom,
  still re-clamping on resize with the identity-preserving `setView` bail-out.
- `clampView(v, box.offsetWidth, box.offsetHeight, el.offsetWidth, el.offsetHeight)`
  — the measured content size is still what reaches `clampView`/`panBy`/`zoomAt`,
  so `minPan = Math.min(0, box - content x zoom)` is still derived from measured
  content. The fallback to the viewport box before the first measurement lands is
  preserved (it locks the pan rather than letting it run unbounded).
- `lib/flatten-core.ts` has an **empty diff** — the math itself was not touched;
  the hook imports `zoomAt`/`panBy`/`clampView`/`IDENTITY_VIEW` from it.

Only three mechanical deltas, all verified no-ops: `contentBox`/`handlePanStart`/
`toggleExpanded` became `[]`-dep `useCallback`s (stable identities, so the effects
now listing them re-run exactly as before: never); `contentRef` renamed to
`contentSizeRef` (the name `contentRef` is now the hook's parameter); the measure
effect keys on `resetKey`, which `FlattenCanvas` passes as `current` — same value.

**Both protected test files are genuinely UNMODIFIED.** Verified by
`git diff HEAD` against those exact paths — empty for both
`components/image-prep/__tests__/FlattenWorkspace.test.tsx` and
`lib/__tests__/flatten-core.test.ts`. No assertion could have been weakened.
Re-ran the two suites: **92/92 pass**, including every named regression test:

- `flatten-core.test.ts` > "clampView allows panning to the bottom of content taller than the box at zoom 1" — PASS
- `flatten-core.test.ts` > "panBy reaches the bottom of a tall image at zoom 1 (regression)" — PASS
- `flatten-core.test.ts` > "clampView allows panning to the right edge of content wider than the box at zoom 1" — PASS
- `FlattenWorkspace.test.tsx` > "pans at zoom 1 when the content overflows the viewport (regression)" — PASS (the user-facing bug)
- `FlattenWorkspace.test.tsx` > "fits the whole image in the viewport at zoom 1 and follows Expand (R23)" — PASS
- `FlattenWorkspace.test.tsx` > "resolves clicks to the correct pixel under a zoomed canvas box (R24)" — PASS

`FlattenCanvas.tsx`'s own diff is consumption-only: it deletes the moved glue and
destructures the hook. `view` is no longer read directly (only `transformStyle`),
`capClass`/`fitClass` are applied to the same elements, and the `data-testid`s
(`flatten-viewport`, `flatten-transform`) are unchanged.

## 2. Option A semantics — ratio-only, no hidden resampling

Verified at the only place pixels are produced, `cropPixels` in `lib/crop-core.ts`:
a row-wise `subarray` then `set` copy into a fresh `Uint8ClampedArray`, output
dimensions exactly the (defensively clamped) rect. There is **no** scale factor,
interpolation, or px/mm term anywhere in the function, and no DPI/px target input
exists in the UI. Pinned by tests: "a full-image rectangle is byte-identical —
proving NO resampling" (asserts `out.data` equals `src.data` yet is a different
buffer) and "keeps the maximum available pixels for a real crop (option A)".
The mm values reach only `aspectRatio` and the readout.

## 3. Core correctness — `lib/crop-core.ts` (100% branch)

- **mm to ratio:** `parseMmInput` handles `.`/`,` separators and whitespace, and
  rejects empty/non-numeric/signed/exponent/`7.1.7`/`94mm`/more than 2 decimals/
  zero/negative/out-of-range. Both range ends accepted.
- **Ratio + bounds can never be broken:** every rect-producing function
  (`fitRect`, `fillRect`, `refitRect`, `moveRect`, `resizeRect`) terminates in
  `clampRectToImage`, which makes the width authoritative and *derives*
  `height = round(width / ratio)` — so it is idempotent by construction (tested).
  The test helper `expectInvariants` asserts the full R6 set (integers, x,y >= 0,
  x+w <= imgW, y+h <= imgH, min-side floor, and |h - w/ratio| <= 0.5) and is
  applied on every rect-op test, including an exhaustive loop over all 8 handles
  dragged to +/-5000 px. Growth stops at the bounds rather than breaking ratio.
- **Fit/Fill/Reset:** covered for portrait-on-landscape, landscape-on-portrait,
  the 3:4 identity case, odd-remainder centring, off-centre Fill, and the
  refit-must-shrink regression.
- **px/mm + thresholds:** `resolutionLevel` probed from both sides of both
  thresholds *including exact equality* (`PX_PER_MM_MIN` grades `"low"`, not
  `"critical"` — correct, the rule is strictly-below).
- **Degenerate inputs:** sub-`MIN_CROP_PX` images ("lets the image bounds win over
  the min size on a tiny image"), degenerate boxes return `null` on every
  dimension, and out-of-bounds/negative rects are clamped in `cropPixels`
  "instead of throwing". Zero/negative/NaN mm cannot reach the core at all:
  `parseMmInput` returns `null` and `CropWorkspace` leaves `size` untouched.
- Coverage measured independently: **100% statements / branch / functions / lines.**

## 4. Upstream-commit semantics (the R16 invariant)

`handleApplyCrop` builds
`{ kind: "loaded", ...loadedFieldsOf(source), original: cropPixels(source.original, rect) }`.
Because the fresh stage is a `LoadedStage`, it has **no field** for `adjusted`,
`histogram`, `image`, `palette`, `paletteHistory`, `current`, flatten history or
the regions counter — stale downstream state is discarded *structurally*, not by
being cleared, so it cannot survive. It crops `source.original` (the pipeline
source via `baseOf`, unwrapping crop -> resume -> flatten -> resume), never the
posterized/flattened preview. Asserted by "Apply crops the SOURCE into a fresh
loaded stage, discarding palette + flatten (R13)".

`handleCancelCrop` is `setStage(current.resume)` — a pure object restore, so the
palette *and its undo depth* and the flatten image/history/counter come back by
identity. Both are asserted behaviourally (the palette test clicks Undo after
Cancel and checks the depth is exactly right, then that Undo becomes disabled).

`handleRevertCrop` sets `original = source.uploaded` and keeps `uploaded`, so
`original === uploaded` again and `croppedInfo` becomes `null` — the button
disappears on its own with no boolean to desync. No stale buffer is resurrected
(`uploaded` is retained throughout by design, the same reference as `original`
until the first crop, so an uncropped session costs no extra memory) and the
cropped buffer is simply dropped. Round-trip asserted by "Revert to uncropped
restores the upload and then disappears (R15)".

## 5. Requirement to test traceability

**R1-R22 all trace to at least one genuine behavioural test. No gaps found.**
I spot-checked the load-bearing entries rather than trusting the log's table:
R6 (`expectInvariants` applied across every rect op), R11 (both thresholds from
both sides incl. equality), R13 (island Apply + `cropPixels` byte-exactness),
R14 (both Cancel paths with undo-depth/counter assertions), R18 (the
`mapClickToPixel` "anti-fork" agreement test loops the whole in-content grid),
R21 (worker call-count unchanged across enter/cancel/apply/revert), R22 (contract
diff + E2E reload). The tests assert outcomes, not mere execution.

`e2e/crop.spec.ts` is present, credential-gated with `test.skip` on absent
`E2E_EMPLOYEE_EMAIL`/`E2E_EMPLOYEE_PASSWORD` exactly like `e2e/image-prep.spec.ts`,
and reuses the committed fixture. **Written, not executed** — correct per repo
convention; its arithmetic (64x64 fixture -> 48x63 Fit rect at 71.7x94) checks out.

## 6. Scope and contract

Empty `git diff` independently confirmed for: `prisma/` (schema + migrations),
`package.json`, `pnpm-lock.yaml`, `.env.example`, `vitest.config.ts`,
`next.config.ts`, `actions/`, `app/api/`, `lib/image-prep-core.ts`,
`lib/flatten-core.ts`, `worker-messages.ts`, `image-prep.worker.ts`,
`useImagePrepWorker.ts`, `BeforeAfterPreview.tsx`, `canvas-paint.ts`.
No Storage/server-action/route-handler/env/dependency change. No `localStorage`,
cookie, or URL state. Presets are compile-time constants in `lib/crop-core.ts`
only — no persisted user presets. No worker op, message type, or hook change.
No `console.log`, no `any`, no `@ts-ignore`, no bare TODO/FIXME in any new or
changed file. Features 00-12 are otherwise untouched: the only pre-existing app
files modified are `FlattenCanvas.tsx` (consumption-only refactor) and
`ImagePrep.tsx` (stage integration). `ImagePrep.test.tsx` is **282 insertions,
0 deletions** — purely additive, so no existing assertion was weakened.

Note (not a finding, not the implementer's doing): `feature_list.json` and
`progress/current.md` carry the leader's own entry/status edits.

## 7. Gates re-run by the reviewer

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | **PASS** — 0 errors |
| `corepack pnpm lint` | **PASS** — 0 errors; only the 4 pre-existing `_a` warnings in `components/planning/__tests__/WeekPlanner.test.tsx` |
| `corepack pnpm test` | **PASS** — **67 test files, 1094 tests, 0 failures** |
| `vitest run` (flatten suites) | **PASS** — 92/92, protected files unmodified |
| `pnpm build` | **not run** (per instruction) |
| `./init.sh e2e` | **not run** — credential-gated suite, skips without `.env.local` |

Coverage (v8), matching the implementer's report:

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `lib/crop-core.ts` | **100** | **100** | **100** | **100** |
| `CropStartCard.tsx` | 100 | 100 | 100 | 100 |
| `CropWorkspace.tsx` | 98.83 | 98.03 | 100 | 98.83 |
| `CropSizePanel.tsx` | 98.08 | 94.44 | 100 | 98.08 |
| `FlattenCanvas.tsx` | 97.08 | 90 | 100 | 97.08 |
| `ImagePrep.tsx` | 93.64 | 86.23 | 100 | 93.64 |
| `use-canvas-view.ts` | 90.06 | 86.66 | 100 | 90.06 |
| `CropCanvas.tsx` | 83.76 | 77.77 | 71.42 | 83.76 |

`lib/crop-core.ts` meets the 100%-branch target; every other changed module
clears the >= 80% lines target. No coverage exclusion or threshold was edited.

## 8. Task completeness

All 16 tasks in `specs/13_crop/tasks.md` are `- [x]` and spot-checked against the
code as actually done — including the close-out contract check, which I
re-verified independently rather than taking on trust.

## Non-blocking observations (no action required)

1. `CropCanvas.tsx` keeps a second `ResizeObserver`/`layout` state alongside the
   hook's measurement because the overlay needs the box during *render* while the
   hook keeps its measurement in a ref. Documented in the file; the duplication is
   ~15 lines and justified. Its lower function coverage (71.42%) is the
   jsdom-unreachable measure/observer callbacks, not untested behaviour.
2. The feature-12 text-entry guard is duplicated (~10 lines) in `CropWorkspace`
   rather than exported from `FlattenWorkspace`, which this feature is not
   authorized to modify. Correct call; noted in a comment at the definition.
3. Deviations 1-8 in the implementation log are all documented, spec-consistent,
   and each is pinned by a named test.

---

## Verdict

**APPROVED.** The `use-canvas-view` extraction is behaviour-preserving and the
tall-image pan fix is provably intact, with its regression tests unmodified and
passing. Option A is honoured with no hidden resampling, the crop rectangle's
invariants hold by construction, Apply/Cancel/Revert have correct
upstream-commit semantics, all R1-R22 trace to genuine tests, the no-persistence
contract holds, and typecheck/lint/test are green.

The leader may mark `13_crop` as `done` in `feature_list.json`.
