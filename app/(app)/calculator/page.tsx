import type { Metadata } from "next";

import { PriceCalculator } from "@/components/calculator/PriceCalculator";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listPrints } from "@/lib/services/prints";

export const metadata: Metadata = {
  title: "Calculator — Tower Layers",
};

/**
 * Price calculator (Server Component, R1, R5, R10). The (app) layout redirects
 * unauthenticated requests; requireUser() here is a second server-layer guard
 * before any read (Prisma bypasses RLS, so the server layer is the real guard).
 * NO admin gating — any signed-in user may use it (R1).
 *
 * The server does exactly one thing: authorize, load the reference data, pass it
 * down. There is no Server Action, no route handler, and no mutation: every
 * keystroke thereafter is client-local and NOTHING is ever persisted (R11).
 *
 * Reference data comes from ONE Promise.all of two queries (no N+1): the FULL
 * Color catalog (so every catalog color is selectable even if no print uses it,
 * matching the planning picker's rationale) and the existing listPrints() service
 * (a single query with its include/select, already name-ordered), mapped down to
 * the island's minimal serializable shape — reusing the service avoids a second
 * printSelect drifting out of sync, and the fields the calculator doesn't need
 * (photoPath, documentUrl, printType) are dropped before crossing the boundary.
 */
export default async function CalculatorPage() {
  await requireUser();

  const [allColors, prints] = await Promise.all([
    db.color.findMany({
      select: { id: true, name: true, hex: true },
      orderBy: { name: "asc" },
    }),
    listPrints(),
  ]);

  const printViews = prints.map((print) => ({
    id: print.id,
    name: print.name,
    printTimeMinutes: print.printTimeMinutes,
    filamentGrams: print.filamentGrams,
    colors: print.colors,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Price calculator</h1>
        <p className="text-sm text-muted-foreground">
          Work out what a print costs to produce: electricity plus filament, per
          color. Nothing here is saved.
        </p>
      </div>

      <PriceCalculator allColors={allColors} prints={printViews} />
    </div>
  );
}
