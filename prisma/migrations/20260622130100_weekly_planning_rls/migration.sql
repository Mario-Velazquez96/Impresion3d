-- RLS for the WeekPlan, WeekPlanColor, and WeekPlanItem tables (R2). Defense-in-
-- depth: the server layer is the primary guard (Prisma connects with elevated
-- credentials and bypasses RLS), but any access through the Supabase client
-- (PostgREST) is gated here.
--
-- Policy summary (all three tables):
--   SELECT / INSERT / UPDATE / DELETE : allowed to ANY authenticated user.
-- This is an internal tool — both roles (ADMIN, EMPLOYEE) read/write the shared
-- week plan, with no per-row ownership scoping. Unauthenticated callers match no
-- policy and therefore see/affect zero rows (R2, R10).
--
-- We ENABLE + FORCE RLS so even the table owner is subject to the policies.

ALTER TABLE public."WeekPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WeekPlan" FORCE ROW LEVEL SECURITY;

CREATE POLICY "WeekPlan_select_authenticated"
  ON public."WeekPlan"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "WeekPlan_insert_authenticated"
  ON public."WeekPlan"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "WeekPlan_update_authenticated"
  ON public."WeekPlan"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "WeekPlan_delete_authenticated"
  ON public."WeekPlan"
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public."WeekPlanColor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WeekPlanColor" FORCE ROW LEVEL SECURITY;

CREATE POLICY "WeekPlanColor_select_authenticated"
  ON public."WeekPlanColor"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "WeekPlanColor_insert_authenticated"
  ON public."WeekPlanColor"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "WeekPlanColor_update_authenticated"
  ON public."WeekPlanColor"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "WeekPlanColor_delete_authenticated"
  ON public."WeekPlanColor"
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public."WeekPlanItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WeekPlanItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY "WeekPlanItem_select_authenticated"
  ON public."WeekPlanItem"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "WeekPlanItem_insert_authenticated"
  ON public."WeekPlanItem"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "WeekPlanItem_update_authenticated"
  ON public."WeekPlanItem"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "WeekPlanItem_delete_authenticated"
  ON public."WeekPlanItem"
  FOR DELETE
  TO authenticated
  USING (true);
