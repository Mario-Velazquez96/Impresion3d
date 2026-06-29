import "server-only";

import { db } from "@/lib/db";
import type {
  CatalogKey,
  ColorInput,
  NameOnlyInput,
} from "@/lib/validation/catalog";

/**
 * Business logic for the four catalogs (02_catalog_management). Authorization
 * happens in the caller (actions/catalogs.ts via requireAdmin) — these functions
 * assume the actor is already resolved and authorized. Prisma bypasses RLS, so
 * the server layer is the real guard (catalog RLS is defense-in-depth).
 *
 * The four tables are near-identical, so one generic CRUD path is parameterized
 * over a `CatalogKey` instead of copying it four times. Each key maps to its
 * Prisma delegate via `delegateFor`.
 */

export type CatalogRow = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ColorRow = CatalogRow & { hex: string };

// Minimal shape of the Prisma delegate methods this service uses. Declared
// structurally so `delegateFor` can return one type across all four catalogs
// without `any`.
type CatalogDelegate = {
  findMany: (args: {
    orderBy: { name: "asc" };
  }) => Promise<CatalogRow[] | ColorRow[]>;
  create: (args: {
    data: ColorInput | NameOnlyInput;
  }) => Promise<CatalogRow | ColorRow>;
  update: (args: {
    where: { id: string };
    data: ColorInput | NameOnlyInput;
  }) => Promise<CatalogRow | ColorRow>;
  delete: (args: { where: { id: string } }) => Promise<CatalogRow | ColorRow>;
  count: (args: { where: { id: string } }) => Promise<number>;
};

/** Map a CatalogKey to its Prisma model delegate. */
function delegateFor(catalog: CatalogKey): CatalogDelegate {
  switch (catalog) {
    case "color":
      return db.color as unknown as CatalogDelegate;
    case "printType":
      return db.printType as unknown as CatalogDelegate;
    case "supplyType":
      return db.supplyType as unknown as CatalogDelegate;
    case "taskCategory":
      return db.taskCategory as unknown as CatalogDelegate;
  }
}

/** Every value in a catalog, alphabetical by name. */
export async function listCatalog(
  catalog: CatalogKey,
): Promise<(CatalogRow | ColorRow)[]> {
  return delegateFor(catalog).findMany({ orderBy: { name: "asc" } });
}

/**
 * Insert a catalog value. Caller must have Zod-validated `data` and authorized
 * via requireAdmin. A duplicate name surfaces as Prisma P2002, which the action
 * maps to a field error (R5).
 */
export async function createCatalogValue(
  catalog: CatalogKey,
  data: ColorInput | NameOnlyInput,
): Promise<CatalogRow | ColorRow> {
  return delegateFor(catalog).create({ data });
}

/** Update a catalog value by id. Same P2002 contract as create (R5). */
export async function updateCatalogValue(
  catalog: CatalogKey,
  id: string,
  data: ColorInput | NameOnlyInput,
): Promise<CatalogRow | ColorRow> {
  return delegateFor(catalog).update({ where: { id }, data });
}

/**
 * Delete a catalog value by id. The caller MUST first run isCatalogValueInUse and
 * reject if it returns true (R6); the DB's `onDelete: Restrict` FKs (added by
 * later features) are the hard backstop if a reference slips past the pre-check.
 */
export async function deleteCatalogValue(
  catalog: CatalogKey,
  id: string,
): Promise<CatalogRow | ColorRow> {
  return delegateFor(catalog).delete({ where: { id } });
}

/**
 * A reference counter contributed by a later feature: given a catalog value id,
 * return how many of that feature's rows point at it. `isCatalogValueInUse` sums
 * the counters registered for a catalog.
 *
 * HOW LATER FEATURES PLUG IN: a referencing feature (e.g. 03_task_board_core uses
 * TaskCategory; 05_expense_tracking uses SupplyType; 06/07 use Color/PrintType)
 * adds its FK with `onDelete: Restrict` in its own migration AND registers a
 * counter here, e.g.:
 *
 *   registerCatalogReference("taskCategory", (id) =>
 *     db.task.count({ where: { categoryId: id } }),
 *   );
 *
 * No referencing models exist yet, so every catalog's reference list is empty and
 * isCatalogValueInUse currently returns false for all — the FK Restrict guarantee
 * arrives table-by-table as those features land.
 */
export type CatalogReferenceCounter = (id: string) => Promise<number>;

const catalogReferenceCounters: Record<CatalogKey, CatalogReferenceCounter[]> = {
  color: [],
  printType: [],
  supplyType: [],
  taskCategory: [],
};

/** Register a reference counter for a catalog (called by later features' modules). */
export function registerCatalogReference(
  catalog: CatalogKey,
  counter: CatalogReferenceCounter,
): void {
  catalogReferenceCounters[catalog].push(counter);
}

/** Test-only: clear all registered counters so suites don't leak into each other. */
export function __resetCatalogReferencesForTests(): void {
  for (const key of Object.keys(
    catalogReferenceCounters,
  ) as CatalogKey[]) {
    catalogReferenceCounters[key] = [];
  }
}

/**
 * Friendly pre-check for the delete-guard (R6): true if any registered referencing
 * relation points at this catalog value. Counters run in parallel; a single
 * positive count short-circuits the result to "in use".
 */
export async function isCatalogValueInUse(
  catalog: CatalogKey,
  id: string,
): Promise<boolean> {
  const counters = catalogReferenceCounters[catalog];
  if (counters.length === 0) {
    return false;
  }
  const counts = await Promise.all(counters.map((count) => count(id)));
  return counts.some((n) => n > 0);
}
