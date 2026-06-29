-- RLS for the task board tables (R3). Defense-in-depth: the server layer is the
-- primary guard (Prisma connects with elevated credentials and bypasses RLS),
-- but any access that goes through the Supabase client (PostgREST) is gated here.
--
-- Policy summary, identical for "Task" and "Subtask":
--   SELECT / INSERT / UPDATE / DELETE : allowed to ANY authenticated user.
-- This is an internal tool — both roles (ADMIN, EMPLOYEE) operate on all tasks,
-- with no per-row ownership scoping. Unauthenticated callers match no policy and
-- therefore see/affect zero rows (R3, R9 defense-in-depth).
--
-- We ENABLE + FORCE RLS so even the table owner is subject to the policies.

-- ── Task ─────────────────────────────────────────────────────────────────────
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Task" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Task_select_authenticated"
  ON public."Task"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Task_insert_authenticated"
  ON public."Task"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Task_update_authenticated"
  ON public."Task"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Task_delete_authenticated"
  ON public."Task"
  FOR DELETE
  TO authenticated
  USING (true);

-- ── Subtask ──────────────────────────────────────────────────────────────────
ALTER TABLE public."Subtask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subtask" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Subtask_select_authenticated"
  ON public."Subtask"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Subtask_insert_authenticated"
  ON public."Subtask"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Subtask_update_authenticated"
  ON public."Subtask"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Subtask_delete_authenticated"
  ON public."Subtask"
  FOR DELETE
  TO authenticated
  USING (true);
