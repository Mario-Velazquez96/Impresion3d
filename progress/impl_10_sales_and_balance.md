# Implementation — 10_sales_and_balance

**Status:** implementation complete, awaiting review (NOT marked `done`).
**Date:** 2026-07-16

Sales ledger + withdrawals ledger + a DERIVED account balance on `/finances`.
Balance = `sum(Sale.amount) − sum(Withdrawal.amount)`; expenses deliberately
excluded; money never touches a JS float.

## Tasks

All tasks in `specs/10_sales_and_balance/tasks.md` are complete and marked `[x]`
(18 implementation, 29 test/verification — 47 total).

## The three invariants — how each is held

1. **The balance is DERIVED, never stored.** No balance/total/cache column exists
   in `prisma/schema.prisma` (`grep -iE "balance|running.?total|cached"` matches
   comments only, never a field). `getBalanceSummary()` runs two `_sum`
   aggregates on every read. No code path writes a balance value.
2. **Expenses are EXCLUDED, deliberately.** `lib/services/finances.ts` never
   references `db.expense` — asserted by a test that fails if
   `expense.aggregate/findMany/count` is touched. The exclusion is restated in
   the schema block comment, the migration header, the service header, the core
   header, and rendered as the R4 label on the page.
3. **No JS float in the money path.** `Decimal(10,2)` in Postgres → `_sum` in
   Postgres → `.toString()` → integer cents in `lib/finances-core.ts` →
   `formatCurrency` once at the display edge. Every `toNumber(`/`parseFloat`
   match in the feature is **prose inside a comment**, never a call — the service
   test proves it with a Decimal stub whose `toNumber()` throws.

## Files created / changed

**Created**

- `prisma/migrations/20260716120000_sales_and_withdrawals/migration.sql`
- `prisma/migrations/20260716120100_sales_and_withdrawals_rls/migration.sql`
- `lib/finances-core.ts` — the PURE core (no imports at all).
- `lib/validation/finance.ts` — client-importable Zod schemas.
- `lib/services/print-references.ts` — the parallel Print reference registry.
- `lib/services/finances.ts` — `server-only`, `_sum` aggregates.
- `actions/sales.ts`, `actions/withdrawals.ts` — Server Actions.
- `components/finances/` — `types.ts`, `BalanceCard.tsx` (Server),
  `SalesTable.tsx`, `WithdrawalsTable.tsx`, `SaleFormDialog.tsx`,
  `WithdrawalFormDialog.tsx`, `DeleteSaleButton.tsx`,
  `DeleteWithdrawalButton.tsx` (Client islands).
- `app/(app)/finances/{page,loading,error}.tsx`.
- Tests: `lib/__tests__/finances-core.test.ts` (92),
  `lib/services/__tests__/finances.test.ts` (22),
  `lib/services/__tests__/print-references.test.ts` (6),
  `lib/validation/__tests__/finance.test.ts` (40),
  `actions/__tests__/sales.test.ts` (23),
  `actions/__tests__/withdrawals.test.ts` (22),
  `components/finances/__tests__/` — BalanceCard (12), SalesTable (8),
  WithdrawalsTable (7), SaleFormDialog (9), WithdrawalFormDialog (7),
  DeleteButtons (6).
- `e2e/finances.spec.ts`, `e2e/finances-rls.spec.ts` (credential-gated).

**Changed** (only two pre-existing features touched, both sanctioned by the spec)

- `prisma/schema.prisma` — `Sale` + `Withdrawal` models, the block comment, and
  the `Print.sales` / `User.withdrawals` back-relations.
- `actions/prints.ts` — **the one existing-feature behaviour change**, additive
  only: an `isPrintInUse(id)` pre-check after `ensureAdmin`, plus mapping a thrown
  `P2003` to the same message. See "Deviations" for the swallowed-error note.
- `actions/__tests__/prints.test.ts` — extended (existing tests unweakened;
  `isPrintInUseMock` defaults to `false` in `beforeEach` so prior cases behave
  exactly as before).
- `components/layout/MainNav.tsx` — `Finances` link **outside** `showAdmin`.
- `components/layout/__tests__/MainNav.test.tsx` — extended.

