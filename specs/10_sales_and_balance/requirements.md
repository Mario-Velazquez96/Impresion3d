# Requirements — 10_sales_and_balance

**Feature:** Sales ledger + withdrawals ledger + a DERIVED account balance on a
`/finances` page
**Source:** product-owner decision (2026-07-16)
**Depends on:** 06_print_inventory (`Print`, `listPrints`),
01_auth_and_user_management (`User`, `requireUser`/`requireAdmin`),
05_expense_tracking (`lib/format.ts#formatCurrency`, the Decimal-money pattern)

## Purpose

Record **money coming in** (a sale of a print) and **money taken out** (a
withdrawal from the business account), and show the running figure that connects
them.

### The balance is "sales minus withdrawals" — expenses are DELIBERATELY excluded

`balance = sum(Sale.amount) − sum(Withdrawal.amount)`. **Expenses are not
subtracted.** This is a conscious product decision, not an oversight:

> The balance answers **"how much revenue has come in that hasn't been taken out
> yet"** — *not* "what is truly in the bank".

Supply expenses (05_expense_tracking) remain a separate concern with their own
page and their own totals; folding them in here would answer a different question
than the one the operator is asking. This exclusion is restated in
`prisma/schema.prisma` (the `Sale`/`Withdrawal` block comment) and rendered as a
visible label on the page (R4), so that neither a future reader of the schema nor
a user of the page can mistake it for a bug or for a bank balance.

### The balance is DERIVED, never stored

There is **no** balance column, cache, or denormalized running total anywhere. It
is computed on every read from the two ledgers. A stored balance would inevitably
drift out of sync with the rows it summarizes; the ledgers are the single source
of truth (R2).

### Money is exact, never a float

Amounts are `Decimal(10, 2)` in Postgres (the `Expense.cost` convention). Totals
are summed **in the database** via Prisma `aggregate._sum`, and the pure core
(`lib/finances-core.ts`) does its arithmetic in **integer cents**, so no JS float
ever touches an amount. Rounding/formatting happens **once**, at the display
edge, through `formatCurrency` (MXN) (R7).

## In scope

- A new route **`/finances`** inside the authenticated `(app)` group: the balance
  headline, the sales list, and the withdrawals list. **Any** signed-in user
  (EMPLOYEE or ADMIN) may view the whole page.
- A **"Finances"** link in `components/layout/MainNav.tsx`, **outside** the
  `showAdmin` block (employees can view), like the existing Calculator link.
- Prisma models + one migration:
  - **`Sale`** — `amount Decimal(10,2)`, `date`, a **required** `print` FK
    (`onDelete: Restrict`), optional `buyer`, optional `notes`.
  - **`Withdrawal`** — `amount Decimal(10,2)`, `date`, a **required** `reason`,
    and a **required** `recordedBy` `User` FK (audit trail of who took money out).
- A second migration adding **RLS** policies to both tables (defense-in-depth).
- **`lib/finances-core.ts`** — the PURE core (no `server-only`, no Prisma, no
  React): integer-cent parsing/formatting and the balance derivation. Unit-tested
  to **100% branch coverage**, matching `lib/pricing-core.ts`.
- **`lib/services/finances.ts`** — `listSales`, `listWithdrawals`,
  `getBalanceSummary` (DB `_sum` aggregates), `createSale`, `deleteSale`,
  `createWithdrawal`, `deleteWithdrawal`, plus a **Print reference counter**
  registration so an in-use print reports as in-use before the FK Restrict fires.
- **`lib/validation/finance.ts`** — client-importable Zod schemas (the
  `lib/validation/expense.ts` string-money pattern).
- **`actions/sales.ts`** / **`actions/withdrawals.ts`** — Server Actions, each
  `requireUser()`/`requireAdmin()` → Zod `safeParse` → service → `revalidatePath`.
- Authorization:
  - **Record a sale:** any authenticated user (`requireUser`).
  - **Delete a sale:** **Admin-only** (`requireAdmin`) — consistent with expense
    and print deletes.
  - **Record a withdrawal:** **Admin-only** (`requireAdmin`).
  - **Delete a withdrawal:** **Admin-only** (`requireAdmin`).
  - Everything is **viewable** by any authenticated user.
- Client islands for the two create/edit dialogs and the two delete buttons.

## Out of scope

- **Expenses in the balance.** See above — a deliberate, documented exclusion. Do
  not add expenses to the figure, do not add a second "true bank balance" figure
  in this feature.
- **A stored/cached balance column** or any denormalized running total.
- **Editing** a sale or a withdrawal. Ledger rows are append-and-delete only in
  this feature (a mistake is deleted and re-recorded by an Admin). Edit dialogs
  are deferred.
- **Sales not tied to a Print** (ad-hoc/service revenue), multi-line sales,
  quantities, unit prices, discounts, tax/IVA, currency other than MXN.
