# Review - 02_catalog_management

Verdict: APPROVE
Reviewer: reviewer subagent. Date: 2026-06-22

The feature is implemented to spec, all R1-R8 trace to real passing tests, the
credential-free pipeline is green, and the credential-gated stages (live
migrations/seed, Playwright E2E, RLS-denial) are correctly authored and
documented. The leader may mark 02_catalog_management as done.

Reviewer ran every stage independently with corepack pnpm (bare pnpm is not on
PATH; init.sh hard-requires it, so stages were run individually - an accepted
environment constraint, not a defect).

---

## R1-R8 traceability

| Req | Maps to | Test(s) | Result |
|-----|---------|---------|--------|
| R1 four models, unique name | schema.prisma (Color+hex); catalogs migration (4 tables + unique name indexes) | lib/services/__tests__/catalogs.test.ts (delegate routing per catalog); prisma generate succeeds | PASS |
| R2 RLS auth-read/admin-write | catalogs_rls migration: ENABLE+FORCE on all four; SELECT TO authenticated USING(true); INS/UPD/DEL via public.is_admin() | e2e/catalogs-rls.spec.ts (credential-gated); server-layer equiv in R7 action tests | PASS (spec correct; gated run pending) |
| R3 idempotent seed, exact values | prisma/seed.ts upsert keyed on name | prisma/__tests__/seed.test.ts: exactly 6/4/3, named colors with valid hex, idempotent 2nd run (12/8/6 calls) | PASS |
| R4 validate+persist+revalidate | actions/catalogs.ts create/update to Zod to service to revalidatePath | actions tests creates-color-and-revalidates / updates-and-revalidates; UI CatalogTable.test submits to create/updateCatalog | PASS |
| R5 duplicate name to field error, no write | unique index to P2002 mapped to name field error (create+update) | actions tests maps-P2002 / maps-P2002-on-rename; empty-name reject in catalog.test + action; UI shows-a-name-field-error | PASS |
| R6 delete-in-use blocked (pre-check + DB Restrict) | deleteCatalog runs isCatalogValueInUse then maps P2003 to same message | actions tests blocks / deletes-free / P2003-backstop; service both ways; UI renders-the-in-use-block-message | PASS |
| R7 non-admin mutation rejected, no write | requireAdmin() FIRST (ensureAdmin before any parse/DB) | actions tests: non-admin create/update/delete assert NO service call + NO revalidate; e2e employee-403 + signed-out redirect | PASS |
| R8 color hex as swatch | CatalogTable color tab aria-hidden swatch from hex + hex string; dialog hex input | CatalogTable.test renders-a-swatch / includes-a-hex-input; catalog.test hex-regex; CatalogTabs keyboard | PASS |

Every requirement has at least one real, behavior-asserting test. No untested
requirement found.

---

## Task completeness (tasks.md)

All 11 items are checked and genuinely done (spot-checked against code, not just
ticked): models + migration, RLS SQL (all four), idempotent seed, colorSchema
(hex regex) + nameOnlySchema, generic service CRUD + isCatalogValueInUse, actions
(requireAdmin-first, P2002 to field error), page + CatalogTabs + CatalogTable
(swatch), delete-guard wired in action+UI, Vitest/component/E2E tests, RLS-denial
spec, and the verify-build/typecheck/lint/coverage task - all confirmed.

---

## Seed idempotency (R3)

- seed.ts upserts keyed on the unique name for every row: colors update hex,
  name-only catalogs update {} - so a 2nd run inserts nothing and only refreshes
  color hexes. Genuinely idempotent.