`package.json`, `pnpm-lock.yaml`, and `.env.example` are **untouched**
(`git status --porcelain` on those paths is empty): no new dependency, no new env
var. No `console.log`, no `any`.

## Requirements → how satisfied + covering test

| R | How satisfied | Covering test |
|---|---|---|
| **R1** | `app/(app)/finances/page.tsx` in the authenticated `(app)` group, `requireUser()` only — **no** `requireAdmin`. Nav link outside `showAdmin`. | `MainNav.test.tsx` › "renders the Finances link when showAdmin is false/true"; `e2e/finances.spec.ts` › signed-out redirect + "an EMPLOYEE sees the nav link, the balance and both ledgers" |
| **R2** | `computeBalance` = sales − withdrawals, re-derived per read from two `_sum` aggregates. No balance column anywhere. | `finances-core.test.ts` › "THE worked example" (135025/85025/50000 → `"500.00"`); `finances.test.ts` › "sums BOTH ledgers with Prisma `_sum`" + "does NOT fetch rows and sum them in JS"; `BalanceCard.test.tsx` › worked example; E2E worked example |
| **R3** | The service never queries `Expense`; page never imports it. | `finances.test.ts` › "**NEVER touches db.expense**" + "reads exactly two tables"; E2E › "a $2,000 expense changes NOTHING" (records + deletes an expense, balance unmoved) |
| **R4** | `BalanceCard` renders "Sales minus withdrawals — does not include expenses" as real text beside the figure. | `BalanceCard.test.tsx` › "renders … as real text", "renders the label adjacent to the figure", "renders the label even when the ledgers are empty"; E2E asserts it visible |
| **R5** | `_sum` NULL → `?? null` → `computeBalance` treats as 0 → `"0.00"`. | `finances-core.test.ts` › "empty ledgers → $0.00" (null/undefined/`""`, asserts no NaN, `$0.00`); `finances.test.ts` › "a null `_sum` from BOTH aggregates yields $0.00"; `BalanceCard.test.tsx` › "renders $0.00 and never 'NaN'" |
| **R6** | `computeBalance` sanitizes inputs but **never clamps the result**; `isNegative` drives a destructive class + a "Negative balance" text marker. | `finances-core.test.ts` › "a negative balance is returned AS-IS" (`-15050`/`"-150.50"`, **not** clamped, **not** absolute, `fromCents(-5)`→`"-0.05"`, `computeBalance("0","0.01")`→`"-0.01"`); `finances.test.ts` › negative summary; `BalanceCard.test.tsx` › "renders -$150.50 exactly", destructive style, "announces the negative state textually" |
| **R7** | Decimal(10,2) → `_sum` → `.toString()` → integer cents → `formatCurrency` once. String-part arithmetic, never `value * 100`. | `finances-core.test.ts` › "exact decimal precision — no float drift" (`sumAmountCents(["0.10","0.20"])===30`, `fromCents(30)==="0.30"` and `!== "0.30000000000000004"`, documents `0.1+0.2 !== 0.3`; `toCents("0.29")===29`; 100×`"0.07"`→`"7.00"`; the 4 sales rows → `135025`/`"1350.25"`); `finances.test.ts` › "**NEVER calls .toNumber()**" (Decimal stub throws) + `createSale` builds `Prisma.Decimal` from the string |
| **R8** | `Sale.printId` required FK; `printIdSchema` non-empty; P2003 → friendly `printId` field error. | `sales.test.ts` › missing/blank printId → field error + `expect(createSale).not.toHaveBeenCalled()`; "maps an UNKNOWN printId (P2003) to a friendly field error, no partial write"; `finance.test.ts` › "rejects a missing/blank/whitespace printId"; `SaleFormDialog.test.tsx` › select required + lists inventory + printId error surfaces |
| **R9** | `Sale.printId` `onDelete: Restrict` (hard) + `registerPrintReference` counter + pre-check in `deletePrintAction` (friendly), both returning the same message. | `finances.test.ts` › "registers a print reference counter at import time" + "counts sales by printId"; `print-references.test.ts` (6 tests); `prints.test.ts` › "the pre-check blocks an in-use print BEFORE attempting the delete" (`deletePrint` **not** called) + "the P2003 BACKSTOP maps to the SAME message"; E2E › "a print with a sale cannot be deleted" |
| **R10** | `createSaleAction` → `requireUser`; `deleteSaleAction` → `requireAdmin`. | `sales.test.ts` › "lets an EMPLOYEE record a sale", "uses requireUser (NOT requireAdmin)"; "rejects a NON-ADMIN … and NO delete" (`expect(deleteSale).not.toHaveBeenCalled()`), admin succeeds; `SalesTable.test.tsx` › canDelete gating; E2E employee records a sale |
| **R11** | `createWithdrawalAction` → `requireAdmin()` **first**, before Zod. | `withdrawals.test.ts` › "rejects a NON-ADMIN … and NO write"; "**rejects the non-admin BEFORE validation** — an also-invalid payload STILL says 'Not authorized'" (asserts no `fieldErrors`); `WithdrawalFormDialog.test.tsx` › "Not authorized" surfaces as an alert |
| **R12** | `deleteWithdrawalAction` → `requireAdmin()` first. | `withdrawals.test.ts` › "rejects a NON-ADMIN … NO delete" (`expect(deleteWithdrawal).not.toHaveBeenCalled()`), admin succeeds + revalidates `/finances`; `DeleteButtons.test.tsx` › rejection surfaces |
| **R13** | Auth resolution is the first statement in all four actions. | `sales.test.ts` › "unauthenticated ⇒ NOTHING happens" (both actions, no service call, no revalidate, + "rejects BEFORE validation"); `withdrawals.test.ts` › same for both actions |
| **R14** | Zod rejects at the boundary; `sanitizeAmountCents` clamps independently. | `finances-core.test.ts` › "sanitize/clamp" (14 cases: `""`/null/undefined/`"abc"`/NaN/±Infinity/`"1.234"`/`"-5"`/`-5`/`"0"`… each → 0, never NaN; "a negative row NEVER reduces a total"); `finance.test.ts` › 14 rejection cases; `sales.test.ts` + `withdrawals.test.ts` › `-5`/`0`/`""`/`abc`/`1.234`/`NaN` each → amount field error with no write |
| **R15** | `Withdrawal.recordedBy` required FK; the id comes from `requireAdmin()`'s return, passed as the service's **second argument**; schema has no `recordedById`. | `withdrawals.test.ts` › "passes user.id from requireAdmin() as recordedById" + "**IGNORES a recordedById planted in the FormData**"; `finances.test.ts` › "writes recordedById from the caller's actor" + "IGNORES any recordedById smuggled into the input"; `finance.test.ts` › "STRIPS a recordedById planted in the payload"; `WithdrawalsTable.test.tsx` › shows who recorded it; `WithdrawalFormDialog.test.tsx` › "renders NO recordedBy input" |
| **R16** | `20260716120100_sales_and_withdrawals_rls/migration.sql` — ENABLE + FORCE + 4 policies `TO authenticated` on both tables; header states Prisma bypasses RLS and Admin-only lives in `actions/`. | `e2e/finances-rls.spec.ts` › anon SELECT on `Sale`/`Withdrawal` returns zero rows, anon INSERT writes nothing; signed-in employee CAN read both |
| **R17** | `listSales`/`listWithdrawals`: `orderBy: { date: "desc" }` + relation `select`ed in one query. | `finances.test.ts` › "queries ordered by date desc and includes the print / the recording user"; `SalesTable.test.tsx` + `WithdrawalsTable.test.tsx` › "preserves the service's date-DESCENDING order" + empty states |