- **Linking a sale to a WeekPlanItem**, to inventory stock levels, or any
  stock-decrement behaviour. Prints are a catalog of what *can* be produced;
  there is no stock count to decrement.
- Profit/margin, per-period reports, charts, CSV export, date-range filters, or
  pagination on either ledger. The models are structured (`date`, `printId`,
  `recordedById`) precisely so those can arrive later without a remodel.
- Withdrawal approval workflows, payees/bank accounts, or receipts/attachments.
- Any change to `Expense` or to `/expenses`.
- New runtime dependencies. New env vars (none — nothing to add to
  `.env.example`).

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall provide a `/finances` page inside the
authenticated `(app)` route group, such that an unauthenticated request is
redirected to `/login`, and any signed-in user (EMPLOYEE or ADMIN) may view the
balance, the sales list, and the withdrawals list without admin gating; a
**"Finances"** link shall render in `MainNav` for both `showAdmin={false}` and
`showAdmin={true}`.

**R2 (Ubiquitous):** The system shall **derive** the account balance as
`balance = sum(Sale.amount) − sum(Withdrawal.amount)` on every read, and shall
**never store** it: no balance column, cache, or denormalized running total
exists in `prisma/schema.prisma`, and no code path writes a balance value.

**R3 (Ubiquitous):** The system shall **exclude `Expense` rows from the balance
entirely** — the balance is computed from the `Sale` and `Withdrawal` tables
only, such that creating, updating, or deleting any expense leaves the balance
unchanged.

**R4 (Ubiquitous):** The system shall display, adjacent to the balance figure, a
label stating that the figure is **sales minus withdrawals and does not include
expenses** (e.g. "Sales minus withdrawals — does not include expenses"), so the
figure cannot be misread as a bank balance.

**R5 (State-driven):** While both ledgers are empty, the system shall display a
balance of **`$0.00`** (never blank, never `NaN`, never an error), treating a
`null` `_sum` aggregate as zero.

**R6 (Unwanted behavior):** If the sales total is **less than** the withdrawals
total, then the system shall display the resulting **negative balance as-is**,
with its sign and its exact magnitude (e.g. `-$150.50`) — the figure shall
**never** be clamped to zero, hidden, or shown as an absolute value — and shall
mark it visually (a destructive/negative style) plus an accessible textual
indication that the balance is negative.

**R7 (Ubiquitous):** The system shall keep every monetary amount **exact**:
stored as `Decimal(10, 2)`; totalled in the database via Prisma
`aggregate._sum`; carried into `lib/finances-core.ts` as a string and computed in
**integer cents**; `Decimal.toNumber()`/float arithmetic shall **not** be used
anywhere in the data or derivation path — such that a set of amounts whose float
sum would drift (e.g. `0.10 + 0.20`) totals **exactly** (`0.30`), and shall be
rounded/formatted **once**, at the display edge, via `formatCurrency` (MXN).

**R8 (Ubiquitous):** The system shall require every `Sale` to reference an
existing inventory **`Print`** (a required FK), plus an `amount` and a `date`,
with `buyer` and `notes` optional; a submission with a missing or blank
`printId` shall be rejected at the Zod boundary with a field error and no write,
and a `printId` that does not exist shall surface as Prisma `P2003` and be
mapped to a friendly field error with no partial write.

**R9 (Unwanted behavior):** If a user attempts to delete a `Print` that has at
least one `Sale`, then the system shall **refuse the delete** and report the
print as in use: the `Sale.printId` FK is `onDelete: Restrict` (the hard
guarantee), and a reference counter registered from the finances service makes
the delete path report it as in-use before the FK fires — the print row shall
remain.

**R10 (Event-driven):** When **any authenticated user** (EMPLOYEE or ADMIN)
submits a valid sale, the system shall record it, and when an **ADMIN** deletes a
sale, the system shall remove it; if a **non-admin** attempts to delete a sale,
then the system shall reject the request with "Not authorized" **before any DB
work**, such that **no delete occurs**.

**R11 (Unwanted behavior):** If a **non-admin** attempts to record a withdrawal,
then the system shall reject the request with "Not authorized" **before any
validation or DB work**, such that **no `Withdrawal` row is written**; only an
ADMIN may record a withdrawal (`requireAdmin`).

**R12 (Unwanted behavior):** If a **non-admin** attempts to delete a withdrawal,
then the system shall reject the request with "Not authorized" **before any DB
work**, such that **no delete occurs**; only an ADMIN may delete a withdrawal
(`requireAdmin`).

**R13 (Unwanted behavior):** If an **unauthenticated** caller invokes any
finances mutation (create sale, delete sale, create withdrawal, delete
withdrawal), then the system shall reject it with "Not authenticated" **before
any validation or DB work**, such that **nothing is written or deleted**.

