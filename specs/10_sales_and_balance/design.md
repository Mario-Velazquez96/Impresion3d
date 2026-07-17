# Design — 10_sales_and_balance

**Source:** product-owner decision (2026-07-16)
**Depends on:** 06_print_inventory (`Print`, `listPrints`, `lib/services/prints.ts`),
01_auth (`User`, `requireUser`, `requireAdmin`), 05 (`lib/format.ts`, the
Decimal-money + action-shape conventions), 02 (`registerCatalogReference` pattern)

## Approach

Two append-and-delete ledgers plus one derived figure. The shape mirrors
05_expense_tracking (Server Component page + Client islands + Server Actions) and
09_price_calculator (a pure core carrying the arithmetic):

```
app/(app)/finances/page.tsx              Server Component — auth + 3 reads
  ├─ components/finances/BalanceCard.tsx        Server — the headline + the label
  ├─ components/finances/SalesTable.tsx         Client — list + delete (Admin)
  ├─ components/finances/WithdrawalsTable.tsx   Client — list + delete (Admin)
  ├─ components/finances/SaleFormDialog.tsx     Client — record a sale (any user)
  ├─ components/finances/WithdrawalFormDialog.tsx Client — record (Admin only)
  └─ components/finances/types.ts               Client-safe view types
app/(app)/finances/{loading,error}.tsx    per the /expenses convention
lib/finances-core.ts                      PURE core — cents math + the balance
lib/services/finances.ts                  server-only — Prisma + _sum aggregates
lib/validation/finance.ts                 Zod (client-importable)
actions/sales.ts, actions/withdrawals.ts  Server Actions
components/layout/MainNav.tsx             + "Finances" link (all users)
prisma/schema.prisma                      + Sale, Withdrawal
prisma/migrations/…_sales_and_withdrawals/migration.sql
prisma/migrations/…_sales_and_withdrawals_rls/migration.sql
```

### The three invariants this design exists to protect

1. **The balance is derived, never stored.** No column, no cache, no trigger, no
   materialized view. `getBalanceSummary()` runs two `_sum` aggregates on every
   request. A stored total would drift the first time a row was inserted outside
   the happy path; there is nothing to keep in sync if nothing is kept (R2).
2. **Expenses are excluded, on purpose.** The `Expense` table is not read by this
   feature — not by the service, not by the page. The exclusion is documented in
   three places so it survives contact with a future maintainer: the schema block
   comment, the service's doc comment, and a **visible label on the page** (R3,
   R4). A test asserts the label (R4) and another asserts an expense in the DB
   does not move the balance (R3).
3. **No float ever touches money.** `Decimal(10,2)` in Postgres → `_sum` in
   Postgres → `.toString()` → **integer cents** in the pure core →
   `formatCurrency` at the display edge. `Decimal.toNumber()` appears **nowhere**
   in the data path (R7).

## Data model — `prisma/schema.prisma`

Appended after the weekly-planning block, following the `Expense` conventions
(Decimal money, `Restrict` FK, `date` index, an explanatory block comment):

```prisma
// ── Sales & balance (10_sales_and_balance) ───────────────────────────────────
// Two ledgers — money IN (Sale) and money OUT (Withdrawal) — and one figure
// derived from them.
//
// THE BALANCE IS NOT STORED. There is deliberately no balance column anywhere:
// `balance = sum(Sale.amount) - sum(Withdrawal.amount)` is computed on every read
// (lib/services/finances.ts + lib/finances-core.ts). A stored total would drift
// out of sync with the rows it summarizes; the ledgers are the source of truth.
//
// EXPENSES ARE DELIBERATELY EXCLUDED FROM THE BALANCE — this is a product
// decision, NOT a bug, and must not be "fixed". The balance answers "how much
// revenue came in that hasn't been taken out yet", NOT "what is truly in the
// bank". Supply spending stays a separate 05_expense_tracking concern with its
// own page. The /finances page labels the figure accordingly.
//
// `amount` is a Decimal(10,2) on both models — never a JS float — so amounts
// round-trip with exact two-decimal precision (the Expense.cost convention).

// A sale of a print. The print FK is REQUIRED and onDelete: Restrict (a print
// with sales cannot be deleted; the finances service also registers a print
// reference counter for the friendly pre-check) — mirroring Expense.supplyType.
// `buyer` and `notes` are free-text and optional. Indexed by `date` (list order /
// future per-period reports) and `printId` (future per-print revenue reports).
// RLS lets any authenticated user read/write; the server layer requires a signed-
// in user to record, and gates delete to Admins.
model Sale {
  id        String   @id @default(cuid())
  amount    Decimal  @db.Decimal(10, 2)
  date      DateTime
  print     Print    @relation(fields: [printId], references: [id], onDelete: Restrict)
  printId   String
  buyer     String?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([date])
  @@index([printId])
}

// Money taken out of the business account. `reason` is REQUIRED (a withdrawal
// with no stated reason is not auditable). `recordedBy` is a required User FK set
// SERVER-SIDE from the authenticated actor — the audit trail of who took money
// out — with onDelete: Restrict, so a user who has recorded a withdrawal cannot
// be deleted (mirrors WeekPlan.createdBy). Indexed by `date` (list order) and
// `recordedById` (per-user audit). RLS lets any authenticated user read/write;
// recording AND deleting are gated to Admins in the app layer.
model Withdrawal {
  id           String   @id @default(cuid())
  amount       Decimal  @db.Decimal(10, 2)
  date         DateTime
  reason       String
  recordedBy   User     @relation(fields: [recordedById], references: [id], onDelete: Restrict)
  recordedById String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([date])
  @@index([recordedById])
}
```

