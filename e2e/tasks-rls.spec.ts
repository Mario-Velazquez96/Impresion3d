import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * RLS denial test for the task board tables (R3, R9).
 *
 * CREDENTIAL-GATED: requires a live dev/staging Supabase project and an EMPLOYEE
 * account. Talks to PostgREST directly via the Supabase client — the path RLS
 * actually guards (Prisma bypasses RLS). Needs:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (anon/publishable key)
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD
 * Skips when these are absent.
 *
 * The board's confirmed policy is that ANY authenticated user may read AND write
 * all tasks/subtasks (internal tool, no per-row ownership). The thing RLS must
 * still block is the UNAUTHENTICATED (anon) path. So this test asserts, using an
 * anonymous client (no sign-in):
 *   - an anon SELECT on "Task" / "Subtask" returns zero rows;
 *   - an anon INSERT into "Task" / "Subtask" is rejected / writes nothing (R3, R9).
 * It also confirms a signed-in employee CAN read tasks (the allowed path).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const empEmail = process.env.E2E_EMPLOYEE_EMAIL;
const empPassword = process.env.E2E_EMPLOYEE_PASSWORD;

const configured = Boolean(url && anonKey);
const haveEmployee = Boolean(empEmail && empPassword);

test("RLS denies the unauthenticated path on tasks/subtasks (R3, R9)", async () => {
  test.skip(
    !configured,
    "Set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY to run.",
  );

  // Anonymous client — never signed in.
  const anon = createClient(url!, anonKey!);

  // SELECT returns zero rows for the unauthenticated role.
  const taskRead = await anon.from("Task").select("id").limit(1);
  expect(taskRead.data?.length ?? 0).toBe(0);

  const subtaskRead = await anon.from("Subtask").select("id").limit(1);
  expect(subtaskRead.data?.length ?? 0).toBe(0);

  // INSERT writes nothing (no policy permits the anon role).
  const taskInsert = await anon
    .from("Task")
    .insert({ title: `rls-anon-${Date.now()}`, position: 0 })
    .select("id");
  expect(taskInsert.data?.length ?? 0).toBe(0);

  const subtaskInsert = await anon
    .from("Subtask")
    .insert({ title: `rls-anon-${Date.now()}`, position: 0, taskId: "x" })
    .select("id");
  expect(subtaskInsert.data?.length ?? 0).toBe(0);
});

test("RLS allows a signed-in employee to read tasks (allowed path)", async () => {
  test.skip(
    !configured || !haveEmployee,
    "Set Supabase + E2E_EMPLOYEE_EMAIL/PASSWORD to run.",
  );

  const supabase = createClient(url!, anonKey!);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: empEmail!,
    password: empPassword!,
  });
  expect(signInError).toBeNull();

  // SELECT succeeds for an authenticated user (no error). Row count may be 0 on a
  // fresh DB; the point is the read is permitted, not denied.
  const read = await supabase.from("Task").select("id").limit(1);
  expect(read.error).toBeNull();

  await supabase.auth.signOut();
});
