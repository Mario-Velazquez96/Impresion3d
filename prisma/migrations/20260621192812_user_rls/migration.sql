-- RLS for public."User" (defense-in-depth; the server layer is the primary
-- guard since Prisma connects with elevated credentials and bypasses RLS).
--
-- Policy summary (R2):
--   SELECT : a user may read their own row; an ADMIN may read all rows.
--   UPDATE : only an ADMIN may update rows (role changes go through the server).
--   INSERT/DELETE : no policy => denied for every non-elevated (client) role.
--                   Rows are created server-side via the secret key (which
--                   bypasses RLS), so clients never insert or delete directly.

-- Admin check as a SECURITY DEFINER function. It runs with the function owner's
-- privileges, so the lookup against "User" inside it is NOT itself subject to
-- the "User" RLS policies. This avoids infinite recursion when a SELECT/UPDATE
-- policy on "User" needs to know whether the caller is an admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."User" u
    WHERE u.id = (SELECT auth.uid())::text
      AND u.role = 'ADMIN'
  );
$$;

-- Enable + force RLS so even the table owner is subject to the policies.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" FORCE ROW LEVEL SECURITY;

-- SELECT: own row OR caller is an admin.
CREATE POLICY "User_select_self_or_admin"
  ON public."User"
  FOR SELECT
  USING (
    id = (SELECT auth.uid())::text
    OR public.is_admin()
  );

-- UPDATE: admin-only (covers role changes). USING gates which rows are visible
-- to update; WITH CHECK gates the post-update row.
CREATE POLICY "User_update_admin_only"
  ON public."User"
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No INSERT or DELETE policies: with RLS enabled, the absence of a permissive
-- policy denies those actions for client roles. Server-side creation uses the
-- secret key, which bypasses RLS entirely.