Back-relations to add (with the comment convention the existing back-relations
use):

- `Print.sales Sale[]` — "10_sales_and_balance: sales of this print. The FK on
  Sale uses onDelete: Restrict, so a print that has been sold cannot be deleted."
- `User.withdrawals Withdrawal[]` — "10_sales_and_balance: withdrawals this user
  recorded. The FK on Withdrawal uses onDelete: Restrict, so a user who has
  recorded a withdrawal cannot be deleted."

### Migrations

Two, matching the repo's `<feature>` + `<feature>_rls` split:

- **`prisma/migrations/20260716120000_sales_and_withdrawals/migration.sql`** —
  `CREATE TABLE "Sale"`, `CREATE TABLE "Withdrawal"`, their indexes, and the
  three FKs (`Sale.printId → Print`, `Withdrawal.recordedById → User`) with
  `ON DELETE RESTRICT ON UPDATE CASCADE`. Generated by
  `pnpm prisma migrate dev --name sales_and_withdrawals` against the **dev/staging**
  Supabase project (never production).
- **`prisma/migrations/20260716120100_sales_and_withdrawals_rls/migration.sql`** —
  hand-written, modelled line-for-line on
  `20260622110100_expenses_rls/migration.sql` (R16):

```sql
ALTER TABLE public."Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sale" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Sale_select_authenticated" ON public."Sale"
  FOR SELECT TO authenticated USING (true);
-- + insert / update / delete TO authenticated, and the same four for "Withdrawal".
```

With a header comment stating the same contract as the expenses RLS file: RLS is
**defense-in-depth** for the PostgREST path; **Prisma bypasses RLS**, so the real
guard is `actions/*` via `requireUser`/`requireAdmin`. In particular the
**Admin-only** constraints (R10 sale delete, R11/R12 withdrawal record + delete)
are **application-layer**, not RLS — the Supabase path is open to any
authenticated user, exactly as `Expense` already is, and the product path always
goes through the actions.

## `lib/finances-core.ts` — the pure core

Lives in `lib/`, **not** `lib/services/`, and **must not** import `server-only`,
Prisma, or React — same rationale as `lib/pricing-core.ts` / `lib/planning-core.ts`:
services are server-only (they touch the Prisma singleton), whereas this is plain
arithmetic that the Client islands may import and Vitest can hit with **no mocks
at 100% branch coverage**.

**Why integer cents rather than `Prisma.Decimal`:** `Decimal` lives in
`@prisma/client`; importing it here would drag a server-flavoured dependency into
a module that must stay client-importable and mock-free. Cents are exact,
dependency-free, and trivially testable — and the *heavy* summing already happens
in Postgres via `_sum`, so the core only ever handles a handful of values.

