# Implementation progress — 07_weekly_planning (FINAL feature)

Status: implementation complete; credential-free pipeline GREEN. Migration apply,
Playwright E2E, and RLS denial tests are credential-gated (no `.env.local` present)
and are written, ready to run with dev/staging Supabase. Awaiting reviewer.

## Tasks completed (all of tasks.md)

1. `Weekday` enum + `WeekPlan`/`WeekPlanColor`/`WeekPlanItem` models + back-relations
   on `User`, `Color`, `Print` (the `weekItems` relation 06 deferred). Migration SQL
   written; **apply is credential-gated**.
2. RLS SQL migration (enable + FORCE + authenticated read/write on all three tables).
3. Pure match/drying CORE (`fullMatches`, `partialMatches`, `dryingSchedule`).
4. `getOrCreateWeekPlan` + `setWeekColors` (upsert + atomic color-set replace in a tx).
5. `assignPrintToDay` (end position), `moveWeekItem`, `removeWeekItem`.
6. Zod `setWeekColorsSchema`, `assignItemSchema`, `moveItemSchema` (+ `removeItemSchema`).
7. `actions/planning.ts` (requireUser-first + Zod + `revalidatePath('/planning')`).
8. `planning/page.tsx` Server Component + `loading.tsx` + `error.tsx`.
9. Client islands: `WeekPlanner`, `ColorPicker`, `MatchModeToggle`, `FilteredInventory`,
   `WeekGrid`, `DayColumn`, plus `Swatch`/`SwatchList` + shared `types.ts`. `/planning`
   nav link added.
10. Vitest core/service/action/component tests; Playwright E2E + RLS denial specs.

## Gate-decision defaults applied

- Week starts **Monday**; `snapToMonday` snaps any date to 00:00 UTC of its Monday.
- Day assignment uses the **Select fallback** (no dnd this slice).
- Internal-tool authz: `requireUser()` on every mutation; no per-row ownership.
- "Dry the day before" is **derived** at render (`dryingSchedule`), never stored.

## Requirement traceability (R1–R11)

- **R1** (models) — `prisma/schema.prisma` (Weekday enum + 3 models + back-relations);
  migration `20260622130000_weekly_planning`. Covered by build/typecheck + service
  tests exercising the relations.
- **R2** (RLS authenticated-only) — `20260622130100_weekly_planning_rls/migration.sql`.
  Test: `e2e/planning-rls.spec.ts` "RLS denies the unauthenticated path…" + the
  signed-out redirect in `e2e/planning.spec.ts` (credential-gated).
- **R3** (persist week colors, replace set, create plan if absent) — `setWeekColors` /
  `getOrCreateWeekPlan`. Tests: `lib/services/__tests__/planning.test.ts`
  "setWeekColors … upsert plan, then deleteMany + createMany the colors in one tx",
  "getOrCreateWeekPlan … create-if-absent / snap"; action `setWeekColorsAction`
  success test in `actions/__tests__/planning.test.ts`; component `ColorPicker
  persists via setWeekColors`.
- **R4** (full match default) — `fullMatches`. Tests:
  `lib/__tests__/planning-core.test.ts` "returns ONLY the {Piel} print for the worked
  example"; component "full mode (default) lists only fully-producible prints".
- **R5** (partial match + missing colors) — `partialMatches`. Tests:
  "returns ONLY {Piel, Verde} (missing {Verde})", "computes multiple missing colors
  in order"; component "toggling partial … shows its missing colors".
- **R6** (empty available ⇒ both empty) — guards in both matchers. Tests:
  "empty available ⇒ no full matches", "… no partial matches"; component "empty
  available set ⇒ both modes empty with an informative message".
- **R7** (assign at end of day order) — `assignPrintToDay`. Tests: service "appends at
  position 0 when the day is empty" + "appends at max+1 when the day already has
  items"; action `assignItemAction` success; component "assigns a print to a day via
  the Select fallback".
- **R8** (move/remove persist) — `moveWeekItem`/`removeWeekItem`. Tests: service
  "moveWeekItem updates the item's day and position", "removeWeekItem deletes by id";
  actions `moveItemAction`/`removeItemAction`; component "removing … calls removeItem",
  "moving … calls moveItem".
- **R9** (derived day−1 drying incl. MON edge) — `dryingSchedule`/`previousDay`. Tests:
  "attributes a TUE print's colors to MON", "attributes a MON print's colors to the
  PREVIOUS_WEEK marker (edge case)", "unions + deduplicates + sorts …"; component
  "shows the 'dry the previous Sunday' panel for Monday's prints".
