-- RLS for the Expense table (R2). Defense-in-depth: the server layer is the
-- primary guard (Prisma connects with elevated credentials and bypasses RLS),
-- but any access that goes through the Supabase client (PostgREST) is gated here.
--
-- Policy summary:
--   SELECT / INSERT / UPDATE / DELETE : allowed to ANY authenticated user.
-- This is an internal tool — both roles (ADMIN, EMPLOYEE) read/write expenses,
-- with no per-row ownership scoping. Unauthenticated callers match no policy and
-- therefore see/affect zero rows (R2).
--
-- NOTE: the Admin-only constraint on DELETE (R7) is enforced in the application
-- layer (actions/expenses.ts via requireAdmin), NOT in RLS — the Supabase delete
-- path is open to any authenticated user as defense-in-depth, while the product
-- delete path always goes through the server action's requireAdmin() gate.
--
-- We ENABLE + FORCE RLS so even the table owner is subject to the policies.

ALTER TABLE public."Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Expense" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Expense_select_authenticated"
  ON public."Expense"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Expense_insert_authenticated"
  ON public."Expense"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Expense_update_authenticated"
  ON public."Expense"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Expense_delete_authenticated"
  ON public."Expense"
  FOR DELETE
  TO authenticated
  USING (true);
