"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requireAdmin, requireUser } from "@/lib/auth";
import { createSale, deleteSale } from "@/lib/services/finances";
import { createSaleSchema } from "@/lib/validation/finance";

/**
 * Server actions for the sales ledger (10_sales_and_balance). Every mutation
 * resolves + authorizes the actor FIRST, before any validation or DB work, so a
 * rejected caller writes nothing:
 *   - createSale: requireUser()   (R10 — ANY authenticated user may record a sale).
 *   - deleteSale: requireAdmin()  (R10 — Admin-only, consistent with expense and
 *                                  print deletes).
 * Then Zod-validate (R14 amount, R8 required print), call the service, and
 * revalidate. A bad printId surfaces as Prisma P2003 (FK violation), mapped to a
 * field error with no partial write (R8).
 *
 * `/inventory` is revalidated alongside `/finances` on create/delete because a
 * print's DELETABILITY changes with its first/last sale (R9).
 */

const FINANCES_PATH = "/finances";
const INVENTORY_PATH = "/inventory";

export type FieldError = { field: string; message: string };
export type SaleActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: FieldError[] };

/** True when a thrown error is Prisma's foreign-key violation (P2003). */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2003"
  );
}

/** Resolve the authenticated user, returning a typed rejection instead of throwing. */
async function ensureUser(): Promise<SaleActionResult | null> {
  try {
    await requireUser();
    return null;
  } catch {
    return { ok: false, error: "Not authenticated" };
  }
}

/**
 * Resolve an admin, returning a typed rejection instead of throwing (R10, R13). A
 * non-admin is rejected with NO DB write.
 */
async function ensureAdmin(): Promise<SaleActionResult | null> {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "Not authorized" };
    }
    return { ok: false, error: "Not authenticated" };
  }
}

/** Map a Zod error to a SaleActionResult with a top message + per-field errors. */
function zodFailure(
  issues: { path: (string | number)[]; message: string }[],
): SaleActionResult {
  return {
    ok: false,
    error: issues[0]?.message ?? "Invalid input",
    fieldErrors: issues.map((i) => ({
      field: String(i.path[0] ?? "form"),
      message: i.message,
    })),
  };
}

/** Friendly rejection for a FK that points at a non-existent print (R8). */
function badReferenceFailure(): SaleActionResult {
  return {
    ok: false,
    error: "That print no longer exists",
    fieldErrors: [{ field: "printId", message: "That print no longer exists" }],
  };
}

/** Record a sale (R8, R10, R14) — available to ANY authenticated user. */
export async function createSaleAction(
  _prevState: SaleActionResult | null,
  formData: FormData,
): Promise<SaleActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = createSaleSchema.safeParse({
    amount: formData.get("amount"),
    date: formData.get("date"),
    printId: formData.get("printId"),
    buyer: formData.get("buyer"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await createSale(parsed.data);
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to record sale" };
  }

  revalidatePath(FINANCES_PATH);
  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}

/**
 * Delete a sale (R10). Admin-only: a non-admin is rejected before any DB work, so
 * nothing is deleted.
 */
export async function deleteSaleAction(
  _prevState: SaleActionResult | null,
  formData: FormData,
): Promise<SaleActionResult> {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Missing id" };
  }

  try {
    await deleteSale(id);
  } catch {
    return { ok: false, error: "Failed to delete sale" };
  }

  revalidatePath(FINANCES_PATH);
  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}
