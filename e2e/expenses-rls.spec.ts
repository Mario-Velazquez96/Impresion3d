import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * RLS denial test for the Expense table (R2).
 *
 * CREDENTIAL-GATED: requires a live dev/staging Supabase project and (for the
 * allowed-path check) an EMPLOYEE account. Talks to PostgREST directly via the
 * Supabase client — the path RLS actually guards (Prisma bypasses RLS). Needs:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (anon/publishable key)
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD
 * Skips when these are absent.
 *
 * Expense policy: ANY authenticated user may read AND write expenses (internal
 * tool, no per-row ownership). The Admin-only constraint on the product DELETE
 * path (R7) is enforced in the server action, not in RLS. The thing RLS must
 * block is the UNAUTHENTICATED (anon) path. So this test asserts, using an
 * anonymous client (no sign-in):
 *   - an anon SELECT on "Expense" returns zero rows;
 *   - an anon INSERT into "Expense" is rejected / writes nothing (R2).
 * It also confirms a signed-in employee CAN read expenses (the allowed path).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const empEmail = process.env.E2E_EMPLOYEE_EMAIL;
const empPassword = process.env.E2E_EMPLOYEE_PASSWORD;

const configured = Boolean(url && anonKey);
const haveEmployee = Boolean(empEmail && empPassword);

test("RLS denies the unauthenticated path on expenses (R2)", async () => {
  test.skip(
    !configured,
    "Set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY to run.",
  );

  // Anonymous client — never signed in.
  const anon = createClient(url!, anonKey!);

  // SELECT returns zero rows for the unauthenticated role.
  const read = await anon.from("Expense").select("id").limit(1);
  expect(read.data?.length ?? 0).toBe(0);

  // INSERT writes nothing (no policy permits the anon role).
  const insert = await anon
    .from("Expense")
    .insert({
      cost: 1.0,
      reason: `rls-anon-${Date.now()}`,
      date: new Date().toISOString(),
      supplyTypeId: "x",
    })
    .select("id");
  expect(insert.data?.length ?? 0).toBe(0);
});

test("RLS allows a signed-in employee to read expenses (allowed path)", async () => {
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
  const read = await supabase.from("Expense").select("id").limit(1);
  expect(read.error).toBeNull();

  await supabase.auth.signOut();
});
