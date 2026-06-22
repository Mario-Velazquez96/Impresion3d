import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * RLS denial test for the catalog tables (R2, R7).
 *
 * CREDENTIAL-GATED: requires a live dev/staging Supabase project, the seed
 * applied (so a Color row exists to target), and an EMPLOYEE account. Talks to
 * PostgREST directly via the Supabase client — the path RLS actually guards
 * (Prisma bypasses RLS). Needs:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (anon/publishable key)
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD
 * Skips when these are absent.
 *
 * Asserts, for "Color" (representative of all four catalogs which share the
 * identical policy set):
 *   - an EMPLOYEE may SELECT (read) catalog rows;
 *   - an EMPLOYEE cannot INSERT a new value;
 *   - an EMPLOYEE cannot UPDATE an existing value (affects zero rows);
 *   - an EMPLOYEE cannot DELETE an existing value (affects zero rows).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const empEmail = process.env.E2E_EMPLOYEE_EMAIL;
const empPassword = process.env.E2E_EMPLOYEE_PASSWORD;

const configured = Boolean(url && anonKey && empEmail && empPassword);

test("RLS lets an employee read catalogs but blocks writes (R2, R7)", async () => {
  test.skip(!configured, "Set Supabase + employee test account to run.");

  const supabase = createClient(url!, anonKey!);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: empEmail!,
    password: empPassword!,
  });
  expect(signInError).toBeNull();

  // SELECT is allowed for any authenticated user.
  const read = await supabase.from("Color").select("id,name,hex").limit(1);
  expect(read.error).toBeNull();
  expect((read.data?.length ?? 0) >= 1).toBe(true);
  const target = read.data![0];

  // INSERT is denied (no row returned / RLS error).
  const insert = await supabase
    .from("Color")
    .insert({ name: `rls-emp-${Date.now()}`, hex: "#123456" })
    .select("id");
  expect(insert.data?.length ?? 0).toBe(0);

  // UPDATE affects zero rows (admin-only).
  const update = await supabase
    .from("Color")
    .update({ hex: "#000000" })
    .eq("id", target.id)
    .select("id");
  expect(update.data?.length ?? 0).toBe(0);

  // DELETE affects zero rows (admin-only).
  const del = await supabase
    .from("Color")
    .delete()
    .eq("id", target.id)
    .select("id");
  expect(del.data?.length ?? 0).toBe(0);

  await supabase.auth.signOut();
});
