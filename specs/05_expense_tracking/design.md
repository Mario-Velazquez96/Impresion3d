# Design — 05_expense_tracking

**Source:** `solution_design.md` §3, §5; `client_requirement.md` §4.2

## Approach

A self-contained CRUD slice over `SupplyType` (from `02`). Server-rendered list +
Client form dialog. Cost handled as `Decimal` end-to-end (string in the form →
validated → Prisma `Decimal`) to avoid float drift. Schema kept report-ready.

## Schema & RLS

```prisma
model Expense {
  id String @id @default(cuid())
  cost Decimal @db.Decimal(10,2)
  reason String
  date DateTime
  purchaseUrl String?
  supplyType SupplyType @relation(fields:[supplyTypeId], references:[id], onDelete: Restrict)
  supplyTypeId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([date]) @@index([supplyTypeId])   // ready for future per-month / per-type reports
}
```

Migration `expenses`. RLS SQL migration: enable; read/write to any authenticated
user. (Delete authorization is enforced in the app layer as Admin-only — R7.)

## File layout & boundaries

```
app/(app)/expenses/page.tsx     # Server: services.listExpenses() → <ExpensesTable> + <ExpenseFormDialog>
  loading.tsx · error.tsx
components/expenses/
  ExpensesTable.tsx (server)    # rows: formatted cost, date, supply type, link, edit/delete buttons
  ExpenseFormDialog.tsx (client)# create/edit form; supply-type select fed from catalog
lib/services/expenses.ts        # listExpenses, createExpense, updateExpense, deleteExpense
lib/validation/expense.ts       # createExpenseSchema, updateExpenseSchema
actions/expenses.ts             # "use server": requireUser (create/edit), requireAdmin (delete) + zod + revalidate
```

- `listExpenses`: order by `date desc`, `include` supplyType (single query, no N+1).
- Cost: form sends a string; `createExpenseSchema` coerces to a 2-decimal number
  via `z.coerce`/refine; service writes `new Prisma.Decimal(value)`.

## Auth & security

- `createExpense`/`updateExpense`: `requireUser()`. `deleteExpense`:
  `requireAdmin()` (R7). Per-request Supabase client.

## Validation

- `createExpenseSchema` { cost: positive, 2-dp; reason: min 1; date: date;
  purchaseUrl: url optional; supplyTypeId: id } (R8, R9).
- `updateExpenseSchema` = create + `id`.

## Test approach

- **Vitest:** schema (positive cost, 2-dp coercion, URL validity, required supply
  type), Decimal round-trip in the service.
- **Component:** ExpenseFormDialog submit (create + edit) calls the action.
- **E2E:** record an expense → appears top of list with correct formatting; edit;
  admin delete; employee delete blocked.
- **RLS denial test:** unauthenticated read/write rejected (R2).
- Coverage target: service + schema branches; Decimal precision asserted.

## Open items / discrepancies

- Currency display format — single currency; confirm at the gate.
- Employee delete-own — default Admin-only delete.