- Seeds exactly the brief values: 6 colors (each valid #RRGGBB), 4 task
  categories (Printer maintenance, Design creation, Purchases, Customer
  follow-up), 3 print types (keychain, frame, deckbox). No SupplyType seed -
  correct, the brief lists none.
- The idempotency unit test proves no duplicates: two seedCatalogs(client) runs
  produce 12/8/6 upsert calls with identical args, asserting every call is an
  upsert keyed on name. Sound proof at the call-contract level.

## Delete-guard (R6)

- Both layers present. (1) deleteCatalog calls isCatalogValueInUse before any
  write and rejects in-use values. (2) DB backstop: a slipped-through FK raises
  P2003, mapped to the same friendly message. The onDelete: Restrict convention
  is documented in the schema for later features (no FK exists yet to attach -
  correct for this scope).
- Tested both ways: action tests cover in-use (blocked, no delete, no
  revalidate), free (deletes + revalidates), and the P2003 backstop; service
  tests cover false (no counters / all-zero), true (any counter > 0), per-catalog
  isolation, and id pass-through.
- CatalogReferenceCounter registry - sound. Per-catalog Record<CatalogKey,
  counter[]> summed in parallel with short-circuit on the first positive count.
  With no referencing models today every list is empty, so isCatalogValueInUse
  correctly returns false for all four (test-verified). Later features plug in via
  registerCatalogReference(...) + their own onDelete: Restrict FK migration; the
  documented pattern is correct and the DB Restrict is the hard guarantee landing
  table-by-table. A test-only reset keeps suites isolated. Code-only hook, zero
  schema footprint.

---

## Security / RLS

- Every mutation calls requireAdmin() FIRST via ensureAdmin(), before any catalog
  parse or DB work; on rejection it returns a typed result and makes NO write -
  asserted in the non-admin create/update/delete tests (service + revalidate never
  called). Both Forbidden (Not authorized) and Unauthenticated (Not authenticated)
  paths handled.
- Reads allowed to any authenticated user: the page calls requireAdmin (admin UI),
  RLS SELECT open to authenticated so later domain forms can read - matches spec.
- Per-request Supabase client: requireAdmin to requireUser to getCurrentUser uses
  createClient() (per-request) and getUser() (re-validates token), consistent w/ 01.
- RLS migration correct: ENABLE+FORCE on all four; SELECT to authenticated
  USING(true); INSERT WITH CHECK(is_admin()); UPDATE USING+WITH CHECK(is_admin());
  DELETE USING(is_admin()). Reuses the 01 public.is_admin() SECURITY DEFINER
  predicate (no new function, no recursion). Migration ordering (...093100 after
  the 01 ...192812 user_rls) resolves the dependency.

## Validation

- colorSchema hex regex is exactly /^#[0-9a-fA-F]{6}$/; name trimmed + min(1).
  nameOnlySchema name trimmed + min(1). schemaForCatalog returns colorSchema for
  color, nameOnly for the rest.
- Duplicate name to P2002 to { field: name, message: That name is already in use }
  with no write/revalidate, on both create and update.
- Empty/whitespace name rejected pre-DB (action returns a name field error, no
  service call).

---

## Deviation judgments

1. Admin route at app/admin/catalogs/ (not app/(app)/admin/catalogs/). ACCEPTABLE.
   Matches the existing 01 app/admin/ layout that owns the 403 guard + nav; URL
   /admin/catalogs unchanged. Consistency with the shipped sibling outweighs the
   spec illustrative path; no convention violated.
2. Native ARIA tabs instead of shadcn/Radix Tabs. ACCEPTABLE. @radix-ui/react-tabs
   is not in package.json; conventions forbid adding a dependency not in an
   approved spec. The native impl is fully keyboard-operable (roving tabindex,
   Arrow/Home/End, role tablist/tab/tabpanel, aria-selected/controls/labelledby)
   and is test-covered.
3. Seed via node prisma/seed.ts gated by PRISMA_SEED_RUN (Node 24 native TS), no
   tsx/ts-node. ACCEPTABLE. Avoids a new dependency; Node v24.14 confirmed here
   runs TS natively. The env gate prevents a DB connection when imported by tests,
   and data/logic are exported for unit testing. PRISMA_SEED_RUN is an internal
   command flag, not a user secret, so .env.example rightly needs no change.
4. package.json#prisma seed-config deprecation warning. ACCEPTABLE. Reproduced on
   prisma generate; non-fatal and valid in the repo Prisma 6. Flagged for a future
   prisma.config.ts migration if the team moves to Prisma 7 - not a blocker.

All four deviations are acceptable; none is rejection-worthy under conventions.

---

## Scope discipline

Clean. schema.prisma contains only the 01 Role enum + User and the four catalog
models - no extra tables, no FKs from later features, no enums. No new runtime
dependency, no new env var, no new route beyond /admin/catalogs. The forward
counter registry is code-only with no schema footprint. Nothing from 03/05/06/07
leaked in.

## Hygiene

No console.log/debug code, no any/as-any/ts-ignore in any new file. .env.example
correctly committed (gitignore excludes .env* but not the example template).

---

## Pipeline (reproduced independently with corepack pnpm)

| Stage | Command | Result |
|-------|---------|--------|
| Prisma generate | corepack pnpm prisma generate | OK (client v6.19.3; deprecation warning only) |
| Typecheck | corepack pnpm typecheck | OK - 0 errors |
| Lint | corepack pnpm lint | OK - no warnings/errors |
| Test + coverage | corepack pnpm test | OK - 121 passed / 15 files |
| Build | corepack pnpm build | OK - /admin/catalogs builds as a dynamic route; no Server/Client boundary errors |

Coverage on changed modules:
- lib/services/catalogs.ts - 100% stmts/branch/funcs/lines
- lib/validation/catalog.ts - 100% all
- components/catalogs/CatalogTabs.tsx - 100% all
- components/catalogs/CatalogTable.tsx - 97.66% lines / 91.37% branch (only the
  hex-error display branch in the dialog is uncovered)

Meets the tasks.md target (services + schemas branch-complete; delete-guard tested
in-use + free). actions/catalogs.ts and prisma/seed.ts sit outside the vitest
coverage include (lib/**, components/**) but are exhaustively behavior-tested.

## Credential-gated stages (verified as authored; NOT executed - no .env.local)

Files exist and are correct: the two migrations (4 tables + unique indexes; RLS on
all four), prisma/seed.ts (idempotent, exact values), e2e/catalogs.spec.ts (admin
CRUD, swatch, duplicate rejected, employee 403, signed-out redirect), and
e2e/catalogs-rls.spec.ts (employee read-ok / write-denied via PostgREST) - both
test.skip when env is unset.

Human follow-up (dev/staging only, never production):
1. corepack pnpm prisma migrate deploy   (or migrate dev --name catalogs)
2. corepack pnpm prisma migrate status    (confirm in sync)
3. corepack pnpm prisma db seed           (runs PRISMA_SEED_RUN=1 node prisma/seed.ts)
4. corepack pnpm build && corepack pnpm test:e2e   (with E2E_* + Supabase env set)

These are legitimately credential-gated and not grounds for rejection.
