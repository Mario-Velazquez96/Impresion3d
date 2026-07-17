/**
 * The Print delete-guard registry (10_sales_and_balance, R9).
 *
 * A deliberate, line-for-line MIRROR of the catalog reference registry in
 * `lib/services/catalogs.ts` (registerCatalogReference / isCatalogValueInUse),
 * for Print instead of the four catalogs.
 *
 * WHY NOT JUST REUSE `registerCatalogReference`: that registry is keyed by
 * `CatalogKey` ("color" | "printType" | "supplyType" | "taskCategory" — see
 * lib/validation/catalog.ts), and a PRINT IS NOT A CATALOG. Widening that enum
 * would leak a "print" case into `schemaForCatalog`, `delegateFor`, and the Admin
 * catalogs UI, all of which manage catalogs only — the wrong shape entirely. The
 * other direction (having `lib/services/prints.ts` call `db.sale.count`) inverts
 * the dependency: feature 06 would import feature 10. The registry pattern exists
 * precisely to avoid that.
 *
 * This module holds NO Prisma import — the counter is injected by the referencing
 * feature's service — so neither side imports the other and there is no cycle.
 *
 * WHAT GUARANTEES WHAT: the DB's `onDelete: Restrict` FK on `Sale.printId` is the
 * HARD guarantee — a print with sales can never be deleted, and the attempt
 * raises Prisma P2003, which `actions/prints.ts#deletePrintAction` maps to the
 * in-use message. The pre-check below is the FRIENDLY path: it reports the print
 * as in-use before the FK has to fire, giving a clean message instead of a
 * caught exception. It is best-effort by nature — a counter is only registered if
 * its feature's service module has been loaded in that server instance — exactly
 * like the catalogs pre-check. Both paths return the same message, so the user
 * sees one behaviour.
 *
 * HOW A LATER FEATURE PLUGS IN: add the FK with `onDelete: Restrict` in its own
 * migration AND register a counter as a module side effect, e.g. (from
 * lib/services/finances.ts):
 *
 *   registerPrintReference((id) => db.sale.count({ where: { printId: id } }));
 */

/**
 * A reference counter contributed by a referencing feature: given a print id,
 * return how many of that feature's rows point at it.
 */
export type PrintReferenceCounter = (id: string) => Promise<number>;

let printReferenceCounters: PrintReferenceCounter[] = [];

/** Register a reference counter for prints (called by a referencing feature's module). */
export function registerPrintReference(counter: PrintReferenceCounter): void {
  printReferenceCounters.push(counter);
}

/** Test-only: clear all registered counters so suites don't leak into each other. */
export function __resetPrintReferencesForTests(): void {
  printReferenceCounters = [];
}

/**
 * Friendly pre-check for the print delete-guard (R9): true if any registered
 * referencing relation points at this print. Counters run in parallel; a single
 * positive count makes the result "in use".
 */
export async function isPrintInUse(id: string): Promise<boolean> {
  if (printReferenceCounters.length === 0) {
    return false;
  }
  const counts = await Promise.all(
    printReferenceCounters.map((count) => count(id)),
  );
  return counts.some((n) => n > 0);
}
