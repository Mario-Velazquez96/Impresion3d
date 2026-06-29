# Implementation progress — 05_expense_tracking

Status: implementation complete; all credential-free verification stages green.
Awaiting reviewer approval. Migration apply + Playwright E2E are credential-gated
(no `.env.local` present) — flagged below with exact follow-up commands.

## Tasks completed (tasks.md — all [x])

1. `Expense` model added (Decimal cost, date, purchaseUrl, supplyType Restrict)
   + back-relation on `SupplyType`; `expenses` migration written.
2. RLS SQL migration on `Expense` (authenticated read/write).
3. Zod `createExpenseSchema` / `updateExpenseSchema` (positive 2-dp cost, URL,
   required supplyType).
4. `lib/services/expenses.ts` (list desc by date + supplyType include; create/
   update/delete; Decimal handling; catalog reference counter registered).
5. `actions/expenses.ts` (requireUser create/edit; requireAdmin delete) +
   `revalidatePath('/expenses')`.
6. `expenses/page.tsx` + `<ExpensesTable>` (formatted) + `<ExpenseFormDialog>` +
   `loading.tsx` + `error.tsx` + `/expenses` nav link.
7. Vitest (schema, Decimal round-trip), component (form create+edit + field
   error, table rendering), E2E (record→list, edit, admin delete, employee no
   delete control).
8. RLS denial test (unauthenticated read/write rejected).
9. typecheck + lint + test (coverage) + build all pass.

## Requirement traceability (R1–R9)

- **R1** — `Expense` model `cost Decimal @db.Decimal(10,2)`, `reason`, `date`,
  `purchaseUrl?`, `supplyType` (`onDelete: Restrict`) + `supplyTypeId`,
  timestamps, `@@index([date])` + `@@index([supplyTypeId])`.
  - prisma/schema.prisma; prisma/migrations/20260622110000_expenses/migration.sql.
  - Tests: lib/services/__tests__/expenses.test.ts (Decimal round-trip block,
    "preserves the value the service stores").