```ts
/** A 2-dp money string as it arrives from a Decimal (`"1350.25"`) or an input. */
export type MoneyString = string;

export type BalanceSummary = {
  salesTotalCents: number;
  withdrawalsTotalCents: number;
  /** May be NEGATIVE — that is a real, displayable state (R6). */
  balanceCents: number;
  salesTotal: MoneyString;        // "1350.25"
  withdrawalsTotal: MoneyString;  // "850.25"
  balance: MoneyString;           // "500.00" / "-150.50"
  isNegative: boolean;
};

/** Exact string→cents. Non-numeric/blank/null/NaN/Infinity/>2dp → 0. Sign kept. */
export function toCents(value: string | number | null | undefined): number;

/** toCents + CLAMP negatives to 0 — the ledger-amount choke point (R14). */
export function sanitizeAmountCents(value: string | number | null | undefined): number;

/** cents → a 2-dp money string, sign preserved: -15050 → "-150.50" (R6, R7). */
export function fromCents(cents: number): MoneyString;

/** Sum ledger amounts exactly, in cents (each sanitized first) (R7, R14). */
export function sumAmountCents(values: (string | number | null | undefined)[]): number;

/** THE derivation: sales − withdrawals. Nulls (empty ledgers) → 0 → $0.00 (R2, R5). */
export function computeBalance(
  salesTotal: string | number | null | undefined,
  withdrawalsTotal: string | number | null | undefined,
): BalanceSummary;
```

Design notes:

- **`toCents` is the choke point.** It parses with a regex
  (`/^-?\d+(\.\d{1,2})?$/`) and does **string** arithmetic —
  `Number(intPart) * 100 + Number(fracPart.padEnd(2, "0"))`, negated on a leading
  `-`. It never multiplies a fractional float by 100 (`0.29 * 100` is
  `28.999999999999996`), which is the whole point: `"0.10"` → `10` and `"0.20"` →
  `20` sum to `30` → `"0.30"` **exactly** (R7).
- **`sanitizeAmountCents` mirrors `pricing-core#sanitizeAmount`**: blank / `null`
  / `undefined` / non-numeric / `NaN` / `Infinity` → `0`, and negatives **clamped**
  to `0`, so a bad value can never reduce a total or leak `NaN` into a figure
  (R14). Zod is the *rejection* boundary; this clamp is the belt-and-braces.
- **`computeBalance` does NOT clamp its result.** It sanitizes each *input* total
  (a total is never legitimately negative) but the **difference may be negative**
  and is returned as-is with `isNegative` — R6's decision is that a negative
  balance is a true state and is shown, signed, not zeroed.
- **No rounding lives here.** Cents are already exact; `fromCents` is a
  formatting of an exact integer, and the *only* rounding/locale step is
  `formatCurrency` at the display edge (R7).
- **`Prisma.Decimal.toNumber()` is never used** anywhere in this feature. The
  service passes `_sum` Decimals across as `.toString()`.

## `lib/services/finances.ts` (server-only)

Header comment per the `expenses.ts`/`prints.ts` convention: authorization happens
in the caller; Prisma bypasses RLS so the server layer is the real guard; **and**
an explicit restatement that expenses are excluded from the balance by design.

```ts
import "server-only";
```

- **`getBalanceSummary(): Promise<BalanceSummary>`** (R2, R3, R5, R7)

  ```ts
  const [sales, withdrawals] = await Promise.all([
    db.sale.aggregate({ _sum: { amount: true } }),
    db.withdrawal.aggregate({ _sum: { amount: true } }),
  ]);
  return computeBalance(
    sales._sum.amount?.toString() ?? null,        // Decimal → string, never toNumber()
    withdrawals._sum.amount?.toString() ?? null,  // null = empty ledger → $0.00 (R5)
  );
  ```

  Two aggregates, no row fetch: Postgres sums the `numeric` column exactly. The
  `Expense` table is **not queried here** (R3).
- **`listSales(): Promise<SaleWithPrint[]>`** — `orderBy: { date: "desc" }`,
  `select` including `print: { select: { id, name } }` — one query, no N+1 (R17).
  `amount` stays a `Prisma.Decimal` in the return type; the page maps it with
  `.toString()`.
- **`listWithdrawals(): Promise<WithdrawalWithUser[]>`** — same, including
  `recordedBy: { select: { id, name } }` (R15, R17).
- **`createSale(input: CreateSaleInput)`** — `amount: new Prisma.Decimal(input.amount)`
  from the validated **string** (never `parseFloat`), `printId` straight through;
  a bad printId raises `P2003` for the action to map (R8).
- **`createWithdrawal(input: CreateWithdrawalInput, recordedById: string)`** —
  note the **second parameter**: `recordedById` comes from the authenticated actor
  the action resolved, **never** from the Zod input / FormData, so a client cannot
  forge the audit trail (R15).
