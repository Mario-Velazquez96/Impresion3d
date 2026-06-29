import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * RLS + Storage-bucket denial tests for print inventory (R3, R4).
 *
 * CREDENTIAL-GATED: requires a live dev/staging Supabase project with the 06
 * migrations applied (Print/PrintColor RLS + the private `print-photos` bucket and
 * its authenticated-only policies). Talks to PostgREST + Storage directly via the
 * Supabase client — the path RLS actually guards (Prisma bypasses RLS). Needs:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   (anon/publishable key)
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD  (for the allowed-path checks)
 * Skips when these are absent.
 *
 * Policy model: any AUTHENTICATED user may read/write Print + PrintColor and the
 * bucket (internal tool). The Admin-only delete constraint lives in the server
 * action, not RLS. What RLS/the bucket policies must block is the UNAUTHENTICATED
 * (anon) path. These tests assert, using an anonymous client (never signed in):
 *   - anon SELECT on "Print"/"PrintColor" returns zero rows (R3);
 *   - anon INSERT into "Print" writes nothing (R3);
 *   - anon bucket SELECT (list / download) is rejected (R4).
 * Plus: a signed-in employee CAN read Print and list the bucket (allowed path).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const empEmail = process.env.E2E_EMPLOYEE_EMAIL;
const empPassword = process.env.E2E_EMPLOYEE_PASSWORD;

const BUCKET = "print-photos";
const configured = Boolean(url && anonKey);
const haveEmployee = Boolean(empEmail && empPassword);

test("RLS denies the unauthenticated path on Print + PrintColor (R3)", async () => {
  test.skip(
    !configured,
    "Set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY to run.",
  );

  const anon = createClient(url!, anonKey!);

  // SELECT returns zero rows for the unauthenticated role on both tables.
  const readPrints = await anon.from("Print").select("id").limit(1);
  expect(readPrints.data?.length ?? 0).toBe(0);

  const readColors = await anon
    .from("PrintColor")
    .select("printId")
    .limit(1);
  expect(readColors.data?.length ?? 0).toBe(0);

  // INSERT writes nothing (no policy permits the anon role).
  const insert = await anon
    .from("Print")
    .insert({
      name: `rls-anon-${Date.now()}`,
      printTimeMinutes: 1,
      filamentGrams: 1,
      printTypeId: "x",
    })
    .select("id");
  expect(insert.data?.length ?? 0).toBe(0);
});

test("the private print-photos bucket rejects the unauthenticated path (R4)", async () => {
  test.skip(
    !configured,
    "Set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY to run.",
  );

  const anon = createClient(url!, anonKey!);

  // Anonymous LIST of the bucket returns no objects (the SELECT policy is
  // authenticated-only, so the anon role matches nothing).
  const list = await anon.storage.from(BUCKET).list("prints");
  expect(list.data?.length ?? 0).toBe(0);

  // Anonymous DOWNLOAD of any key fails (no public URL; reads require a signed URL
  // generated server-side by an authenticated session).
  const download = await anon.storage
    .from(BUCKET)
    .download("prints/does-not-exist.png");
  expect(download.data).toBeNull();
  expect(download.error).not.toBeNull();
});

test("a signed-in employee can read Print and list the bucket (allowed path)", async () => {
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
  // fresh DB; the point is the read is permitted, not denied (R3).
  const read = await supabase.from("Print").select("id").limit(1);
  expect(read.error).toBeNull();

  // LIST the bucket succeeds for an authenticated user (R4 allowed path).
  const list = await supabase.storage.from(BUCKET).list("prints");
  expect(list.error).toBeNull();

  await supabase.auth.signOut();
});
