import "server-only";

import { createClient } from "@supabase/supabase-js";

import { db } from "@/lib/db";
import type { InviteUserInput, Role, SetRoleInput } from "@/lib/validation/user";

/**
 * Business logic for the User table. All authorization happens in the caller
 * (server actions / lib/auth.ts) — these functions assume the caller has already
 * resolved and authorized the actor. Prisma bypasses RLS, so the server layer is
 * the real guard (RLS on "User" is defense-in-depth).
 */

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Supabase Admin client built per call with the SECRET key (server-only, never
 * NEXT_PUBLIC_*). Used exclusively for admin auth operations (creating users).
 * This is the single place the secret key is read.
 */
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY",
    );
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** All users, newest first. Caller must be an admin (enforced by requireAdmin). */
export async function listUsers(): Promise<UserRecord[]> {
  return db.user.findMany({ orderBy: { createdAt: "desc" } });
}

/**
 * Ensure a User row exists for an authenticated Supabase identity (R6). The
 * first-ever user becomes ADMIN; everyone else defaults to EMPLOYEE. Idempotent:
 * an existing row is returned unchanged.
 */
export async function ensureUserRow(input: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<UserRecord> {
  const existing = await db.user.findUnique({ where: { id: input.id } });
  if (existing) {
    return existing;
  }

  // First user in the system is the admin (R6).
  const userCount = await db.user.count();
  const role: Role = userCount === 0 ? "ADMIN" : "EMPLOYEE";

  // Derive a non-empty name: provided name, else the local part of the email.
  const fallbackName = input.email.split("@")[0] || input.email;
  const name = input.name?.trim() ? input.name.trim() : fallbackName;

  return db.user.create({
    data: { id: input.id, email: input.email, name, role },
  });
}

/**
 * Invite a user (R8): create the Supabase auth user via the Admin API with the
 * admin-entered temporary password and the email auto-confirmed so they can sign
 * in immediately, then insert the matching User row. Caller must already have
 * validated `input` with inviteUserSchema and authorized via requireAdmin.
 */
export async function inviteUser(input: InviteUserInput): Promise<UserRecord> {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.tempPassword,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create auth user");
  }

  return db.user.create({
    data: {
      id: data.user.id,
      email: input.email,
      name: input.name,
      role: input.role,
    },
  });
}

/**
 * Persist a user's role (R10). Caller must already have validated `input` with
 * setRoleSchema and authorized via requireAdmin.
 */
export async function setUserRole(input: SetRoleInput): Promise<UserRecord> {
  return db.user.update({
    where: { id: input.userId },
    data: { role: input.role },
  });
}