- **`deleteSale(id)` / `deleteWithdrawal(id)`** — plain deletes; Admin-only
  authorization is the caller's job.
- **Print delete-guard registration** (R9):

  ```ts
  registerPrintReference((id) => db.sale.count({ where: { printId: id } }));
  ```

### The delete-guard: why not `registerCatalogReference`

The intent is exactly the existing pattern (a friendly in-use pre-check in front
of a hard FK `Restrict`), but it **cannot literally reuse
`registerCatalogReference`**: that registry is keyed by `CatalogKey`
(`"color" | "printType" | "supplyType" | "taskCategory"` — `lib/validation/catalog.ts`),
and **`Print` is not a catalog**. Widening that enum would leak a `"print"` case
into `schemaForCatalog`, `delegateFor`, and the Admin catalogs UI, which manages
catalogs only — the wrong shape entirely. The other direction (having
`lib/services/prints.ts` call `db.sale.count`) inverts the dependency: 06 would
import 10. The registry pattern exists precisely to avoid that.

So this feature adds a **small, deliberate mirror** of the catalog registry for
prints:

- **`lib/services/print-references.ts`** (new, tiny, no Prisma — so neither side
  imports the other and there is no cycle):
  `export type PrintReferenceCounter = (id: string) => Promise<number>;`,
  `registerPrintReference(counter)`, `isPrintInUse(id)` (runs the counters in
  parallel, `some(n => n > 0)`), and `__resetPrintReferencesForTests()` — a
  line-for-line analogue of the catalogs registry, including the doc comment
  explaining how a later feature plugs in.
- `lib/services/finances.ts` registers its counter as a module side effect (like
  `expenses.ts`/`prints.ts` do today).
- `actions/prints.ts#deletePrintAction` gains the pre-check, mirroring
  `actions/catalogs.ts#deleteCatalog`:

  ```ts
  if (await isPrintInUse(id)) {
    return { ok: false, error: "This print has sales recorded and cannot be deleted" };
  }
  ```

  …**and** maps a thrown `P2003` from `deletePrint` to the **same** message.

**The P2003 mapping is the guarantee; the pre-check is the friendly path.** Same
as catalogs: the counter is only registered if the finances service module has
been loaded in that server instance, so the pre-check is best-effort, while the
DB's `Restrict` FK always holds. Both paths return the same message, so the user
sees one behaviour (R9).

> This is the one place where the design touches an existing feature's file
> (`actions/prints.ts`, plus the `Print.sales` back-relation). It is additive
> (an early-return guard + an error mapping) and covered by a new test in
> `actions/__tests__/prints.test.ts`. **Flag for the approval gate.**

## `lib/validation/finance.ts` (client-importable — no `server-only`)

Reuses the `lib/validation/expense.ts` **string-money** approach verbatim, so the
amount never passes through a lossy `parseFloat`:

- `amountSchema` — accepts string|number, trims, requires `/^\d+(\.\d{1,2})?$/`
  and `Number(value) > 0`; messages: "Amount is required" / "Amount must be a
  number with at most two decimal places" / "Amount must be greater than zero".
  Output is the **normalized string** handed to `new Prisma.Decimal(...)` (R14).
- `dateSchema` — copied from the expense module (ISO string|Date, rejects
  unparseable/empty).
- `createSaleSchema = { amount, date, printId: idSchema("Print is required"),
  buyer: optionalText, notes: optionalText }` (R8).
- `createWithdrawalSchema = { amount, date, reason: z.string().trim().min(1,
  "Reason is required") }` — **no `recordedById`**: it is not client input (R15).
- No update schemas — editing is out of scope.

If the trimmed-optional-text and date helpers can be factored out of
`lib/validation/expense.ts` without changing its public API or messages, do so;
otherwise duplicate them locally rather than reshaping feature 05.

## Server Actions

`actions/sales.ts` and `actions/withdrawals.ts`, each copying the
`actions/expenses.ts` skeleton exactly (`FieldError`, `…ActionResult`,
`ensureUser`/`ensureAdmin`, `zodFailure`, `isForeignKeyViolation`), because that
shape is what the existing dialogs/tests already speak.

**Every mutation, in this order — no exceptions (R10–R13):**

```
1. requireUser() / requireAdmin()   ← FIRST. A rejected caller writes NOTHING.
2. schema.safeParse(formData)       ← Zod, at the boundary.
3. service call                     ← the only DB touch.
4. revalidatePath("/finances")      ← plus "/inventory" where relevant.
```

