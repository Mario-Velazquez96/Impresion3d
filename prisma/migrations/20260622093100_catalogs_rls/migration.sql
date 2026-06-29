-- RLS for the four catalog tables (R2). Defense-in-depth: the server layer is the
-- primary guard (Prisma connects with elevated credentials and bypasses RLS), but
-- any access that goes through the Supabase client (PostgREST) is gated here.
--
-- Policy summary, identical for every catalog table:
--   SELECT : any AUTHENTICATED user may read (later domain forms need the values).
--   INSERT/UPDATE/DELETE : only an ADMIN, via the public.is_admin() predicate
--                          created in the 01 user_rls migration (SECURITY DEFINER,
--                          so it is not itself subject to "User" RLS).
--
-- We ENABLE + FORCE RLS so even the table owner is subject to the policies.

-- ── Color ────────────────────────────────────────────────────────────────────
ALTER TABLE public."Color" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Color" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Color_select_authenticated"
  ON public."Color"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Color_insert_admin_only"
  ON public."Color"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Color_update_admin_only"
  ON public."Color"
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Color_delete_admin_only"
  ON public."Color"
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ── PrintType ────────────────────────────────────────────────────────────────
ALTER TABLE public."PrintType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PrintType" FORCE ROW LEVEL SECURITY;

CREATE POLICY "PrintType_select_authenticated"
  ON public."PrintType"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "PrintType_insert_admin_only"
  ON public."PrintType"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "PrintType_update_admin_only"
  ON public."PrintType"
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "PrintType_delete_admin_only"
  ON public."PrintType"
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ── SupplyType ───────────────────────────────────────────────────────────────
ALTER TABLE public."SupplyType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupplyType" FORCE ROW LEVEL SECURITY;

CREATE POLICY "SupplyType_select_authenticated"
  ON public."SupplyType"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "SupplyType_insert_admin_only"
  ON public."SupplyType"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "SupplyType_update_admin_only"
  ON public."SupplyType"
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "SupplyType_delete_admin_only"
  ON public."SupplyType"
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ── TaskCategory ─────────────────────────────────────────────────────────────
ALTER TABLE public."TaskCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskCategory" FORCE ROW LEVEL SECURITY;

CREATE POLICY "TaskCategory_select_authenticated"
  ON public."TaskCategory"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "TaskCategory_insert_admin_only"
  ON public."TaskCategory"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "TaskCategory_update_admin_only"
  ON public."TaskCategory"
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "TaskCategory_delete_admin_only"
  ON public."TaskCategory"
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
