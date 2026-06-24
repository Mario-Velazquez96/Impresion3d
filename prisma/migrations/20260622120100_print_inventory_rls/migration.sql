-- RLS for the Print and PrintColor tables (R3). Defense-in-depth: the server layer
-- is the primary guard (Prisma connects with elevated credentials and bypasses
-- RLS), but any access that goes through the Supabase client (PostgREST) is gated
-- here.
--
-- Policy summary (both tables):
--   SELECT / INSERT / UPDATE / DELETE : allowed to ANY authenticated user.
-- This is an internal tool — both roles (ADMIN, EMPLOYEE) read/write the inventory,
-- with no per-row ownership scoping. Unauthenticated callers match no policy and
-- therefore see/affect zero rows (R3).
--
-- NOTE: the Admin-only constraint on print DELETE (R7/R9) is enforced in the
-- application layer (actions/prints.ts via requireAdmin), NOT in RLS — the Supabase
-- delete path is open to any authenticated user as defense-in-depth, while the
-- product delete path always goes through the server action's requireAdmin() gate.
--
-- We ENABLE + FORCE RLS so even the table owner is subject to the policies.

ALTER TABLE public."Print" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Print" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Print_select_authenticated"
  ON public."Print"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Print_insert_authenticated"
  ON public."Print"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Print_update_authenticated"
  ON public."Print"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Print_delete_authenticated"
  ON public."Print"
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public."PrintColor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PrintColor" FORCE ROW LEVEL SECURITY;

CREATE POLICY "PrintColor_select_authenticated"
  ON public."PrintColor"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "PrintColor_insert_authenticated"
  ON public."PrintColor"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "PrintColor_update_authenticated"
  ON public."PrintColor"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "PrintColor_delete_authenticated"
  ON public."PrintColor"
  FOR DELETE
  TO authenticated
  USING (true);
