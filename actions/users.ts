"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ForbiddenError, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  inviteUser as inviteUserService,
  setUserRole as setUserRoleService,
} from "@/lib/services/users";
import { inviteUserSchema, setRoleSchema } from "@/lib/validation/user";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Sign the current user out and send them to /login. Uses the per-request server
 * Supabase client so the session cookies are cleared on the response.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Invite a user (R8, R8a, R9). Admin-only: requireAdmin runs first so a
 * non-admin is rejected before any validation or DB/Admin-API call. Input is
 * Zod-validated; a too-short temp password is rejected with no auth user or User
 * row created.
 */
export async function inviteUser(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "Not authorized" };
    }
    return { ok: false, error: "Not authenticated" };
  }

  const parsed = inviteUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    tempPassword: formData.get("tempPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await inviteUserService(parsed.data);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to invite user",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Change a user's role (R9, R10). Admin-only; validates input, persists the new
 * role, and revalidates the users page.
 */
export async function setUserRole(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "Not authorized" };
    }
    return { ok: false, error: "Not authenticated" };
  }

  const parsed = setRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await setUserRoleService(parsed.data);
  } catch {
    return { ok: false, error: "Failed to update role" };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
