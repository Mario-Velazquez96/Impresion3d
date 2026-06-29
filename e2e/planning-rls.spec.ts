import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * RLS denial tests for weekly planning (R2, R10).
 *
 * CREDENTIAL-GATED: requires a live dev/staging Supabase project with the planning
 * migrations applied (WeekPlan/WeekPlanColor/WeekPlanItem RLS). Talks to PostgREST
 * directly via the Supabase client — the path RLS actually guards (Prisma bypasses
 * RLS). Needs:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY        (anon/publishable key)
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD  (for the allowed-path check)
 * Skips when these are absent.
 *
 * Policy model: any AUTHENTICATED user may read/write all three planning tables
 * (internal shared plan). What RLS must block is the UNAUTHENTICATED (anon) path.
 * Using an anonymous client (never signed in), these tests assert:
 *   - anon SELECT on each table returns zero rows (R2);
 *   - anon INSERT into "WeekPlan" writes nothing (R2, R10).
 * Plus: a signed-in employee CAN read the tables (allowed path).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const empEmail = process.env.E2E_EMPLOYEE_EMAIL;
const empPassword = process.env.E2E_EMPLOYEE_PASSWORD;

const configured = Boolean(url && anonKey);
const haveEmployee = Boolean(empEmail && empPassword);

test("RLS denies the unauthenticated path on the planning tables (R2)", async () => {
  test.skip(
    !configured,
    "Set NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY to run.",
  );

  const anon = createClient(url!, anonKey!);

  for (const table of ["WeekPlan", "WeekPlanColor", "WeekPlanItem"]) {
    const read = await anon.from(table).select("*").limit(1);
    expect(read.data?.length ?? 0).toBe(0);
  }

  // INSERT writes nothing (no policy permits the anon role) (R2, R10).
  const insert = await anon
    .from("WeekPlan")
    .insert({
      weekStartDate: new Date().toISOString(),
      createdById: "x",
    })
    .select("id");
  expect(insert.data?.length ?? 0).toBe(0);
});

test("a signed-in employee can read the planning tables (allowed path)", async () => {
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
  // fresh DB; the point is the read is permitted, not denied (R2).
  for (const table of ["WeekPlan", "WeekPlanColor", "WeekPlanItem"]) {
    const read = await supabase.from(table).select("*").limit(1);
    expect(read.error).toBeNull();
  }

  await supabase.auth.signOut();
});
