# Review — 12_flatten Phase B (Smooth mask, Catch strays, Recolor every match)

**Scope reviewed:** R6 (smooth mask), R9 (catch stray pixels), R17 (recolor every
match). Phase A already merged; feature stays `in_progress` for Phase C.

## Verdict: APPROVED

The leader may commit and deploy this increment (feature remains `in_progress`).

## What was verified

### 1. Phase discipline — clean
- `specs/12_flatten/tasks.md`: all Phase A + Phase B boxes `[x]`; every Phase C
  box (lines 59–64) and close-out box (68–70) remains `[ ]`.
- Phase C behaviors are cleanly ABSENT, not half-implemented:
  - No `removeSmallRegions`, `zoomAt`, `panBy`, `clampView`, `ViewTransform`,
    or preset/zoom constants in `lib/flatten-core.ts`.
  - No Low/Medium/High/Despeckle buttons in `FlattenControls.tsx`; no
    zoom/pan/Expand handlers in `FlattenCanvas.tsx` (identity view only).
  - The `removeSmall` worker action (part of the full protocol intentionally
    shipped whole in Phase A per tasks.md line 24) still throws a clear
    "not available yet" error over the `{ ok: false }` path — a deliberate stub,
    not a partial implementation.

### 2. Correctness (code read)
- **`smoothMask`** (flatten-core.ts:171): genuinely distinct from `floodMask` —
  the inclusion test compares each neighbor against the CURRENT pixel
  (`colorDistance(color, current) <= tol`), not the seed, giving local-chaining
  gradient capture. FIFO BFS with a `visited` array marks each pixel once, so it
  terminates; fixed L/R/U/D neighbor order keeps it deterministic. Not an alias.
- **`addStrayIslands`** (flatten-core.ts:282): restricts to SMALL and NEAR by two
  independent gates — `component.length <= STRAY_MAX_ISLAND_PX` (16) AND the
  component bbox fully inside the main bbox dilated by `STRAY_MARGIN_PX` (8),
  clipped to the image. Only non-mask, seed-color-matching components are
  considered; empty input mask returns unchanged; works on a `.slice()` copy so
  the input is never mutated. Row-major discovery + FIFO BFS = deterministic. It
  cannot swallow a large region (size cap) or the whole image (margin bbox).
- **`recolorExact`** (flatten-core.ts:550): new buffer via `.slice()`; swaps only
  pixels EXACTLY equal to `from` on all three RGB channels (near-miss on any
  channel untouched, alpha preserved); other colors are never touched. In the
  workspace it reports up via `onMutated(pixels, 0)` so it pushes the flatten
  undo history and leaves the counter unchanged — undoable by Z like other ops.
- All three keep `lib/flatten-core.ts` at 100% branch / 100% line coverage.

### 3. Requirement → test traceability (genuine behavioral tests)
- **R6:** `smoothMask` core suite (gradient chains where flood rejects at the
  same tolerance; step boundary include/exclude; uniform-region + seed clamp;
  determinism) + FlattenWorkspace test asserting the hover mask request carries
  `mode: "smooth"` with its own independently-stepped tolerance.
- **R9:** `addStrayIslands` core suite (absorb within margin; reject over size
  cap; reject outside margin bbox; no-op / empty-mask; input unmutated) +
  FlattenWorkspace test asserting the checkbox appears for flood/smooth only
  (not brush) and its value rides the mask request.
- **R17:** `recolorExact` core suite (exact-only swap, near-miss untouched,
  unmutated) + FlattenWorkspace test asserting the button is disabled at the
  suggested fill, enabled after choosing another, swaps a match OUTSIDE the
  original selection, clears the selection, is undoable, and leaves the counter
  unchanged.

### 4. Integration / no regression
- Worker `flatten` dispatch remains exhaustive over the action union
  (removeSmall → throw, recolor → `recolorExact`, else fill → `applyFillToMask`);
  `mask` dispatch handles flood/smooth + optional `addStrayIslands`.
- Full suite green: 967 tests / 65 files. Phase A behaviors and features 00–11
  (incl. palette undo R20 and highlight R23 suites) all pass unchanged.

### 5. Scope discipline
- Changed files are only: `lib/flatten-core.ts`, `image-prep.worker.ts`,
  `FlattenControls.tsx`, `FlattenFillPanel.tsx`, `FlattenWorkspace.tsx`, the two
  test files, and the progress/spec docs. No schema, migration, dependency,
  env var, route, action, Storage, or config change. `package.json` unchanged.

### 6. Checks (re-run by reviewer; build NOT run per instruction)
- `corepack pnpm typecheck` — clean (0 errors).
- `corepack pnpm lint` — 0 errors (only the 4 pre-existing WeekPlanner warnings).
- `corepack pnpm test` — 967 passed / 65 files. `lib/flatten-core.ts` 100%
  branch + line; `components/image-prep` aggregate 96.69% line (every changed
  module ≥ 80%; `image-prep.worker.ts` keeps its pre-existing coverage
  exclusion).

## Non-blocking notes
- `smoothMask` marks pixels visited on first touch, so a pixel is compared
  against whichever in-tolerance neighbor reaches it first. This is deterministic
  (fixed neighbor order) and matches the design's local-chaining intent — noted
  for awareness, not a defect.
