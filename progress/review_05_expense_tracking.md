# Review — 05_expense_tracking

**Verdict: APPROVE.** Every requirement R1–R9 maps to a real test, all tasks are
genuinely done, the credential-free pipeline is green (typecheck, lint, test
296/296, build), and the credential-gated stages (migration apply, Playwright
E2E + RLS denial) are written as committed files and documented with exact
follow-up commands. Leader may mark the feature done after the gated
migration/E2E run on dev/staging.

## R1-R9 traceability

| Req | Mapped test(s) | Result |
|-----|----------------|--------|
| R1 Expense model: cost Decimal(10,2), reason, date, purchaseUrl?, supplyTypeId to SupplyType onDelete Restrict | schema.prisma + migration SQL verified; lib/services/__tests__/expenses.test.ts round-trip block, createExpense writes Prisma.Decimal | PASS |
| R2 RLS enabled, authenticated-only read/write | expenses_rls migration (ENABLE+FORCE + 4 authenticated policies); e2e/expenses-rls.spec.ts anon SELECT=0 + anon INSERT writes nothing; e2e/expenses.spec.ts signed-out redirect | PASS (E2E credential-gated, spec correct) |
| R3 create validated, cost as Decimal, insert, revalidate | actions/__tests__/expenses.test.ts creates+revalidates, cost reaches service as exact string; service test writes Prisma.Decimal from validated string; validation cost branches | PASS |
| R4 edit validated, updated, revalidated | actions test requires id and updates; ExpenseFormDialog.test.tsx prefills and submits id + updated values | PASS |
| R5 Admin delete removes row + revalidates | actions test lets an Admin delete and revalidates /expenses | PASS |
| R6 list date desc, single query, cost/reason/date/type/link-when-present | service test ordered by date desc + supplyType selected, findMany once; ExpensesTable.test.tsx renders formatted currency/reason/type/link + em-dash when absent | PASS |
| R7 non-admin deleteExpense rejected, NO write (action layer) | actions test rejects NON-admin with NO DB write or revalidate; UI secondary hides/shows on canDelete | PASS |
| R8 non-positive/>2dp cost or missing supplyTypeId field error | validation test rejects >2dp, zero, negative, non-numeric, empty cost, empty supplyTypeId (path+message); actions test rejects invalid cost no write | PASS |
| R9 present-but-invalid purchaseUrl field error; absent allowed | validation test rejects present-but-invalid URL, accepts absent/empty as undefined, accepts valid; actions test rejects invalid purchaseUrl | PASS |

Every requirement maps to at least one real test. No untested requirement.

## Task completeness (tasks.md)

All 9 items [x] and genuinely done (spot-checked against code, not just
checked): model+migration, RLS SQL, both Zod schemas, service (list/CRUD +
Decimal + catalog counter), actions (requireUser/requireAdmin + revalidate),
page + ExpensesTable + ExpenseFormDialog + loading/error + nav link, full test
matrix, RLS denial spec, green pipeline.

## Crux verifications

- Decimal precision (R1/R3): NO float coercion for storage. Form string ->
  costSchema validates against the at-most-two-decimals regex and keeps a
  normalized STRING (the only Number() use is a <= 0 guard to reject zero, never
  the stored value) -> service writes new Prisma.Decimal(input.cost). Column is
  Decimal @db.Decimal(10,2). Round-trip test proves 2-dp + trailing-zero
  preservation (0.10 stays 0.10) and guards the float trap (0.1+0.2 != 0.3 vs
  Decimal sum === 0.3). Schema rejects >2dp and non-positive cost.
- Validation (R8/R9): rejects non-positive/>2dp cost and empty supplyTypeId with
  correct field path; present-but-invalid purchaseUrl rejected, absent/empty
  allowed (undefined). Tested both ways at schema and action layers.
- Auth (R5/R7): create/edit call requireUser(), delete calls requireAdmin(), all
  BEFORE any validation/DB work; rejected caller returns typed failure with no
  service call and no revalidate (asserted). Non-admin delete rejection tested at
  the ACTION layer. lib/auth.ts uses a per-request Supabase client via
  createClient() and getUser() (token re-validated).
- List (R6): listExpenses orders by date desc, includes supplyType via a single
  findMany select (no N+1, asserted once). Table renders formatted cost, date,
  type, and link only when present.
- Catalog delete-guard wiring: lib/services/expenses.ts registers a supplyType
  reference counter (db.expense.count by supplyTypeId) with the 02 registry at
  module load, mirroring 03 taskCategory. SOUND: even if the counter module is
  not loaded in the catalog-delete bundle, actions/catalogs.deleteCatalog has a
  DB Restrict (P2003) backstop mapped to the same in-use message, so an in-use
  SupplyType can never be deleted. Two-layer guarantee.
- RLS (R2): expenses_rls ENABLEs+FORCEs RLS, grants S/I/U/D to authenticated;
  denial E2E uses an anon client, asserts anon read 0 rows and anon insert writes
  nothing. Gate decision honored (Admin-only delete is the app-layer rule).
- Boundary: ExpensesTable is a Server Component; interactivity isolated to client
  islands (ExpenseFormDialog, DeleteExpenseButton). page.tsx is a Server
  Component with a clean Promise.all fetch. Build emits /expenses as dynamic.

## Deviation judgments

- Centralized lib/format.ts (Intl.NumberFormat es-MX, MXN): ACCEPTABLE/good --
  single source for currency, display-only, fed the Decimal toString (never a
  stored float), matches the MXN gate decision; 100% covered.
- DeleteExpenseButton as its own client island so the table stays a Server
  Component: ACCEPTABLE -- satisfies the design ExpensesTable (server) boundary;
  delete needs useActionState, so isolating it is the correct minimal client
  surface.

Both conform to docs/conventions.md (Server-by-default, use client only where
needed, kebab-case modules, no any, no console.log).

## Pipeline reproduced (corepack pnpm, credential-free)

- typecheck (tsc --noEmit): PASS, 0 errors.
- lint (next lint): PASS, 0 warnings/errors.
- test (vitest run --coverage): PASS, 296/296 tests across 32 files. Changed-module
  coverage: lib/format.ts 100%, lib/services/expenses.ts 100%,
  lib/validation/expense.ts 100% lines (88.8% branches, defensive fallbacks),
  components/expenses 92.7% aggregate -- all above the >=80% target.
- build (next build): PASS; /expenses dynamic route emitted.

## Scope and dependencies

No package.json or .env.example change (no new runtime dependency or env var).
Schema adds only Expense (+ SupplyType back-relation). Routes add only /expenses.
Nothing leaked beyond spec.

## Credential-gated (do NOT block approval -- files verified correct)

- Apply migrations on dev/staging only: corepack pnpm prisma migrate dev then
  corepack pnpm prisma migrate status (NEVER production).
- E2E: corepack pnpm test:e2e with .env.local + seeded E2E_ADMIN_*/E2E_EMPLOYEE_*
  and Supabase URL/publishable key (e2e/expenses.spec.ts, e2e/expenses-rls.spec.ts;
  both skip when vars absent).
