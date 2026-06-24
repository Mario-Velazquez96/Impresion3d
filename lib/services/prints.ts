import "server-only";

import { db } from "@/lib/db";
import { registerCatalogReference } from "@/lib/services/catalogs";
import { createSignedUrl, removePhoto } from "@/lib/storage";
import type {
  CreatePrintInput,
  UpdatePrintInput,
} from "@/lib/validation/print";

/**
 * Business logic for print inventory (06_print_inventory). Authorization happens
 * in the caller (actions/prints.ts: requireUser for create/edit, requireAdmin for
 * delete) — these functions assume the actor is already resolved and authorized.
 * Prisma bypasses RLS, so the server layer is the real guard (print RLS + the
 * private bucket policies are defense-in-depth).
 *
 * Internal tool: any signed-in user reads/writes all prints (no per-row ownership
 * scoping); delete is Admin-only, enforced in the action layer.
 */

// 06 references TWO catalogs with onDelete: Restrict — PrintType (Print.printTypeId)
// and Color (PrintColor.colorId). Register a counter for each so the catalog
// delete-guard (R6 of 02) reports a print type / color as in-use while any print
// (or print-color row) points at it, before the DB FK Restrict would block the
// delete. Mirrors how 03 registered taskCategory and 05 registered supplyType.
registerCatalogReference("printType", (id) =>
  db.print.count({ where: { printTypeId: id } }),
);
registerCatalogReference("color", (id) =>
  db.printColor.count({ where: { colorId: id } }),
);

// Filters parsed from the inventory URL search params (R8). Each is optional; an
// absent value means "no constraint on that dimension".
export type PrintFilters = {
  q?: string;
  type?: string;
  color?: string;
};

// A color a print uses, with the hex needed to render its swatch (R11).
export type PrintColorView = {
  id: string;
  name: string;
  hex: string;
};

// A print joined with its print type and colors, as returned by listPrints/getPrint.
export type PrintWithRelations = {
  id: string;
  name: string;
  printTimeMinutes: number;
  filamentGrams: number;
  photoPath: string | null;
  documentUrl: string | null;
  printTypeId: string;
  printType: { id: string; name: string };
  colors: PrintColorView[];
};

/**
 * Build the Prisma `where` from optional filters (R8). Each absent filter is
 * omitted so the clause only constrains the dimensions actually present:
 *   - q     → case-insensitive name `contains`.
 *   - type  → exact printTypeId.
 *   - color → `colors some` relation on colorId.
 * Exported for direct unit testing of filter composition.
 */
export function buildPrintWhere(filters: PrintFilters) {
  const where: {
    name?: { contains: string; mode: "insensitive" };
    printTypeId?: string;
    colors?: { some: { colorId: string } };
  } = {};

  const q = filters.q?.trim();
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (filters.type) where.printTypeId = filters.type;
  if (filters.color) where.colors = { some: { colorId: filters.color } };

  return where;
}

// Prisma `select` shared by list/get so the relation shape stays in one place.
const printSelect = {
  id: true,
  name: true,
  printTimeMinutes: true,
  filamentGrams: true,
  photoPath: true,
  documentUrl: true,
  printTypeId: true,
  printType: { select: { id: true, name: true } },
  colors: {
    select: {
      color: { select: { id: true, name: true, hex: true } },
    },
    orderBy: { color: { name: "asc" as const } },
  },
} as const;

// Map a Prisma row (colors as PrintColor join rows) to the flat view model.
function toView(row: {
  id: string;
  name: string;
  printTimeMinutes: number;
  filamentGrams: number;
  photoPath: string | null;
  documentUrl: string | null;
  printTypeId: string;
  printType: { id: string; name: string };
  colors: { color: { id: string; name: string; hex: string } }[];
}): PrintWithRelations {
  return {
    id: row.id,
    name: row.name,
    printTimeMinutes: row.printTimeMinutes,
    filamentGrams: row.filamentGrams,
    photoPath: row.photoPath,
    documentUrl: row.documentUrl,
    printTypeId: row.printTypeId,
    printType: row.printType,
    colors: row.colors.map((c) => c.color),
  };
}