| Action                     | Gate            | Service                              | Revalidate               |
|----------------------------|-----------------|--------------------------------------|--------------------------|
| `createSaleAction`         | `requireUser`   | `createSale`                         | `/finances`, `/inventory`* |
| `deleteSaleAction`         | `requireAdmin`  | `deleteSale`                         | `/finances`, `/inventory`* |
| `createWithdrawalAction`   | `requireAdmin`  | `createWithdrawal(input, user.id)`   | `/finances`              |
| `deleteWithdrawalAction`   | `requireAdmin`  | `deleteWithdrawal`                   | `/finances`              |

\* `/inventory` is revalidated on sale create/delete because a print's
deletability (R9) changes with its first/last sale.

Notes:

- `createWithdrawalAction` keeps the `requireAdmin()` **return value** and passes
  `user.id` as `recordedById` — the audit trail is taken from the session, never
  from `formData` (R15). Any `recordedById` field in the FormData is ignored (it
  is not in the schema).
- `ensureAdmin` distinguishes `ForbiddenError` → `"Not authorized"` from anything
  else → `"Not authenticated"`, exactly as `actions/expenses.ts` does (R11, R12,
  R13).
- A bad `printId` → `P2003` → `badReferenceFailure()` → field error on `printId`,
  no partial write (R8).
- No `deleteSale`/`deleteWithdrawal` cascade concerns: nothing references them.

## Page — `app/(app)/finances/page.tsx` (Server Component)

Thin, per conventions; mirrors `app/(app)/expenses/page.tsx`:

- `const user = await requireUser();` first — a second server-layer guard behind
  the `(app)` layout redirect, and the source of `canDelete`/`canWithdraw`
  (`user.role === "ADMIN"`). **No `requireAdmin`** on the page: employees view
  everything (R1).
