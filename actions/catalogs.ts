"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requireAdmin } from "@/lib/auth";
import {
  createCatalogValue,
  deleteCatalogValue,
  isCatalogValueInUse,
  updateCatalogValue,
} from "@/lib/services/catalogs";
import {
  catalogKeySchema,
  schemaForCatalog,
  type CatalogKey,
} from "@/lib/validation/catalog";

/**
 * Server actions for the four catalogs (02_catalog_management). Every mutation:
 *   1. requireAdmin() FIRST — a non-admin is rejected before any validation or DB
 *      work, so nothing is written (R7).
 *   2. Zod-validate the input for the specific catalog (color adds hex) (R4).
 *   3. Call the generic service.
 *   4. revalidatePath the catalogs page (R4).
 * Duplicate names raise Prisma P2002, mapped to a field error with no write (R5).
 * Deletes run isCatalogValueInUse and reject in-use values (R6).
 */

const CATALOGS_PATH = "/admin/catalogs";

export type FieldError = { field: string; message: string };
export type CatalogActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: FieldError[] };

/** True when a thrown error is Prisma's unique-constraint violation (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Resolve the admin, returning a typed rejection result instead of throwing. */
async function ensureAdmin(): Promise<CatalogActionResult | null> {
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

/** Parse the catalog key from form input; reject unknown catalogs. */
function parseCatalog(value: FormDataEntryValue | null): CatalogKey | null {
  const parsed = catalogKeySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function buildPayload(
  catalog: CatalogKey,
  formData: FormData,
): { name: unknown; hex?: unknown } {
  const base = { name: formData.get("name") };
  return catalog === "color"
    ? { ...base, hex: formData.get("hex") }
    : base;
}

/** Create a catalog value (R4, R5, R7). */
export async function createCatalog(
  _prevState: CatalogActionResult | null,
  formData: FormData,
): Promise<CatalogActionResult> {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const catalog = parseCatalog(formData.get("catalog"));
  if (!catalog) return { ok: false, error: "Unknown catalog" };

  const parsed = schemaForCatalog(catalog).safeParse(
    buildPayload(catalog, formData),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: parsed.error.issues.map((i) => ({
        field: String(i.path[0] ?? "name"),
        message: i.message,
      })),
    };
  }

  try {
    await createCatalogValue(catalog, parsed.data);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "That name is already in use",
        fieldErrors: [{ field: "name", message: "That name is already in use" }],
      };
    }
    return { ok: false, error: "Failed to create catalog value" };
  }

  revalidatePath(CATALOGS_PATH);
  return { ok: true };
}

/** Update a catalog value (R4, R5, R7). */
export async function updateCatalog(
  _prevState: CatalogActionResult | null,
  formData: FormData,
): Promise<CatalogActionResult> {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const catalog = parseCatalog(formData.get("catalog"));
  if (!catalog) return { ok: false, error: "Unknown catalog" };

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Missing id" };
  }

  const parsed = schemaForCatalog(catalog).safeParse(
    buildPayload(catalog, formData),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: parsed.error.issues.map((i) => ({
        field: String(i.path[0] ?? "name"),
        message: i.message,
      })),
    };
  }

  try {
    await updateCatalogValue(catalog, id, parsed.data);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "That name is already in use",
        fieldErrors: [{ field: "name", message: "That name is already in use" }],
      };
    }
    return { ok: false, error: "Failed to update catalog value" };
  }

  revalidatePath(CATALOGS_PATH);
  return { ok: true };
}

/** Delete a catalog value, blocking in-use values (R4, R6, R7). */
export async function deleteCatalog(
  _prevState: CatalogActionResult | null,
  formData: FormData,
): Promise<CatalogActionResult> {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const catalog = parseCatalog(formData.get("catalog"));
  if (!catalog) return { ok: false, error: "Unknown catalog" };

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Missing id" };
  }

  // Friendly pre-check (R6): block before attempting the delete.
  if (await isCatalogValueInUse(catalog, id)) {
    return {
      ok: false,
      error: "This value is in use and cannot be deleted",
    };
  }

  try {
    await deleteCatalogValue(catalog, id);
  } catch (error) {
    // DB Restrict backstop: a reference that slipped past the pre-check raises
    // P2003 (foreign-key violation). Surface the same friendly in-use message.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2003"
    ) {
      return {
        ok: false,
        error: "This value is in use and cannot be deleted",
      };
    }
    return { ok: false, error: "Failed to delete catalog value" };
  }

  revalidatePath(CATALOGS_PATH);
  return { ok: true };
}
