import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ensureUserRow, type UserRecord } from "@/lib/services/users";

/**
 * Server-layer authorization helpers. Every Prisma read/write is authorized here
 * (Prisma bypasses RLS), built on Supabase `getUser()` — which re-validates the
 * token with the auth server — never `getSession()`.
 */

export class UnauthenticatedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Resolve the current authenticated user's app row, or null when there is no
 * authenticated Supabase user. Creates the User row on first login (R6) via
 * ensureUserRow.
 */
export async function getCurrentUser(): Promise<UserRecord | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return null;
  }

  const metadataName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;

  return ensureUserRow({ id: user.id, email: user.email, name: metadataName });
}

/** Return the authenticated user or throw UnauthenticatedError (R3, R7). */
export async function requireUser(): Promise<UserRecord> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}

/** Return the authenticated user if they are an admin, else throw (R7, R9). */
export async function requireAdmin(): Promise<UserRecord> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new ForbiddenError();
  }
  return user;
}