## Coverage — actual numbers

- **`lib/finances-core.ts`: 100% statements / 100% BRANCH / 100% functions /
  100% lines** — the spec's explicit target is **met**.
- `lib/services/finances.ts`: **100%** across the board.
- `lib/services/print-references.ts`: **100%** across the board.
- `lib/validation/finance.ts`: **100%** across the board.
- `components/finances/`: 96.33% lines, 92.92% branch (BalanceCard, both delete
  buttons 100%; SalesTable/WithdrawalsTable 100% lines; the two dialogs 92.68% /
  93.61% lines) — all well above the ≥ 80% target. `types.ts` reports 0% as a
  type-only module with no runtime code.
- `components/layout/MainNav.tsx`: 100%.

## Pipeline

Run with `corepack pnpm` (bare `pnpm` is not on PATH):

- `corepack pnpm typecheck` → **pass**, 0 errors.
- `corepack pnpm lint` → **pass**, 0 errors. (4 pre-existing `_a is defined but
  never used` warnings in `components/planning/__tests__/WeekPlanner.test.tsx` —
  unrelated, not introduced here.)
- `corepack pnpm test` (with coverage) → **pass**, **57 test files / 761 tests**,
  0 failures. 254 of those are new for this feature; the pre-existing suites
  (including `actions/__tests__/prints.test.ts`) still pass unmodified in intent.
