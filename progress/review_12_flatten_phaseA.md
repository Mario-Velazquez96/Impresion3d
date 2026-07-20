# Phase A review — 12_flatten

**Verdict: APPROVED** (phase review; feature remains `in_progress` for Phases B/C)
**Reviewer:** reviewer subagent · 2026-07-20

Phase A of `12_flatten` (flood/brush region select + selection + fill + flatten
+ flatten-scoped undo + stage entry/exit) is complete, green, and cleanly
scoped. The leader may commit and deploy this increment. The feature is NOT to
be marked `done` — Phases B and C are still pending.

## What I verified

### 1. Phase discipline — PASS
- `specs/12_flatten/tasks.md`: every Phase A box is `[x]`; every Phase B, Phase
  C, and close-out box is `[ ]`. No premature checkmarks.
- Phase B/C behaviors are cleanly absent or cleanly stubbed, never
  half-implemented:
  - `lib/flatten-core.ts` omits `smoothMask`, `addStrayIslands`, `recolorExact`,
    `removeSmallRegions`, and the view math entirely (absent, not stubbed).
  - `image-prep.worker.ts` dispatch throws clear, user-safe errors for
    `mode !== "flood"`, `catchStrays`, and `action.kind !== "fill"` — all riding
    the existing `{ ok: false, error }` path.
  - `worker-messages.ts` ships the FULL protocol shape (`FlattenAction` =
    fill/recolor/removeSmall; `mask` mode includes `smooth`) per the explicit
    tasks.md instruction "shapes for all phases, dispatch lands per phase" — a
    documented decision, not scope creep.
  - `FlattenControls` offers only Flood/Brush; no Smooth radio, catch-strays,
    presets, or Despeckle. `FlattenFillPanel` has no Recolor-every-match button.
    `FlattenCanvas` renders the static identity view (no wheel/pan/Expand).

### 2. Requirement -> test traceability (Phase A) — PASS
Every Phase-A requirement has at least one genuine behavioral test:
- R1/R2/R3/R22/R27 -> `ImagePrep.test.tsx` "flatten stage integration" suite
  (Start enabled from loaded+quantized, disabled while busy; palette hidden;
  Exit restores prior stage incl. palette-undo depth; Apply/Posterize/new-file
  discard; Download names `<base>-prepped.png` with no fetch).
- R4/R5 -> core `floodMask`/`buildFlattenOverlay` tests + workspace hover test
  (background request asserted, letterbox clears).
- R7 -> core `brushMask` tests + workspace "brush click ... without any worker
  mask call".
- R8 -> workspace W/S tolerance and radius stepping incl. clamps at both ends.
- R10/R11/R12 -> workspace add/remove/Esc/Clear with live "N px selected".
- R13/R14/R15 -> fill-panel suggested %+runner-ups, runner-up click, valid/
  invalid hex, Pick without altering selection; core `maskStats`/`parseHexInput`/
  `colorAtPixel`.
- R16 -> workspace "Flatten selection" (button AND Enter), counter bumps by
  region count; core `applyFillToMask`.
- R20/R21/R22 -> workspace Z-undo to baseline (pixels AND counter), `z` in hex
  input ignored, Undo disabled while busy, Reset all past the history cap.
- R24 (zoom 1) -> letterbox rejection via reused `mapClickToPixel`.
- R25 -> hints-strip test. R26 -> busy-disable + background-request assertions +
  `useImagePrepWorker.test.ts` background suite. R28 -> confirmed by diff below.

### 3. Correctness by reading the code — PASS
- `lib/flatten-core.ts`: `floodMask` is an ITERATIVE FIFO BFS over a typed
  `Int32Array` queue with fixed neighbor order (left/right/up/down) — no
  recursion, no stack-overflow risk; seed clamped and always included; negative
  tolerance floored to 0; distance measured from the SEED color (R5 semantics
  correct). `brushMask` uses `dx*dx+dy*dy <= r*r`, radius clamped, bounds
  clipped. `maskStats` counts exact colors, sorts count-desc with first-row-major
  tie-break (deterministic runner-up ordering). `applyFillToMask` slices a new
  buffer (input never mutated; alpha untouched — pinned by a test). Overlay
  builder paints selection tint -> selection outline -> hover outline (hover
  wins), returns null when nothing to draw. 100% branch/line confirmed by
  coverage.
- `ImagePrep.tsx`: `FlattenStage` carries `resume` (exact prior stage object),
  `entry` (Reset target held outside the capped stack), `current`, capped
  `history`, and counter. Enter snapshots working image + seeds baseline; Exit is
  a pure `setStage(resume)` restoring palette + palette-undo history untouched;
  Apply/Posterize/load read through `base = resume` so upstream ops structurally
  discard the stage (R16/R2 invariant holds). Undo/Reset are pure pops restoring
  pixels AND counter together. The R20 palette listener stays inert during
  flatten (its `canUndo` needs the quantized stage); R23 highlight path is
  dormant inside `resume` and unbroken.
- Worker protocol: new `mask`/`flatten` actions typed; dispatch buffers ride the
  transfer list both ways; new fresh buffers out of the core, so no pipeline
  buffer is mutated. Existing adjust/quantize/palette ops unchanged.
- Hover pipeline: coalesced to at most one in-flight `mask` request via
  `hoverInFlightRef`; stale responses discarded and re-issued by refreshing the
  seed identity; brush masks computed synchronously; background requests skip the
  busy accounting (never flip the global indicator).
- `FlattenCanvas`: reuses the proven `mapClickToPixel` against
  `getBoundingClientRect()`; letterbox positions resolve to null and clear hover;
  `canvas-paint.ts` keeps the jsdom null-ref + missing-2D-context guards; render
  code only reads `current`/overlay, never mutates.

### 4. Scope — PASS
- No schema/migration change (`prisma/` diff empty), no `package.json` /
  lockfile / env / vitest / next config change, no `actions/` or `app/api/`
  route, no Storage code. `lib/image-prep-core.ts` diff is empty.
- Features 00-11 untouched except the sanctioned image-prep integration points.
- No `console.*`, no `any`/`as any` in the new Flatten components.

### 5. Checks re-run by me (build intentionally skipped) — PASS
- `corepack pnpm typecheck` — clean (0 errors).
- `corepack pnpm lint` — 0 errors; only the 4 pre-existing warnings in the
  untouched `WeekPlanner.test.tsx`.
- `corepack pnpm test` — 954 tests / 65 files, all passing.
- Coverage: `lib/flatten-core.ts` 100% branch / 100% lines. Changed modules all
  >= 80% lines: FlattenControls/FillPanel/StartCard/canvas-paint/worker-messages/
  useImagePrepWorker 100%, FlattenCanvas 96.19%, FlattenWorkspace 92.4%,
  ImagePrep 94.11%, BeforeAfterPreview 95.86%. `image-prep.worker.ts` keeps its
  pre-existing coverage exclusion (no config change).

## Notes (non-blocking)
- The implementer's documented deviations (text-entry guard exempts
  radio/checkbox/range/button so W/S survive a focused radio; Exit disabled while
  busy; alpha untouched in `applyFillToMask`; E2E written Phase-A-scoped with the
  close-out box left unchecked) are all reasonable and consistent with the spec's
  intent. No action required.
- `e2e/flatten.spec.ts` is credential-gated and not executed here (repo-wide
  pattern), matching `e2e/image-prep.spec.ts`.
