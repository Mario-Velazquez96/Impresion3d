import type { Metadata } from "next";

import type { ColorOption } from "@/components/inventory/ColorMultiSelect";
import type { PrintCardView } from "@/components/inventory/PrintCard";
import {
  PrintFormDialog,
  type PrintTypeOption,
} from "@/components/inventory/PrintFormDialog";
import { PrintGrid } from "@/components/inventory/PrintGrid";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { requireUser } from "@/lib/auth";
import { listCatalog } from "@/lib/services/catalogs";
import { listPrints, signPhoto, type PrintFilters } from "@/lib/services/prints";

export const metadata: Metadata = {
  title: "Inventory — Tower Layers",
};

/**
 * The print inventory (Server Component, R8, R11). The (app) layout already
 * redirects unauthenticated requests; requireUser() here is a second server-layer
 * guard before any data read. Parses the q/type/color search params into filters,
 * fetches the matching prints (single query, type + colors included) plus the
 * PrintType + Color catalogs for the form and filters, and generates a signed photo
 * URL per card SERVER-SIDE at render time (TTL 1h, never stored). All interactivity
 * lives in small Client islands (filters, the create/edit dialog).
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const filters: PrintFilters = {
    q: first(params.q),
    type: first(params.type),
    color: first(params.color),
  };

  const [prints, printTypes, colors] = await Promise.all([
    listPrints(filters),
    listCatalog("printType"),
    listCatalog("color"),
  ]);

  const printTypeOptions: PrintTypeOption[] = printTypes.map((t) => ({
    id: t.id,
    name: t.name,
  }));
  const colorOptions: ColorOption[] = colors.map((c) => ({
    id: c.id,
    name: c.name,
    hex: "hex" in c ? c.hex : "#000000",
  }));

  // Generate signed URLs server-side (R4) — concurrently to avoid a waterfall.
  const cards: PrintCardView[] = await Promise.all(
    prints.map(async (print) => ({
      id: print.id,
      name: print.name,
      printTypeName: print.printType.name,
      signedPhotoUrl: await signPhoto(print.photoPath),
      colors: print.colors,
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <PrintFormDialog
          mode="create"
          printTypes={printTypeOptions}
          colors={colorOptions}
        />
      </div>

      <InventoryFilters printTypes={printTypeOptions} colors={colorOptions} />

      <PrintGrid prints={cards} />
    </div>
  );
}
