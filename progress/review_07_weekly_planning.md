# Review — 07_weekly_planning (FINAL feature)

**Verdict: APPROVE.** The leader may mark `07_weekly_planning` as `done`.

Reviewer is read-only; nothing was modified. All credential-free pipeline stages
were reproduced green; credential-gated stages (migration apply, Playwright
E2E/RLS) are correctly written and documented with follow-up commands.

## Traceability (R1–R11 → test → result)

| Req | Maps to | Test(s) | Result |
|-----|---------|---------|--------|
| R1 (3 models + Weekday enum, keys/FKs) | `schema.prisma`, migration `20260622130000_weekly_planning` | service tests exercise relations/selects; typecheck + build compile against generated client | PASS |
| R2 (RLS authenticated-only) | `20260622130100_weekly_planning_rls/migration.sql` (ENABLE+FORCE, authenticated SELECT/INSERT/UPDATE/DELETE on all 3 tables) | `e2e/planning-rls.spec.ts` anon read=0 / anon INSERT writes nothing + signed-in allowed; `e2e/planning.spec.ts` signed-out redirect (credential-gated, written) | PASS (gated runtime) |
| R3 (persist colors, replace set, create plan if absent) | `setWeekColors`, `getOrCreateWeekPlan`, `snapToMonday` | service: upsert+deleteMany+createMany in 1 tx, empty-set clear, snap-to-Monday (Mon/Wed/Sun); action success; component "ColorPicker persists" | PASS |
| R4 (full match default) | `fullMatches` | planning-core: worked example returns ONLY `["p-piel"]`, excludes no-color print; component "full mode lists only fully-producible" | PASS |
| R5 (partial + missing) | `partialMatches` | planning-core: returns ONLY `p-piel-verde` missing `[verde]`, multiple-missing-in-order, excludes full/no-share; component partial badges | PASS |
| R6 (empty available ⇒ both empty + empty-state) | `length>0` guard + `some()` guard | planning-core: empty⇒both `[]`; component "empty available ⇒ both modes empty"; FilteredInventory empty-state copy | PASS |
| R7 (assign at end of day) | `assignPrintToDay` | service: position 0 when empty / max+1 when populated; action success; component "assigns via Select fallback" | PASS |
| R8 (move/remove persist) | `moveWeekItem`, `removeWeekItem` | service: update day/position, delete by id; actions move/remove; component "removing/moving calls action" | PASS |
| R9 (derived day−1 drying incl. MON edge) | `dryingSchedule`, `previousDay` | planning-core: TUE→MON, MON→PREVIOUS_WEEK, union+dedupe+sort, empty, no-color; component "dry the previous Sunday" panel | PASS |
| R10 (unauth mutation rejected, no write) | `requireUser()` first in every action | actions: each of 4 mutations "rejects unauthenticated, writes nothing"; RLS anon INSERT | PASS |
| R11 (swatches from hex) | `Swatch`/`SwatchList` | component "renders a swatch for each color" asserts rgb derived from hex; swatches in inventory/grid/dry panels | PASS |

Every R1–R11 maps to at least one real, executing test. No requirement is untested.

## Task completeness

All 12 `tasks.md` items are `[x]` and genuinely implemented (spot-checked against
code, not just checked off): schema+migration, RLS SQL, match core, persistence,
assign/move/remove, Zod schemas (+ trivial `removeItemSchema`), actions, server
page, client islands, Vitest+component+E2E+RLS specs, and the verified pipeline.

## Match-core verification (the crux) — `lib/planning-core.ts`

- `fullMatches`: `colorIds.length > 0 && every(id ∈ available)` — correctly excludes
  no-color prints and yields `[]` on empty available (R6).
- `partialMatches`: skips no-color, requires `some(∈ available)`, excludes full,
  `missingColorIds = colorIds.filter(∉ available)` — `[]` on empty available (R6).
- `dryingSchedule`: maps day D's colors into slot D−1, unions/dedupes (Set) and
  sorts; `previousDay(MON) = PREVIOUS_WEEK` handles the Monday→prior-week edge.