- One `Promise.all`, four reads, no N+1:
  `getBalanceSummary()`, `listSales()`, `listWithdrawals()`, `listPrints()` (for
  the sale form's print select).
- Maps to serializable view models before the client boundary:
  `amount: sale.amount.toString()` (**never** `.toNumber()`),
  `date: sale.date.toISOString()`, `printName: sale.print.name`,
  `recordedByName: w.recordedBy.name`.
- Renders `<h1>Finances</h1>`, `<BalanceCard summary={…} />`, then the two
  tables and their dialogs (`<SaleFormDialog prints={…} />` always;
  `<WithdrawalFormDialog />` only when `canWithdraw`).
- `export const metadata = { title: "Finances — Tower Layers" }`.
- `loading.tsx` + `error.tsx` copied from the `/expenses` convention.

## `components/finances/BalanceCard.tsx` (Server Component)

No interactivity ⇒ no `"use client"`.

- The headline: `formatCurrency(summary.balance)` — the **single** rounding/
  formatting step, fed the exact cents-derived string (R7).
- The label, always rendered next to the figure (R4):
  **"Sales minus withdrawals — does not include expenses"**. It is a
  *requirement*, with its own test — not decoration. Rendered as real text (not a
  `title`/tooltip) so it is readable and assertable.
- Sub-figures: `Sales $1,350.25` and `Withdrawals $850.25`, so the arithmetic is
  visible.
- Negative state (R6): `summary.isNegative` drives a destructive text class **and**
  a visible/`sr-only` textual marker (e.g. "Negative balance") — the sign alone
  is not an accessible signal. The figure itself always renders as-is
  (`-$150.50`), never clamped or abs'd.

## Client islands

- **`SalesTable.tsx`** (`"use client"`) — rows (date, print name, buyer, notes,
  amount) date-descending from the server; `canDelete` prop gates the delete
  button (UX only — `deleteSaleAction`'s `requireAdmin` is the actual gate);
  empty state. Mirrors `ExpensesTable`.
- **`WithdrawalsTable.tsx`** — rows (date, reason, recorded-by name, amount);
  `canDelete` gates delete.
- **`SaleFormDialog.tsx`** — `useActionState(createSaleAction)`; fields: amount
  (`type="number" min="0" step="0.01"`), date, **print `<select>` (required)**,
  buyer, notes; renders `fieldErrors` per field. Available to every user.
- **`WithdrawalFormDialog.tsx`** — amount, date, reason (required). Rendered only
  for Admins; the server still enforces it (R11).
- **`types.ts`** — client-safe view types (`SaleRowView`, `WithdrawalRowView`,
  `PrintOptionView`, `BalanceView`) declared here, not imported from the
  `server-only` services (the `components/calculator/types.ts` rationale).

Amounts crossing the boundary are **strings** (`"1350.25"`), formatted by
`formatCurrency` in the component. No client-side balance math: the page renders
the server-derived summary. `lib/finances-core.ts` stays client-importable
because it is pure — but this feature has no need for it in the browser today.

## `components/layout/MainNav.tsx`

**One** link, **outside** the `showAdmin` block, after "Calculator" (R1):

```tsx
<Link href="/finances" className="text-sm text-muted-foreground hover:text-foreground">
  Finances
</Link>
```

Employees can view `/finances`; the Admin-only *controls* are hidden inside the
page. Update the file's header comment (which currently explains why Calculator
sits outside `showAdmin`) to cover Finances too.

## Auth & security summary

- `(app)/layout.tsx` redirects unauthenticated requests; the page's
  `requireUser()` is the server-layer guard before any Prisma read (R1, R13).
- **Prisma bypasses RLS.** Authorization is enforced **in the server layer**
  (`actions/*`), always **before** validation and before any DB work, so a
  rejected caller writes nothing. RLS on `Sale`/`Withdrawal` is
  **defense-in-depth** for the PostgREST path only (R16).
- Hiding Admin controls in the UI is **UX**; the `requireAdmin()` calls in
  `actions/withdrawals.ts` (both) and `deleteSaleAction` are the requirement
  (R10, R11, R12).
- `recordedById` is server-assigned from the session — a client cannot attribute
  a withdrawal to someone else (R15).
- No secrets, **no new env vars** (nothing to add to `.env.example`), **no new
  dependency**.

## Test approach

- **Vitest `lib/__tests__/finances-core.test.ts` — 100% BRANCH coverage** (the
  pure-core bar set by `lib/pricing-core.ts`): the worked example, the
  `0.10 + 0.20 = 0.30` drift case, empty/null → `$0.00`, the negative balance,
  `toCents`/`fromCents` round-trips, clamping, `NaN`/`Infinity`/`>2dp` handling.
- **Vitest `lib/services/__tests__/finances.test.ts`** (Prisma mocked, per
  `expenses.test.ts`): `_sum` aggregates are used (not a row fetch + JS sum);
  `Expense` is never queried; `.toNumber()` is never called; `null` `_sum` → 0;
  `Prisma.Decimal` built from the validated string; the print reference counter
  registration.
- **Vitest `actions/__tests__/sales.test.ts` / `withdrawals.test.ts`**: the
  auth-first ordering with **no-write assertions** (`expect(service).not.toHaveBeenCalled()`)
  for every non-admin/unauthenticated case, Zod rejections, `P2003` mapping,
  `revalidatePath`, and the server-assigned `recordedById`.
- **Component (RTL)**: the balance headline + the "does not include expenses"
  label, negative rendering, the two tables, the dialogs, and `MainNav`.
- **E2E (Playwright, credential-gated** on the `E2E_*` vars, skipping when absent,
  per `e2e/expenses.spec.ts`): the signed-out redirect, an employee's view, the
  worked example end-to-end, and an anonymous-client RLS check
  (`e2e/finances-rls.spec.ts`, per `e2e/expenses-rls.spec.ts`).
- **Coverage:** `lib/finances-core.ts` **100% branch**; ≥ 80% lines on every other
  changed module.

## Verification

Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` (with coverage).

> **Do NOT run `pnpm build`.** The dev server shares the `.next` directory, so a
> concurrent build corrupts its state. Typecheck + lint + test are the gate for
> this feature; the build is validated by the Vercel **preview** deployment.

Migrations run with `pnpm prisma migrate dev` against the **dev/staging** Supabase
project only — never production, never a destructive reset of a shared database.

## Open items

- **For the approval gate:** the `Print` delete-guard cannot literally use
  `registerCatalogReference` (`Print` is not a `CatalogKey`); this design adds a
  parallel `lib/services/print-references.ts` registry and a pre-check in
  `actions/prints.ts` instead. The FK `Restrict` + `P2003` mapping is the hard
  guarantee either way. See "The delete-guard" above. If the reviewer prefers a
  zero-touch approach to feature 06, drop the registry and rely on the `P2003`
  mapping alone — R9 still holds.
- Editing a sale/withdrawal, expense-inclusive reporting, and per-period reports
  are explicitly deferred (`requirements.md` → Out of scope).