- **R2** — `Expense` RLS enabled + forced; authenticated read/write; anon denied.
  - prisma/migrations/20260622110100_expenses_rls/migration.sql.
  - Test: e2e/expenses-rls.spec.ts ("RLS denies the unauthenticated path on
    expenses") + the (app) layout redirect test e2e/expenses.spec.ts
    ("signed-out access to /expenses redirects to /login"). CREDENTIAL-GATED.
- **R3** — create validated with `createExpenseSchema`, cost stored as Decimal,
  inserted, `/expenses` revalidated.
  - lib/validation/expense.ts; lib/services/expenses.ts (createExpense);
    actions/expenses.ts (createExpenseAction).
  - Tests: actions/__tests__/expenses.test.ts ("creates a valid expense and
    revalidates /expenses"); lib/services/__tests__/expenses.test.ts
    ("writes cost as a Prisma.Decimal built from the validated string").
- **R4** — edit validated + updated + revalidated.
  - updateExpenseSchema / updateExpense / updateExpenseAction.
  - Tests: actions/__tests__/expenses.test.ts ("requires the id and updates a
    valid expense"); components/expenses/__tests__/ExpenseFormDialog.test.tsx
    ("prefills fields and submits the id + updated values").
- **R5** — Admin delete removes the row + revalidates.
  - deleteExpense / deleteExpenseAction (requireAdmin).
  - Test: actions/__tests__/expenses.test.ts ("lets an Admin delete and
    revalidates /expenses").
- **R6** — list ordered by `date` desc, showing cost, reason, date, supply type,
  link when present.
  - lib/services/expenses.ts (listExpenses orderBy date desc, single query);
    components/expenses/ExpensesTable.tsx.
  - Tests: lib/services/__tests__/expenses.test.ts ("queries ordered by date
    desc and includes the supply type"); components/expenses/__tests__/
    ExpensesTable.test.tsx ("renders formatted currency, reason, supply type,
    and a purchase link").
- **R7** — non-admin delete rejected with NO DB write.
  - actions/expenses.ts (ensureAdmin before any work); ExpensesTable gates the
    delete control on `canDelete` (viewer role).
  - Tests: actions/__tests__/expenses.test.ts ("rejects a NON-admin (employee)
    with NO DB write or revalidate"); components/expenses/__tests__/
    ExpensesTable.test.tsx ("hides the Delete control for a non-admin viewer").
- **R8** — non-positive cost / missing-invalid supplyTypeId → field error.
  - lib/validation/expense.ts (costSchema, idSchema).
  - Tests: lib/validation/__tests__/expense.test.ts (rejects >2dp, zero,
    negative, non-numeric, empty cost; rejects empty supplyTypeId);
    actions/__tests__/expenses.test.ts ("rejects an invalid cost with a field
    error, no write").
- **R9** — present-but-invalid purchaseUrl → field error.
  - lib/validation/expense.ts (purchaseUrlSchema).
  - Tests: lib/validation/__tests__/expense.test.ts ("rejects a present-but-
    invalid URL with a field error"); actions/__tests__/expenses.test.ts
    ("rejects a present-but-invalid purchaseUrl with a field error").

## Pipeline results (credential-free, `corepack pnpm`)

- `prisma generate` — OK (client regenerated with the Expense model).
- `typecheck` (`tsc --noEmit`) — PASS, 0 errors.
- `lint` (`next lint`) — PASS, 0 warnings/errors.
- `test` (`vitest run --coverage`) — PASS, 296/296 tests, 32 files.
  Coverage on changed modules:
  - lib/format.ts — 100% lines.
  - lib/services/expenses.ts — 100% lines.
  - lib/validation/expense.ts — 100% lines (88.8% branches; the 3 uncovered
    branch points are defensive `??`/instanceof fallbacks).
  - components/expenses/ — 92.7% lines aggregate (Dialog 89.9, Table 100,
    DeleteButton 85.7) — above the ≥80% target.
- `build` (`next build`) — PASS; `/expenses` emitted as a dynamic route.

## Credential-gated stages (NO `.env.local` present — DO NOT invent credentials)

The `expenses` + `expenses_rls` migrations are written as committed SQL but were
NOT applied (no dev/staging connection). Apply against dev/staging only:

- Apply migrations + confirm in sync:
  `corepack pnpm prisma migrate dev` (dev/staging) then
  `corepack pnpm prisma migrate status`.
  (The hand-written SQL matches the schema; run on a dev/staging DB. NEVER
  production.)
- E2E (needs `.env.local` + seeded E2E_ADMIN_* / E2E_EMPLOYEE_* and a seeded
  SupplyType; the spec self-creates one via the catalogs UI):
  `corepack pnpm test:e2e` — e2e/expenses.spec.ts (record→top of list, edit,
  admin delete, employee sees no delete control) and e2e/expenses-rls.spec.ts
  (anon read/write denied; signed-in employee read allowed). The specs SKIP when
  the vars are absent.

## Files created

- prisma/migrations/20260622110000_expenses/migration.sql
- prisma/migrations/20260622110100_expenses_rls/migration.sql
- lib/format.ts
- lib/validation/expense.ts
- lib/services/expenses.ts
- actions/expenses.ts
- components/expenses/ExpenseFormDialog.tsx
- components/expenses/ExpensesTable.tsx
- components/expenses/DeleteExpenseButton.tsx
- app/(app)/expenses/page.tsx
- app/(app)/expenses/loading.tsx
- app/(app)/expenses/error.tsx
- lib/__tests__/format.test.ts
- lib/validation/__tests__/expense.test.ts
- lib/services/__tests__/expenses.test.ts
- actions/__tests__/expenses.test.ts
- components/expenses/__tests__/ExpenseFormDialog.test.tsx
- components/expenses/__tests__/ExpensesTable.test.tsx
- e2e/expenses.spec.ts
- e2e/expenses-rls.spec.ts

## Files changed

- prisma/schema.prisma (Expense model + SupplyType `expenses` back-relation).
- app/(app)/layout.tsx (added the `/expenses` nav link).
- specs/05_expense_tracking/tasks.md (all items checked).

## Deviations / decisions

- **2-dp Decimal precision** is enforced at TWO layers and never touches a JS
  float for storage:
  1. Validation (lib/validation/expense.ts): `cost` is validated by the regex
     `^\d+(\.\d{1,2})?$` (positive, at most two decimals) and kept as a
     normalized STRING — there is no `parseFloat`/`Number` coercion of the stored
     value (a single `Number(value) <= 0` check is used only to reject zero, not
     to store).
  2. Service (lib/services/expenses.ts): writes
     `cost: new Prisma.Decimal(input.cost)` directly from that string.
  The round-trip is asserted in lib/services/__tests__/expenses.test.ts
  ("cost Decimal round-trip" describe), including the classic float trap
  (`0.1 + 0.2 !== 0.3`) vs. `Prisma.Decimal("0.10").plus("0.20") === "0.3"`, and
  trailing-zero preservation ("0.10" → "0.10").
- **Currency formatter** lives in ONE place — lib/format.ts `formatCurrency()` —
  using `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`.
  Changing the currency is a one-line edit there. The page passes the Prisma
  Decimal's `.toString()` (not a float) into it.
- **Delete gating** is defense-in-depth: the server action enforces
  `requireAdmin()` (the real guard, R7), and the server `ExpensesTable`
  additionally hides the Delete control for non-admin viewers. Expense RLS keeps
  the Supabase delete path open to any authenticated user as documented in the
  RLS migration (the Admin-only constraint is an application-layer product rule,
  not an RLS rule), matching the spec's gate decision.
- **DeleteExpenseButton** was split into its own Client island (delete needs
  `useActionState`), so `ExpensesTable` can stay a Server Component per the
  design's "ExpensesTable (server)" boundary.
- No new dependencies, env vars, models beyond `Expense`, or routes beyond
  `/expenses` were introduced. `.env.example` needed no change.
