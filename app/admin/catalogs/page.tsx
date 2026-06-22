import type { Metadata } from "next";

import { CatalogTabs } from "@/components/catalogs/CatalogTabs";
import { requireAdmin } from "@/lib/auth";
import { listCatalog, type ColorRow } from "@/lib/services/catalogs";

export const metadata: Metadata = {
  title: "Catalogs — Tower Layers",
};

/**
 * Admin catalog management page (R4, R8). The admin layout already guards the
 * route; requireAdmin() here is a second server-layer check before any data read,
 * and every mutation re-checks in its action (R7). Loads all four catalogs and
 * hands them to the client tab UI.
 */
export default async function CatalogsPage() {
  await requireAdmin();

  const [colors, printTypes, supplyTypes, taskCategories] = await Promise.all([
    listCatalog("color"),
    listCatalog("printType"),
    listCatalog("supplyType"),
    listCatalog("taskCategory"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Catalogs</h1>
      <CatalogTabs
        colors={(colors as ColorRow[]).map((c) => ({
          id: c.id,
          name: c.name,
          hex: c.hex,
        }))}
        printTypes={printTypes.map((r) => ({ id: r.id, name: r.name }))}
        supplyTypes={supplyTypes.map((r) => ({ id: r.id, name: r.name }))}
        taskCategories={taskCategories.map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
