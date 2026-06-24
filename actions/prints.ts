"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requireAdmin, requireUser } from "@/lib/auth";
import {
  createPrint,
  deletePrint,
  getPrint,
  updatePrint,
} from "@/lib/services/prints";
import { replacePhoto, uploadPhoto } from "@/lib/storage";
import {
  createPrintSchema,
  updatePrintSchema,
  validatePhotoFile,
} from "@/lib/validation/print";

/**
 * Server actions for print inventory (06_print_inventory). Every mutation resolves
 * + authorizes the actor FIRST, before any validation, Storage, or DB work, so a
 * rejected caller writes nothing:
 *   - createPrint / updatePrint: requireUser()      (R5, R6).
 *   - deletePrint:               requireAdmin()      (R7, R9 — Admin-only).
 *
 * ORDERING THAT GUARANTEES "store nothing on rejection" (R10): we Zod-validate the
 * fields AND the photo file BEFORE uploading the object or writing any row. Only
 * once everything validates do we upload the photo, then persist the row + color
 * set (the color set is replaced atomically in the service transaction).
 */

const INVENTORY_PATH = "/inventory";

export type FieldError = { field: string; message: string };
export type PrintActionResult =
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
async function ensureUser(): Promise<PrintActionResult | null> {
  try {
    await requireUser();
    return null;
  } catch {
    return { ok: false, error: "Not authenticated" };
  }
}

/**
 * Resolve an admin, returning a typed rejection instead of throwing (R9). A
 * non-admin is rejected with NO DB or Storage write.
 */
async function ensureAdmin(): Promise<PrintActionResult | null> {
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

/** Map a Zod error to a PrintActionResult with a top message + per-field errors. */
function zodFailure(
  issues: { path: (string | number)[]; message: string }[],
): PrintActionResult {
  return {
    ok: false,
    error: issues[0]?.message ?? "Invalid input",
    fieldErrors: issues.map((i) => ({
      field: String(i.path[0] ?? "form"),
      message: i.message,
    })),
  };
}

/** A single field error result. */
function fieldFailure(field: string, message: string): PrintActionResult {
  return { ok: false, error: message, fieldErrors: [{ field, message }] };
}

/** Friendly rejection for a FK pointing at a non-existent print type / color. */
function badReferenceFailure(): PrintActionResult {
  return {
    ok: false,
    error: "That print type or color no longer exists",
    fieldErrors: [
      {
        field: "printTypeId",
        message: "That print type or color no longer exists",
      },
    ],
  };
}

/** Collect repeated `colorIds` FormData entries into a string array. */
function readColorIds(formData: FormData): string[] {
  return formData
    .getAll("colorIds")
    .filter((v): v is string => typeof v === "string");
}

/**
 * Pull a usable upload File from FormData, or null when none was provided. A
 * browser sends an empty file input as a zero-byte File with an empty name; that
 * is treated as "no photo".
 */
function readPhotoFile(formData: FormData): File | null {
  const value = formData.get("photo");
  if (value instanceof File && value.size > 0 && value.name !== "") {
    return value;
  }
  return null;
}

/** Create a print (R5, R10). */
export async function createPrintAction(
  _prevState: PrintActionResult | null,
  formData: FormData,
): Promise<PrintActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  // 1. Validate fields FIRST (store nothing on rejection — R10).
  const parsed = createPrintSchema.safeParse({
    name: formData.get("name"),
    printTimeMinutes: formData.get("printTimeMinutes"),
    filamentGrams: formData.get("filamentGrams"),
    documentUrl: formData.get("documentUrl"),
    printTypeId: formData.get("printTypeId"),
    colorIds: readColorIds(formData),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  // 2. Validate the photo file (if any) BEFORE uploading anything (R10).
  const file = readPhotoFile(formData);
  if (file) {
    const check = validatePhotoFile(file);
    if (!check.ok) return fieldFailure("photo", check.message);
  }

  // 3. Only now upload the photo, then persist the row + color set.
  try {
    const photoPath = file ? await uploadPhoto(file) : null;
    await createPrint(parsed.data, photoPath);
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to create print" };
  }

  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}

/** Update a print (R6, R10). */
export async function updatePrintAction(
  _prevState: PrintActionResult | null,
  formData: FormData,
): Promise<PrintActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = updatePrintSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    printTimeMinutes: formData.get("printTimeMinutes"),
    filamentGrams: formData.get("filamentGrams"),
    documentUrl: formData.get("documentUrl"),
    printTypeId: formData.get("printTypeId"),
    colorIds: readColorIds(formData),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  const file = readPhotoFile(formData);
  if (file) {
    const check = validatePhotoFile(file);
    if (!check.ok) return fieldFailure("photo", check.message);
  }

  try {
    // Replace the photo only when a new file was provided; otherwise keep the
    // existing key untouched (pass undefined so the service leaves it alone).
    let photoPath: string | null | undefined = undefined;
    if (file) {
      const existing = await getPrint(parsed.data.id);
      photoPath = await replacePhoto(file, existing?.photoPath ?? null);
    }
    await updatePrint(parsed.data, photoPath);
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to update print" };
  }

  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}

/**
 * Delete a print (R7, R9). Admin-only: a non-admin is rejected before any DB or
 * Storage work, so nothing is written/removed. The service removes the PrintColor
 * rows + the row in a transaction, then the Storage object after the commit.
 */
export async function deletePrintAction(
  _prevState: PrintActionResult | null,
  formData: FormData,
): Promise<PrintActionResult> {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Missing id" };
  }

  try {
    await deletePrint(id);
  } catch {
    return { ok: false, error: "Failed to delete print" };
  }

  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}
