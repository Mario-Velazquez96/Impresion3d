"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requireAdmin } from "@/lib/auth";
import { createWithdrawal, deleteWithdrawal } from "@/lib/services/finances";
import { createWithdrawalSchema } from "@/lib/validation/finance";

/**
 * Server actions for the withdrawals ledger (10_sales_and_balance). BOTH
 * mutations are Admin-only and resolve + authorize the actor FIRST, before any
 * validation or DB work, so a rejected caller writes nothing:
 *   - createWithdrawal: requireAdmin()  (R11 — only an Admin may take money out).
 *   - deleteWithdrawal: requireAdmin()  (R12).
 * A ForbiddenError (signed in, wrong role) ⇒ "Not authorized"; anything else ⇒
 * "Not authenticated" (R13). Hiding the controls in the UI is UX; these gates are
 * the requirement.
 *
 * THE AUDIT TRAIL IS SERVER-ASSIGNED (R15): createWithdrawalAction keeps the user
 * returned by requireAdmin() and passes `user.id` as `recordedById`. It is never
 * read from FormData — `createWithdrawalSchema` has no `recordedById` field, so a
 * value planted by a client is simply ignored and can never reach the service.
 */

const FINANCES_PATH = "/finances";

export type FieldError = { field: string; message: string };
export type WithdrawalActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: FieldError[] };

type AuthenticatedActor = { id: string };

/**
 * Resolve an admin, returning EITHER the actor OR a typed rejection (R11, R12,
 * R13). The actor is kept so `createWithdrawalAction` can attribute the
 * withdrawal to the session user. A non-admin is rejected with NO DB write.
 */
async function ensureAdmin(): Promise<
  { ok: true; user: AuthenticatedActor } | { ok: false; denied: WithdrawalActionResult }
> {
  try {
    const user = await requireAdmin();
    return { ok: true, user };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, denied: { ok: false, error: "Not authorized" } };
    }
    return { ok: false, denied: { ok: false, error: "Not authenticated" } };
  }
}

/** Map a Zod error to a WithdrawalActionResult with a top message + per-field errors. */
function zodFailure(
  issues: { path: (string | number)[]; message: string }[],
): WithdrawalActionResult {
  return {
    ok: false,
    error: issues[0]?.message ?? "Invalid input",
    fieldErrors: issues.map((i) => ({
      field: String(i.path[0] ?? "form"),
      message: i.message,
    })),
  };
}

/**
 * Record a withdrawal (R11, R14, R15). Admin-only, checked BEFORE validation: an
 * employee submitting an also-invalid payload gets "Not authorized", not a field
 * error — the authorization decision never depends on the input.
 */
export async function createWithdrawalAction(
  _prevState: WithdrawalActionResult | null,
  formData: FormData,
): Promise<WithdrawalActionResult> {
  const auth = await ensureAdmin();
  if (!auth.ok) return auth.denied;

  const parsed = createWithdrawalSchema.safeParse({
    amount: formData.get("amount"),
    date: formData.get("date"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    // The audit trail comes from the SESSION (R15), never from formData — any
    // `recordedById` in the payload is not in the schema and is ignored here.
    await createWithdrawal(parsed.data, auth.user.id);
  } catch {
    return { ok: false, error: "Failed to record withdrawal" };
  }

  revalidatePath(FINANCES_PATH);
  return { ok: true };
}

/**
 * Delete a withdrawal (R12). Admin-only: a non-admin is rejected before any DB
 * work, so nothing is deleted.
 */
export async function deleteWithdrawalAction(
  _prevState: WithdrawalActionResult | null,
  formData: FormData,
): Promise<WithdrawalActionResult> {
  const auth = await ensureAdmin();
  if (!auth.ok) return auth.denied;

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Missing id" };
  }

  try {
    await deleteWithdrawal(id);
  } catch {
    return { ok: false, error: "Failed to delete withdrawal" };
  }

  revalidatePath(FINANCES_PATH);
  return { ok: true };
}
