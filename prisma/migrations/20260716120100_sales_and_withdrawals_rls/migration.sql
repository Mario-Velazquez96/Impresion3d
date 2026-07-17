-- RLS for the Sale and Withdrawal tables (R16). Defense-in-depth: the server
-- layer is the primary guard (Prisma connects with elevated credentials and
-- BYPASSES RLS), but any access that goes through the Supabase client (PostgREST)
-- is gated here.
--
-- Policy summary:
--   SELECT / INSERT / UPDATE / DELETE : allowed to ANY authenticated user.
-- This is an internal tool — both roles (ADMIN, EMPLOYEE) read the ledgers and
-- the balance, with no per-row ownership scoping. Unauthenticated callers match
-- no policy and therefore see/affect zero rows (R16).
--
-- NOTE: the Admin-only constraints of this feature — deleting a sale (R10),
-- recording a withdrawal (R11), and deleting a withdrawal (R12) — are enforced in
-- the APPLICATION layer (actions/sales.ts + actions/withdrawals.ts via
-- requireAdmin), NOT in RLS. The Supabase path is open to any authenticated user,
-- exactly as Expense already is, while the product path always goes through the
-- server actions' requireUser()/requireAdmin() gates.
--
-- Withdrawal.recordedById is likewise assigned server-side from the session, not
-- constrained by RLS.
--
-- We ENABLE + FORCE RLS so even the table owner is subject to the policies.

ALTER TABLE public."Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sale" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Sale_select_authenticated"
  ON public."Sale"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Sale_insert_authenticated"
  ON public."Sale"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Sale_update_authenticated"
  ON public."Sale"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Sale_delete_authenticated"
  ON public."Sale"
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public."Withdrawal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Withdrawal" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Withdrawal_select_authenticated"
  ON public."Withdrawal"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Withdrawal_insert_authenticated"
  ON public."Withdrawal"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Withdrawal_update_authenticated"
  ON public."Withdrawal"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Withdrawal_delete_authenticated"
  ON public."Withdrawal"
  FOR DELETE
  TO authenticated
  USING (true);