**R14 (Unwanted behavior):** If an amount is **negative, zero, non-numeric,
blank, non-finite, or carries more than two decimal places**, then the system
shall **reject it at the Zod boundary** with a field error and no write; and
independently, `lib/finances-core.ts` shall **clamp** any negative or non-finite
ledger amount to `0` before it enters a total (mirroring
`lib/pricing-core.ts#sanitizeAmount`), so such a value can never reduce a total
nor propagate `NaN` into a displayed figure.

**R15 (Ubiquitous):** The system shall record, for every `Withdrawal`, the
**`recordedBy` `User`** (a required FK set server-side from the authenticated
actor, never from client input) together with a required **`reason`**, and shall
display that user's name in the withdrawals list, providing an audit trail of who
took money out.

**R16 (Ubiquitous):** The system shall enable and force **RLS** on the `Sale` and
`Withdrawal` tables as **defense-in-depth** — authenticated read/write policies,
so an unauthenticated Supabase/PostgREST caller matches no policy and sees zero
rows — while the **real** authorization gate remains the server layer
(`requireUser`/`requireAdmin` in `actions/`), because Prisma connects with
elevated credentials and **bypasses RLS**.

**R17 (Ubiquitous):** The system shall list sales (amount, date, print name,
buyer, notes) and withdrawals (amount, date, reason, recorded-by) each ordered by
**`date` descending**, each fetched with its relation in a **single query** (no
N+1), with an empty-state message when a ledger has no rows.

## Acceptance

### Worked example (the canonical, testable case)

Given these rows (and, deliberately, an **Expense of $2,000.00** also present):

| Ledger     | Amount     | Notes                          |
|------------|-----------:|--------------------------------|
| Sale       | `1250.00`  | print "Dragon"                 |
| Sale       | `0.10`     | the float-drift pair…          |
| Sale       | `0.20`     | …`0.10 + 0.20` must be `0.30`  |
| Sale       | `99.95`    | print "Vase"                   |
| **Sales total**    | **`1350.25`** | |
| Withdrawal | `500.00`   | "Owner draw"                   |
| Withdrawal | `350.25`   | "Owner draw"                   |
| **Withdrawals total** | **`850.25`** | |
| **Balance** | **`500.00`** → rendered **`$500.00`** | |
| Expense    | `2000.00`  | **not** part of any figure above |

- The page shows sales total **$1,350.25**, withdrawals total **$850.25**, and
  the balance headline **$500.00** (R2, R7).
- The `$2,000.00` expense changes **nothing**: the balance is still **$500.00**.
  Deleting the expense also leaves it at **$500.00** (R3).
- `0.10 + 0.20` contributes exactly **`0.30`** to the sales total (integer
  cents), not `0.30000000000000004`; the total is exactly `1350.25` (R7).
- The balance is labelled **"Sales minus withdrawals — does not include
  expenses"** (R4).

### Negative-balance example

Sales `100.00`; withdrawals `250.50` → balance **`-150.50`**, rendered as
**`-$150.50`** exactly, styled as negative and announced as negative to assistive
tech. Not clamped, not hidden, not absolute (R6).

### Empty example

No sales, no withdrawals (`_sum` returns `null` for both) → **$0.00** (R5).

### Other acceptance

- Signed out, `/finances` redirects to `/login`. Signed in as an **EMPLOYEE**,
  the page loads, the **Finances** nav link is visible in both the app and admin
  navs, and the balance + both lists render (R1).
- No balance column exists in `prisma/schema.prisma`; the only balance is
  computed at read time (R2).
- A sale cannot be saved without a print; an unknown `printId` yields a friendly
  field error and no row (R8).
- Deleting a print that has a sale fails with an "in use" message and the print
  still exists (R9).
- An EMPLOYEE records a sale successfully; an EMPLOYEE's attempt to delete a sale
  returns "Not authorized" and the sale still exists (R10).
- An EMPLOYEE's attempt to record a withdrawal returns "Not authorized" and
  `db.withdrawal.create` is **never called**; the Admin UI controls are hidden
  for employees, but the **server check is the requirement** — hiding is UX (R11).
- An EMPLOYEE's attempt to delete a withdrawal returns "Not authorized" and
  `db.withdrawal.delete` is **never called** (R12).
- With no authenticated user, all four mutations return "Not authenticated" and
  no service function is called (R13).
- `amount` of `-5`, `0`, `""`, `abc`, `1.234`, `NaN` are each rejected with a
  field error and no write; `sanitizeAmountCents(-5)` → `0` (R14).
- A recorded withdrawal stores the acting admin's id in `recordedById` (taken
  from `requireAdmin()`, ignoring any `recordedById` in the FormData) and the
  list shows their name (R15).
- The RLS migration enables + forces RLS on both tables; an anonymous
  Supabase-client select returns zero rows (R16).
- Both lists are date-descending, joined in one query, with empty states (R17).
