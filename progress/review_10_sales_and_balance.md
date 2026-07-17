# Review — 10_sales_and_balance

**Verdict: APPROVE.** The leader may mark the feature `done` (after applying the
two migrations and confirming `prisma migrate status` is in sync).

Reviewed read-only against `specs/10_sales_and_balance/{requirements,design,tasks}.md`
and the actual diff/code. Every claim below was verified in the source, not taken
from `progress/impl_10_sales_and_balance.md`.

## The heart of the feature — verified directly

1. **Balance is DERIVED, never stored.** `grep` over `prisma/schema.prisma` and
   both migrations finds no balance/total/cache/running-total column — matches are
   prose in comments only. `getBalanceSummary()` (`lib/services/finances.ts:81`)
   runs two `_sum` aggregates in one `Promise.all` on every read. No code path
   writes a balance.
2. **Expenses EXCLUDED (correct, per the human's decision).** `lib/services/finances.ts`
   never references `db.expense`; the page never imports the expense service.
   Asserted by `finances.test.ts` › "NEVER touches db.expense" (`aggregate`/`findMany`/`count`
   all `not.toHaveBeenCalled()`) and "reads exactly two tables". The R4 label
   renders as real text in `BalanceCard.tsx:44-46` and is asserted three ways in
   `BalanceCard.test.tsx` (as text, adjacent to the figure, and when empty).
3. **No JS float in the money path.** `Decimal(10,2)` in schema + migration SQL;
   totals via `_sum`; `.toString()` into the pure core; integer cents throughout;
   `formatCurrency` only at the display edge. The only `Number()` calls are on
   integer string parts (`finances-core.ts:78`) and a `> 0` comparison in Zod —
   neither is arithmetic on a stored amount. Worked example asserted **exactly**:
   `computeBalance("1350.25","850.25")` → 135025/85025/50000 → `"500.00"` → `$500.00`;
   `sumAmountCents(["0.10","0.20"]) === 30`, `fromCents(30) === "0.30"` with an
   explicit `not.toBe("0.30000000000000004")` and a documented `0.1+0.2` control;
   `toCents("0.29") === 29`; the $2,000 expense changes nothing (service test +
   E2E); negative renders `-$150.50` with explicit `not.toBe("0.00")` and
   `not.toBe("150.50")` (un-clamped, not absolute); empty → `$0.00`, never NaN.
4. **`lib/finances-core.ts` is PURE** — the file has **zero imports**: no
   `server-only`, no Prisma, no React. **Real coverage, measured this run:
   100% stmts / 100% branch / 100% funcs / 100% lines.**
5. **Authorization is first, with no-write assertions.** `requireUser` (create
   sale) / `requireAdmin` (delete sale, create + delete withdrawal) is the first
   statement in all four actions, before Zod and before any service call — matching
   the approved spec. Both suites assert the service mock was NEVER called for
   non-admin and unauthenticated cases, plus explicit "rejects BEFORE validation"
   tests where an also-invalid payload still returns "Not authorized"/"Not
   authenticated" with `fieldErrors` undefined.
6. **`recordedById` is server-side only.** `createWithdrawalSchema` has no such
   field; the action passes `auth.user.id` from `requireAdmin()` as the service's
   second argument. `withdrawals.test.ts` › "IGNORES a recordedById planted in the
   FormData" asserts the forged value never reaches the service and the parsed
   input has no such property.
7. **RLS** enabled AND forced on both tables in its own migration, with the four
   `TO authenticated` policies each, and a header stating Prisma bypasses RLS and
   the Admin-only gates live in `actions/`.

## Migration SQL review

`DECIMAL(10,2)` on both amounts; `Sale_printId_fkey → Print ON DELETE RESTRICT`;
`Withdrawal_recordedById_fkey → User ON DELETE RESTRICT`; indexes on `Sale(date)`,
`Sale(printId)`, `Withdrawal(date)`, `Withdrawal(recordedById)`. Matches the
schema and the `20260622110000_expenses` precedent. Being unapplied is expected.

## Traceability — R1–R17 all covered

Each requirement has at least one named, genuinely-covering test: R1 MainNav
`it.each([false,true])` + E2E redirect/employee-view; R2 core worked example +
service `_sum`/"does NOT fetch rows and sum in JS" + BalanceCard; R3 service
never-touches-expense + E2E; R4 BalanceCard label ×3; R5 core empty + service
null-`_sum` + BalanceCard `$0.00`/no-NaN; R6 core negative as-is + BalanceCard
`-$150.50` + destructive + "Negative balance"; R7 core drift suite + service
`toNumber()`-throws stub; R8 sales-action missing/blank/P2003 + SaleFormDialog;
R9 print-references (6) + prints-action pre-check & P2003 backstop + E2E; R10
employee-create + admin-only-delete no-write; R11/R12 withdrawals no-write +
before-validation; R13 unauthenticated across both suites; R14 core clamp +
finance schema + both actions; R15 forged-id tests + WithdrawalsTable/Dialog;
R16 RLS migration + `e2e/finances-rls.spec.ts`; R17 both table order tests +
service list tests. All `tasks.md` `[x]` boxes spot-checked against code — all
genuinely done (including `loading.tsx`/`error.tsx` and both delete islands).

## Scope discipline — clean

`git diff` on `lib/validation/catalog.ts`, `lib/services/catalogs.ts`,
`actions/catalogs.ts`, `app/(app)/admin/`, `components/admin/` is **empty**:
`CatalogKey` not widened, `schemaForCatalog`/`delegateFor`/Admin catalogs UI
untouched. `actions/prints.ts` diff is +23/-1: the `isPrintInUse` pre-check after
`ensureAdmin` plus the P2003 backstop, nothing else — a non-FK failure still
returns the original generic message. `actions/__tests__/prints.test.ts` is
**additive only** (+75, 0 assertions removed or loosened; `isPrintInUseMock`
defaults to `false` in `beforeEach` so prior cases are unchanged). MainNav diff is
the link + comment. `package.json`, `pnpm-lock.yaml`, `.env.example` show **no
diff**: no new dependency, no new env var. No `console.log`, no `any`.

## Pipeline — run by the reviewer, real results

- `corepack pnpm typecheck` → **pass, 0 errors**.
- `corepack pnpm lint` → **pass, 0 errors**; 4 warnings, all pre-existing
  `'_a' is defined but never used` in `components/planning/__tests__/WeekPlanner.test.tsx`
  (file untouched by this feature).
- `corepack pnpm test` (coverage) → **57 test files / 761 tests, all passed, 0
  failures**.
- Coverage (measured, not reported): `lib/finances-core.ts` **100/100/100/100**;
  `lib/services/finances.ts` 100; `lib/services/print-references.ts` 100;
  `lib/validation/finance.ts` 100; `components/layout/MainNav.tsx` 100;
  `components/finances/` 96.33% lines / 92.92% branch (`types.ts` 0% is a
  type-only module with no runtime code). All targets met.
- `pnpm build` **not run** (hard rule — the dev server shares `.next`).
- E2E not run: `e2e/finances.spec.ts` and `e2e/finances-rls.spec.ts` are
  credential-gated and skip without the `E2E_*` vars.

## Notes for the leader (not blockers)

1. `prisma migrate status` could not be run by the implementer or reviewer
   (`DIRECT_URL` not set). Confirm in-sync after applying both migrations to
   dev/staging.
2. The R9 pre-check is best-effort by design (the counter registers only if
   `lib/services/finances.ts` has been loaded in that server instance); the FK
   `Restrict` + P2003 backstop is the hard guarantee and returns the same message.
   Both paths are tested.
