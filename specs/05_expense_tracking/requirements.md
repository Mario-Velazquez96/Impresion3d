# Requirements — 05_expense_tracking

**Feature:** Supply expense recording
**Source:** `client_requirement.md` §4.2; `solution_design.md` §3, §5
**Depends on:** 02_catalog_management

## Purpose

Let users record supply expenses (cost, reason, date, purchase link, supply type)
and view them in a list. MVP is **recording only** — no reports or totals — but
the data is kept structured (`date`, `supplyTypeId`, `Decimal` cost) so the future
reports/totals feature (brief §6, §4.2 note) needs no remodel.

## In scope

- `Expense` model (cost Decimal, reason, date, purchaseUrl, supplyTypeId) +
  migration + RLS.
- CRUD server actions (create, edit, delete).
- Expenses list (most recent first) + create/edit form.

## Out of scope

- Aggregations/reports/totals (future) — but the schema must support them.
- Automatic linking to color inventory / filament stock (future).

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall define an `Expense` model with `cost`
(`Decimal(10,2)`), `reason`, `date`, optional `purchaseUrl`, and `supplyTypeId`
(→ `SupplyType`, `onDelete: Restrict`).

**R2 (Ubiquitous):** The `Expense` table shall have RLS enabled so only
authenticated users may read or write.

**R3 (Event-driven):** When the create-expense form is submitted, the system shall
validate it with `createExpenseSchema`, store `cost` as a decimal (not a float),
insert the row, and revalidate `/expenses`.

**R4 (Event-driven):** When the edit-expense form is submitted, the system shall
validate and update the row and revalidate `/expenses`.

**R5 (Event-driven):** When an Admin deletes an expense, the system shall remove
the row and revalidate `/expenses`.

**R6 (State-driven):** While viewing `/expenses`, the system shall list expenses
ordered by `date` descending, showing cost, reason, date, supply type, and the
purchase link when present.

**R7 (Unwanted behavior):** If a non-admin invokes `deleteExpense`, then the
system shall reject it and make no DB write.

**R8 (Unwanted behavior):** If `cost` is not a positive number or `supplyTypeId`
is missing/invalid, then the system shall reject the submission with a field error.

**R9 (Unwanted behavior):** If `purchaseUrl` is present but not a valid URL, then
the system shall reject the submission with a field error.

## Acceptance

- A user records an expense; it appears at the top of the list with correct
  formatting (currency, date, supply type, link).
- Editing updates the entry; an Admin can delete; an Employee cannot delete.
- Invalid cost / missing supply type / bad URL are rejected with field errors.
- Cost round-trips with two-decimal precision (no float error).

## Open items

- Currency: single currency assumed (no symbol selection in MVP); display format
  confirmed at the gate.
- Whether Employees may delete their own entries — default: delete is Admin-only
  (matches role matrix); revisit if needed.
