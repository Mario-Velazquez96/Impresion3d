# Review — 07_weekly_planning: picker sources the full Color catalog

**Verdict: APPROVE.** The leader may keep `07_weekly_planning` marked `done`; this
focused change is verified and all checks are green.

## Scope of review

A single product-owner tweak: the Planning page's "colors to dry this week" picker
now sources its selectable colors from the **full `Color` catalog**
(`db.color.findMany({ orderBy: { name: "asc" } })`) instead of only colors used by
existing prints. Read-only verification; no code modified.

## What I verified

### 1. Picker now fed from ALL catalog colors; old limiting logic gone
- `app/(app)/planning/page.tsx` now loads the catalog inside the existing
  `Promise.all` via `db.color.findMany({ select: { id, name, hex }, orderBy: { name: "asc" } })`
  and passes it as `allColors` to `<WeekPlanner>` → `<ColorPicker>`.
- The previous `colorMap` loop that derived `allColors` from the deduped colors used
  by loaded prints (plus its `localeCompare` sort) is **removed** — confirmed in the
  diff. The new source is independent of the prints loaded for matching.
- `db` is the server-only Prisma singleton (`lib/db.ts`, `import "server-only"`),
  used in a Server Component — correct Server/Client boundary.

### 2. Match core UNCHANGED + still 100% branch coverage
- `git diff HEAD` is **empty** for `lib/planning-core.ts`, `lib/services/planning.ts`,
  `components/planning/WeekPlanner.tsx`, and `components/planning/ColorPicker.tsx`
  — byte-identical to HEAD.
- `fullMatches` / `partialMatches` / `dryingSchedule` and the MON→PREVIOUS_WEEK edge
  are untouched. The worked example (Piel→full; Piel,Verde→partial missing Verde;
  Rojo→neither; empty available→both empty, R6) is unchanged.
- Coverage: `lib/planning-core.ts` = **100% statements / 100% branches / 100%
  functions / 100% lines** (20 tests). `lib/services/planning.ts` = 100% across the
  board. R4/R5/R6 matching behavior unchanged.

### 3. setWeekColors, day grid, drying panel, swatches (R11) intact
- `setWeekColors` (atomic color-set replace) lives in the unchanged
  `lib/services/planning.ts`. R3 persistence path is the persisted `WeekPlanColor`
  rows (`initialAvailableColorIds`), unchanged.
- WeekGrid, DayColumn, drying panel, and hex-swatch rendering are unmodified;
  the picker still renders one swatch per listed color from `hex`.

### 4. Updated component test genuinely asserts the new behavior (not weakened)
- `components/planning/__tests__/WeekPlanner.test.tsx`: adds `AZUL` (id `azul`), a
  catalog color used by **no** print, and sets `allColors = [AZUL, PIEL, ROJO, VERDE]`.
- New test "lists ALL catalog colors ordered by name, incl. one no print uses
  (R3, R11)" asserts: checkbox count equals `allColors.length` (4), labels equal
  `["Azul", "Piel", "Rojo", "Verde"]` (name order), and `Azul` is selectable — a
  genuine proof that the source is the catalog, not colors-used-by-prints.
- The swatch test is extended to assert `Azul`'s `rgb(0, 0, 204)` swatch renders.
- No pre-existing assertion was weakened; the full/partial/empty/worked-example
  matcher tests still pass with the augmented `allColors` (AZUL never enters
  `initialAvailableColorIds`, so matching is identical).

### 5. Scope discipline
- Working-tree code changes limited to exactly two files: `app/(app)/planning/page.tsx`
  and `components/planning/__tests__/WeekPlanner.test.tsx`. Remaining modified files
  are spec/docs/progress only (`specs/07_weekly_planning/*`, `progress/current.md`,
  `feature_list.json`, `package.json`, new `progress/impl_07_picker_all_colors.md`,
  new `docs/deployment.md`).
- No new model, table, route, env var, or dependency. No other feature touched. No
  schema/migration change (none needed — the `Color` catalog already exists).

## Pipeline (independently run, `corepack pnpm`)

- **typecheck** (`tsc --noEmit`) — PASS, no errors.
- **lint** (`next lint`) — PASS, no errors. Only 4 pre-existing
  `'_a' is defined but never used` warnings in the test file's hoisted mocks
  (predate this change; not introduced here).
- **test + coverage** — PASS: **42 test files, 424 tests passed**.
  `lib/planning-core.ts` **100% branch**; `lib/services/planning.ts` 100%.
- **build** — PASS: 11 pages generated; `/planning` builds as a dynamic
  server-rendered route.

## Conclusion

The picker is correctly re-sourced from the full catalog ordered by name, the match
core and worked example are provably unchanged and still at 100% branch coverage,
the updated test is honest, and there is no scope creep. **APPROVE.**
