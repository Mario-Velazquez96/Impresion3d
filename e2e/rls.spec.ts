import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * RLS denial test for public."User" (R2).
 *
 * CREDENTIAL-GATED: requires a live dev/staging Supabase project and two seeded
 * accounts whose User rows exist. Talks to PostgREST directly via the Supabase
 * client (the path RLS actually guards — Prisma bypasses RLS). Needs:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (anon/publishable key)
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD  (an EMPLOYEE)
 *   E2E_ADMIN_EMAIL  (a different user's email — the target row the employee
 *                     must NOT be able to read or modify)
 * Skips when these are absent.
 *
 * Asserts:
 *   - an EMPLOYEE can read their own row;
 *   - an EMPLOYEE cannot read another user's row (filtered out by RLS SELECT);
 *   - an EMPLOYEE cannot update another user's role (RLS UPDATE admin-only).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const empEmail = process.env.E2E_EMPLOYEE_EMAIL;
const empPassword = process.env.E2E_EMPLOYEE_PASSWORD;
const otherEmail = process.env.E2E_ADMIN_EMAIL;

const configured = Boolean(
  url && anonKey && empEmail && empPassword && otherEmail,
);

test("RLS denies an employee reading others' rows or editing roles (R2)", async () => {
  test.skip(!configured, "Set Supabase + employee/other test accounts to run.");

  const supabase = createClient(url!, anonKey!);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: empEmail!,
    password: empPassword!,
  });
  expect(signInError).toBeNull();

  // Self-read is allowed.
  const self = await supabase
    .from("User")
    .select("id,email,role")
    .eq("email", empEmail!);
  expect(self.error).toBeNull();
  expect(self.data?.length).toBe(1);

  // Reading another user's row returns zero rows (RLS filters it out).
  const others = await supabase
    .from("User")
    .select("id,email,role")
    .eq("email", otherEmail!);
  expect(others.error).toBeNull();
  expect(others.data?.length).toBe(0);

  // Updating another user's role affects zero rows (RLS UPDATE is admin-only).
  const update = await supabase
    .from("User")
    .update({ role: "EMPLOYEE" })
    .eq("email", otherEmail!)
    .select("id");
  expect(update.data?.length ?? 0).toBe(0);

  await supabase.auth.signOut();
});