- **`pnpm build` intentionally SKIPPED** (hard rule): a dev server is running and
  shares `.next`; a build corrupts its CSS chunks. Typecheck covers the
  compile-level risk; the **Vercel preview** is the build target.
- E2E not run here: `e2e/finances.spec.ts` and `e2e/finances-rls.spec.ts` are
  credential-gated and skip without the `E2E_*` / Supabase vars. The signed-out
  redirect test needs no account.

## Migrations — GENERATED, NOT APPLIED

Both SQL files are written but **not run against any database** — the leader
applies them to dev/staging.

- `prisma migrate dev --create-only` could not reach the DB (**P1012**:
  `Environment variable not found: DIRECT_URL`), as anticipated. Both migrations
  are therefore **hand-written** to match Prisma's output format and the repo's
  existing files (the `08_task_priority` precedent): `20260622110000_expenses` for
  the table/FK/index shape, `20260622110100_expenses_rls` for the RLS file.
- `corepack pnpm prisma generate` **succeeded** (no EPERM this run), so the new
  `sale` / `withdrawal` delegates are typed and `typecheck` genuinely validates
  them.
- `prisma migrate status` was **not** run (same missing `DIRECT_URL`). The leader
  should confirm it is in sync after applying.

## Deviations / notes

- **None from the spec.** The approved parallel-registry decision is implemented
  as specified: `lib/services/print-references.ts` mirrors the catalog registry;
  `CatalogKey`, `schemaForCatalog`, `delegateFor`, and the Admin catalogs UI are
  untouched.
- **`deletePrintAction`'s swallowed-error problem is fixed as instructed.** It
  previously mapped *every* failure to `"Failed to delete print"`. It now returns
  the in-use message from the pre-check, and — this is the part the old
  `catch {}` destroyed — maps a thrown `P2003` to the **same** message as the
  backstop. A non-FK failure still returns the original generic message, so no
  existing behaviour is lost (covered by "still reports a NON-FK failure as the
  generic delete error").
- Additions worth flagging, all inside the spec's latitude:
  1. **`lib/validation/__tests__/finance.test.ts`** (40 tests) was added beyond
     the task list, to test the Zod boundary directly. It raised
     `lib/validation/finance.ts` from 73.68% → 100% branch.
  2. **`DeleteSaleButton` / `DeleteWithdrawalButton`** were extracted as their own
     Client islands (mirroring `DeleteExpenseButton`) rather than inlining the
     forms in the tables, plus `DeleteButtons.test.tsx` covering the
     "Not authorized" rejection path.
  3. **`data-testid`** on the balance figure and the two sub-figures
     (`balance-figure`, `sales-total`, `withdrawals-total`) so component tests and
     E2E can assert figures unambiguously (currency strings otherwise collide) —
     the same convention 09 used.
  4. The helpers in `lib/validation/finance.ts` (date, optional text) are
     **duplicated locally** rather than factored out of `lib/validation/expense.ts`
     — the design's stated fallback, chosen so feature 05's public API and error
     messages are not reshaped.
- One test expectation was corrected during the run, not the code: a **NaN
  number** is rejected by `z.number()` itself before the transform, so it carries
  the union's generic `"Invalid input"` message rather than the format message.
  Still a rejection with no write, which is what R14 requires; the test documents
  why.