/**
 * All prints matching the filters, each with its print type + colors in a SINGLE
 * query (no N+1), ordered by name (R8). The page generates signed photo URLs from
 * the returned `photoPath` keys.
 */
export async function listPrints(
  filters: PrintFilters = {},
): Promise<PrintWithRelations[]> {
  const rows = await db.print.findMany({
    where: buildPrintWhere(filters),
    orderBy: { name: "asc" },
    select: printSelect,
  });
  return rows.map(toView);
}

/** A single print by id with its type + colors, or null if not found. */
export async function getPrint(id: string): Promise<PrintWithRelations | null> {
  const row = await db.print.findUnique({
    where: { id },
    select: printSelect,
  });
  return row ? toView(row) : null;
}

/**
 * Insert a print and its color set (R5). Caller must have Zod-validated `input`,
 * authorized via requireUser, and (if a photo was provided) already uploaded it —
 * passing the resulting object key as `photoPath`. A bad printTypeId / colorId
 * surfaces as Prisma P2003, which the action maps to a validation error (no
 * partial write — the create + nested color rows are one statement).
 */
export async function createPrint(
  input: CreatePrintInput,
  photoPath: string | null,
): Promise<{ id: string }> {
  return db.print.create({
    data: {
      name: input.name,
      printTimeMinutes: input.printTimeMinutes,
      filamentGrams: input.filamentGrams,
      documentUrl: input.documentUrl ?? null,
      photoPath: photoPath,
      printTypeId: input.printTypeId,
      colors: {
        create: input.colorIds.map((colorId) => ({ colorId })),
      },
    },
    select: { id: true },
  });
}

/**
 * Update a print's fields and REPLACE its color set atomically (R6). The field
 * update, the PrintColor deleteMany, and the createMany all run inside one
 * `prisma.$transaction`, so the color set is never observed half-swapped and a
 * failure rolls the whole thing back. `photoPath` is only written when a new value
 * is provided (the action passes the replacement key, or undefined to keep the
 * existing photo). Same P2003 contract as createPrint.
 */
export async function updatePrint(
  input: UpdatePrintInput,
  photoPath: string | null | undefined,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.print.update({
      where: { id: input.id },
      data: {
        name: input.name,
        printTimeMinutes: input.printTimeMinutes,
        filamentGrams: input.filamentGrams,
        documentUrl: input.documentUrl ?? null,
        printTypeId: input.printTypeId,
        // Only touch photoPath when a replacement key was supplied; `undefined`
        // leaves the column unchanged.
        ...(photoPath === undefined ? {} : { photoPath }),
      },
    });

    await tx.printColor.deleteMany({ where: { printId: input.id } });
    await tx.printColor.createMany({
      data: input.colorIds.map((colorId) => ({
        printId: input.id,
        colorId,
      })),
    });
  });
}

/**
 * Delete a print, its PrintColor rows, and its Storage photo (R7). The DB removal
 * runs in a transaction (PrintColor rows are deleted explicitly, then the Print);
 * the Storage object is removed AFTER the DB commit so a Storage failure never
 * leaves a deleted row with a live object (and a re-run can re-attempt removal).
 * Admin-only authorization is the caller's job (actions/prints.ts via requireAdmin).
 * Returns the photoPath that was removed (or null) for the caller's reference.
 */
export async function deletePrint(id: string): Promise<{ photoPath: string | null }> {
  const photoPath = await db.$transaction(async (tx) => {
    const existing = await tx.print.findUnique({
      where: { id },
      select: { photoPath: true },
    });
    await tx.printColor.deleteMany({ where: { printId: id } });
    await tx.print.delete({ where: { id } });
    return existing?.photoPath ?? null;
  });

  if (photoPath) {
    await removePhoto(photoPath);
  }
  return { photoPath };
}

/**
 * Generate a short-lived signed URL for a print's photo key (R4), or null when the
 * print has no photo. A thin pass-through to the Storage helper; the page calls
 * this per card at render time (URLs are never stored).
 */
export async function signPhoto(
  photoPath: string | null,
): Promise<string | null> {
  return createSignedUrl(photoPath);
}
