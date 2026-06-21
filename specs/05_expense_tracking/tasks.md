# Tasks — 05_expense_tracking

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Add `Expense` model (Decimal cost, date, purchaseUrl, supplyType Restrict); `prisma migrate dev --name expenses` (R1)
- [ ] Write RLS SQL migration on `Expense` (authenticated read/write) (R2)
- [ ] Add Zod `createExpenseSchema` (+positive 2-dp cost, URL, required supplyType) and `updateExpenseSchema` (R3, R8, R9)
- [ ] Implement `lib/services/expenses.ts` (list desc by date, create/update/delete, Decimal handling) (R3–R6)
- [ ] Implement `actions/expenses.ts` (requireUser create/edit; requireAdmin delete) + revalidate (R3–R5, R7)
- [ ] Build `expenses/page.tsx` + `<ExpensesTable>` (formatted) + `<ExpenseFormDialog>` (R6)
- [ ] Write tests: Vitest (schema cost/URL/required, Decimal round-trip); component (form create+edit); E2E (record→list, edit, admin delete, employee delete blocked) (all R)
- [ ] Write the RLS denial test: unauthenticated cannot read/write expenses (R2)
- [ ] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- E2E: record → top of list, formatted cost/date/type/link (R3, R6); edit (R4); admin delete (R5); employee delete blocked (R7).
- Unit: cost positive + 2-dp coercion (R8); bad URL rejected (R9); Decimal round-trips exactly (R1/R3).
- RLS test: unauthenticated denied (R2).
- Target: service/schema branches covered; all green via `init.sh`.
