import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * RLS denial test for the Sale and Withdrawal tables (R16).
 *
 * CREDENTIAL-GATED: requires a live dev/staging Supabase project and (for the
 * allowed-path check) an EMPLOYEE account. Talks to PostgREST directly via the
 * Supabase client — the path RLS actually guards (PRISMA BYPASSES RLS, which is
 * exactly why the server actions carry the real authorization). Needs:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (anon/publishable key)
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD
 * Skips when these are absent.
 *
 * Sale/Withdrawal policy: ANY authenticated user may read AND write (internal
 * tool, no per-row ownership). The Admin-only constraints of this feature —
 * deleting a sale (R10), recording/deleting a withdrawal (R11, R12) — are
 * enforced in the server actions, NOT in RLS. The thing RLS must block is the
 * UNAUTHENTICATED (anon) path. So this test asserts, using an anonymous client:
 *   - an anon SELECT on "Sale"/"Withdrawal" returns zero rows;
 *   - an anon INSERT into either is rejected / writes nothing (R16).
 * It also confirms a signed-in employee CAN read both (the allowed path, R1).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const empEmail = process.env.E2E_EMPLOYEE_EMAIL;
const empPassword = process.env.E2E_EMPLOYEE_PASSWORD;

const configured = Boolean(url && anonKey);
const haveEmployee = Boolean(empEmail && empPassword);

test("RLS denies the unauthenticated path on sales (R16)", async () => {
  test.skip(!configured, "Set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY to run.");

  // Anonymous client — never signed in.
  const anon = createClient(url!, anonKey!);

  // SELECT returns zero rows for the unauthenticated role.
  const read = await anon.from("Sale").select("id").limit(1);
  expect(read.data?.length ?? 0).toBe(0);

  // INSERT writes nothing (no policy permits the anon role).
  const insert = await anon
    .from("Sale")
    .insert({
      amount: 1.0,
      date: new Date().toISOString(),
      printId: "x",
    })
    .select("id");
  expect(insert.data?.length ?? 0).toBe(0);
});

test("RLS denies the unauthenticated path on withdrawals (R16)", async () => {
  test.skip(!configured, "Set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY to run.");

  const anon = createClient(url!, anonKey!);

  const read = await anon.from("Withdrawal").select("id").limit(1);
  expect(read.data?.length ?? 0).toBe(0);

  const insert = await anon
    .from("Withdrawal")
    .insert({
      amount: 1.0,
      date: new Date().toISOString(),
      reason: `rls-anon-${Date.now()}`,
      recordedById: "x",
    })
    .select("id");
  expect(insert.data?.length ?? 0).toBe(0);
});

test("RLS allows a signed-in employee to read both ledgers (allowed path, R1)", async () => {
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
  const sales = await supabase.from("Sale").select("id").limit(1);
  expect(sales.error).toBeNull();

  const withdrawals = await supabase.from("Withdrawal").select("id").limit(1);
  expect(withdrawals.error).toBeNull();

  await supabase.auth.signOut();
});