- **R10** (unauthenticated mutation rejected, no write) — `requireUser()` first in every
  action. Tests: each action's "rejects an unauthenticated caller and writes nothing"
  in `actions/__tests__/planning.test.ts` (4 mutations); RLS spec anon INSERT.
- **R11** (swatches from hex everywhere) — `Swatch`/`SwatchList`; picker swatches.
  Tests: component "renders a swatch for each color (R11)" (asserts rgb from hex);
  swatches render in inventory/grid/dry panels.

### Worked-example assertions (explicit)

In `lib/__tests__/planning-core.test.ts` with available = {Piel, Café, Azul}:
- `{Piel}` print → **full match** (`fullMatches` returns exactly `["p-piel"]`).
- `{Piel, Verde}` print → **partial**, `missingColorIds === ["verde"]`.
- `{Rojo Cochinilla}` print → in **NEITHER** list (full excludes it; partial excludes
  it for sharing no color).
- Empty available ⇒ both `fullMatches` and `partialMatches` return `[]` (R6).

## Pipeline results (credential-free stages)

- `corepack pnpm typecheck` — PASS (0 errors).
- `corepack pnpm lint` — PASS (no ESLint warnings/errors).
- `corepack pnpm test` (vitest --coverage) — PASS: **42 files, 423 tests**.
  New planning tests: planning-core 20, service 13, actions 12, component 11 (56 total).
- **Match/drying BRANCH coverage: `lib/planning-core.ts` = 100% stmts / 100% branch /
  100% funcs / 100% lines** (verified in isolation and in the full run). Service
  `lib/services/planning.ts` and `lib/validation/planning.ts` = 100% across the board;
  `actions/planning.ts` 100%; planning components ~94% lines / ~86% branch (uncovered
  lines are useActionState error-render fallbacks).
- `corepack pnpm build` — PASS; `/planning` builds as a dynamic route.

## Credential-gated stages (follow-up human commands)

No `.env.local` present, so these were NOT run (no credentials invented):

1. Apply migrations to dev/staging (R1, R2):
   `corepack pnpm prisma migrate dev`   (applies `weekly_planning` + `weekly_planning_rls`)
   then `corepack pnpm prisma migrate status`  (confirm in sync).
2. Planning E2E flow (R3–R9): `corepack pnpm test:e2e e2e/planning.spec.ts`
   (needs `E2E_EMPLOYEE_EMAIL`/`E2E_EMPLOYEE_PASSWORD`; assumes ≥1 print with colors).
3. RLS denial (R2, R10): `corepack pnpm test:e2e e2e/planning-rls.spec.ts`
   (needs `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).

No new env vars were introduced, so `.env.example` is unchanged.

## Files created

- `lib/planning-core.ts` (pure matcher + drying; client- and server-safe)
- `lib/services/planning.ts`, `lib/validation/planning.ts`, `actions/planning.ts`
- `app/(app)/planning/page.tsx`, `loading.tsx`, `error.tsx`
- `components/planning/`: `WeekPlanner.tsx`, `ColorPicker.tsx`, `MatchModeToggle.tsx`,
  `FilteredInventory.tsx`, `WeekGrid.tsx`, `DayColumn.tsx`, `Swatch.tsx`, `types.ts`
- `prisma/migrations/20260622130000_weekly_planning/migration.sql`
- `prisma/migrations/20260622130100_weekly_planning_rls/migration.sql`
- Tests: `lib/__tests__/planning-core.test.ts`,
  `lib/services/__tests__/planning.test.ts`, `actions/__tests__/planning.test.ts`,
  `components/planning/__tests__/WeekPlanner.test.tsx`,
  `e2e/planning.spec.ts`, `e2e/planning-rls.spec.ts`

## Files changed

- `prisma/schema.prisma` — Weekday enum + 3 models + `User.weekPlans`,
  `Color.weekPlanColors`, `Print.weekItems` back-relations.
- `app/(app)/layout.tsx` — added the `/planning` nav link.
- `specs/07_weekly_planning/tasks.md` — checked off all tasks.

## Deviations / notes

- **Pure core extracted to `lib/planning-core.ts`** (not inside the `server-only`
  service). Rationale: the spec requires the matcher to re-derive CLIENT-side on mode
  toggle with no refetch; importing a `server-only` module into a Client Component
  pulls the runtime guard. The service re-exports the core, so there is a single
  source of truth and zero duplication. This is the only structural change from the
  design's file list (design put the pure fns in `lib/services/planning.ts`).
- `removeItemSchema` added (spec listed three schemas; remove needed its own trivial
  `{ itemId }` validation to keep the action boundary Zod-validated).
- The picker color list is sourced from colors actually used by prints (deduped), so
  only relevant colors appear; this satisfies R11/R3 and avoids depending on the full
  catalog query on this page.
