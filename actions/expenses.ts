"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requireAdmin, requireUser } from "@/lib/auth";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@/lib/services/expenses";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "@/lib/validation/expense";

/**
 * Server actions for expense tracking (05_expense_tracking). Every mutation
 * resolves + authorizes the actor FIRST, before any validation or DB work, so a
 * rejected caller writes nothing:
 *   - createExpense / updateExpense: requireUser()       (R3, R4).
 *   - deleteExpense:                 requireAdmin()       (R5, R7 — Admin-only).
 * Then Zod-validate (R8 cost, R9 URL), call the service, and
 * revalidatePath('/expenses'). A bad supplyTypeId surfaces as Prisma P2003 (FK
 * violation), mapped to a field error with no partial write.
 */

const EXPENSES_PATH = "/expenses";

export type FieldError = { field: string; message: string };
export type ExpenseActionResult =
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
async function ensureUser(): Promise<ExpenseActionResult | null> {
  try {
    await requireUser();
    return null;
  } catch {
    return { ok: false, error: "Not authenticated" };
  }
}

/**
 * Resolve an admin, returning a typed rejection instead of throwing (R7). A
 * non-admin is rejected with NO DB write.
 */
async function ensureAdmin(): Promise<ExpenseActionResult | null> {
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

/** Map a Zod error to an ExpenseActionResult with a top message + per-field errors. */
function zodFailure(
  issues: { path: (string | number)[]; message: string }[],
): ExpenseActionResult {
  return {
    ok: false,
    error: issues[0]?.message ?? "Invalid input",
    fieldErrors: issues.map((i) => ({
      field: String(i.path[0] ?? "form"),
      message: i.message,
    })),
  };
}

/** Friendly rejection for a FK that points at a non-existent supply type. */
function badReferenceFailure(): ExpenseActionResult {
  return {
    ok: false,
    error: "That supply type no longer exists",
    fieldErrors: [
      { field: "supplyTypeId", message: "That supply type no longer exists" },
    ],
  };
}

/** Create an expense (R3, R8, R9). */
export async function createExpenseAction(
  _prevState: ExpenseActionResult | null,
  formData: FormData,
): Promise<ExpenseActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = createExpenseSchema.safeParse({
    cost: formData.get("cost"),
    reason: formData.get("reason"),
    date: formData.get("date"),
    purchaseUrl: formData.get("purchaseUrl"),
    supplyTypeId: formData.get("supplyTypeId"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await createExpense(parsed.data);
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to create expense" };
  }

  revalidatePath(EXPENSES_PATH);
  return { ok: true };
}

/** Update an expense (R4, R8, R9). */
export async function updateExpenseAction(
  _prevState: ExpenseActionResult | null,
  formData: FormData,
): Promise<ExpenseActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = updateExpenseSchema.safeParse({
    id: formData.get("id"),
    cost: formData.get("cost"),
    reason: formData.get("reason"),
    date: formData.get("date"),
    purchaseUrl: formData.get("purchaseUrl"),
    supplyTypeId: formData.get("supplyTypeId"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await updateExpense(parsed.data);
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to update expense" };
  }

  revalidatePath(EXPENSES_PATH);
  return { ok: true };
}

/**
 * Delete an expense (R5, R7). Admin-only: a non-admin is rejected before any DB
 * work, so nothing is written.
 */
export async function deleteExpenseAction(
  _prevState: ExpenseActionResult | null,
  formData: FormData,
): Promise<ExpenseActionResult> {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Missing id" };
  }

  try {
    await deleteExpense(id);
  } catch {
    return { ok: false, error: "Failed to delete expense" };
  }

  revalidatePath(EXPENSES_PATH);
  return { ok: true };
}