- **Worked example asserted** (available = {Piel, Café, Azul}): `{Piel}` → FULL
  (`fullMatches` returns exactly `["p-piel"]`); `{Piel, Verde}` → PARTIAL with
  `missingColorIds === ["verde"]`; `{Rojo Cochinilla}` → in NEITHER list. Empty
  available ⇒ both `[]`.
- **Branch coverage (reproduced, full run):** `lib/planning-core.ts` =
  **100% stmts / 100% branch / 100% funcs / 100% lines.** Hard target met.
  `lib/services/planning.ts`, `lib/validation/planning.ts`, `actions/planning.ts`
  = 100% across the board.

## Persistence / Auth / RLS / Schema / Boundary

- **Persistence:** `setWeekColors` upserts by snapped Monday then deleteMany+
  createMany inside one `db.$transaction` (atomic replace). `getOrCreateWeekPlan`
  snaps to Monday, creates if absent. `assignPrintToDay` appends at max+1 (0 when
  empty). move/remove persist. All tested with a mocked Prisma/tx.
- **Auth:** every action calls `ensureUser()` (wraps `requireUser`) FIRST and
  returns a rejection before any Zod/DB work; each mutation has an
  "unauthenticated ⇒ no write" test. `requireUser` throws `UnauthenticatedError`
  when no session — correctly caught.
- **RLS:** ENABLE + FORCE on all three tables, authenticated policies for all four
  verbs; anon matches no policy. Denial E2E asserts anon read=0 and anon INSERT
  writes nothing. Server layer is the real guard (Prisma bypasses RLS); RLS is
  defense-in-depth as documented.
- **Schema:** Weekday enum + WeekPlan (`weekStartDate @unique`, createdBy Restrict),
  WeekPlanColor (cascade from plan, color Restrict, composite PK), WeekPlanItem
  (cascade from plan, print Restrict, dayOfWeek, position, index) — all correct.
  `Print.weekItems` back-relation (06's deferred item) added. `git diff` of
  `schema.prisma` is purely additive (161 insertions, 0 deletions): nothing outside
  this feature changed.
- **Boundary:** `/planning` is a Server Component (dynamic route in the build) that
  runs matching/load server-side and passes serializable data; the client islands
  re-derive via `useMemo(fullMatches/partialMatches)` on mode/color toggle with no
  refetch. Correct.

## Deviation judgments

1. **Pure core extracted to `lib/planning-core.ts`** (vs design putting it in the
   `server-only` service): SOUND. The client island must re-derive without pulling
   the `server-only` runtime guard; the service re-exports the core, so there is a
   single source of truth and zero duplication. Approved.
2. **`removeItemSchema` added:** trivial `{ itemId }` schema keeping the remove
   action Zod-validated like the others. Justified, in-scope.
3. **Picker color list sourced from colors used by prints** (deduped): satisfies
   R11 (still renders swatches from hex) and R3 (selected ids persist). Does NOT
   break the worked example (selection is a subset of those colors) nor R6 (empty
   selection ⇒ empty available ⇒ both matchers empty ⇒ empty-state). Acceptable.

## Pipeline (reproduced, credential-free)

- `corepack pnpm typecheck` — PASS (0 errors).
- `corepack pnpm lint` — PASS (0 errors; 4 `_a` unused-arg warnings in test mocks only).
- `corepack pnpm test` (vitest --coverage) — PASS: **42 files, 423 tests passed.**
- `corepack pnpm build` — PASS; `/planning` is a dynamic (server-rendered) route.
- No new runtime dependency (dnd-kit already present since 04); no new env var, so
  `.env.example` unchanged — correct.

## Scope

Slice matches spec: Select fallback (no dnd), Monday week start with snap, shared
plan with `requireUser()` on every mutation, derived drying. No extra model, table,
route, env var, or dependency leaked in.

## Credential-gated (not run — legitimately blocked, no `.env.local`)

Documented with correct follow-ups: `corepack pnpm prisma migrate dev` then
`prisma migrate status`; `corepack pnpm test:e2e e2e/planning.spec.ts`;
`corepack pnpm test:e2e e2e/planning-rls.spec.ts`. Not a basis for rejection.
