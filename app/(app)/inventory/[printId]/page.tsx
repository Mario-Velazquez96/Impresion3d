import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ColorSwatches } from "@/components/inventory/ColorSwatches";
import type { ColorOption } from "@/components/inventory/ColorMultiSelect";
import { DeletePrintButton } from "@/components/inventory/DeletePrintButton";
import {
  PrintFormDialog,
  type EditPrint,
  type PrintTypeOption,
} from "@/components/inventory/PrintFormDialog";
import { requireUser } from "@/lib/auth";
import { listCatalog } from "@/lib/services/catalogs";
import { getPrint, signPhoto } from "@/lib/services/prints";

export const metadata: Metadata = {
  title: "Print — Tower Layers",
};

/**
 * Print detail (Server Component, R11). requireUser() guards the read; a missing
 * print 404s. Generates a signed photo URL server-side (R4). Renders the print's
 * fields, color swatches (with names), and document link, plus an edit dialog and —
 * for Admin viewers — the delete control (the action also enforces requireAdmin).
 */
export default async function PrintDetailPage({
  params,
}: {
  params: Promise<{ printId: string }>;
}) {
  const user = await requireUser();
  const { printId } = await params;

  const print = await getPrint(printId);
  if (!print) notFound();

  const [signedPhotoUrl, printTypes, colors] = await Promise.all([
    signPhoto(print.photoPath),
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

  const editPrint: EditPrint = {
    id: print.id,
    name: print.name,
    printTimeMinutes: print.printTimeMinutes,
    filamentGrams: print.filamentGrams,
    documentUrl: print.documentUrl,
    printTypeId: print.printTypeId,
    colorIds: print.colors.map((c) => c.id),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/inventory"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to inventory
        </Link>
        <div className="flex items-center gap-2">
          <PrintFormDialog
            mode="edit"
            printTypes={printTypeOptions}
            colors={colorOptions}
            print={editPrint}
          />
          {user.role === "ADMIN" ? <DeletePrintButton id={print.id} /> : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted">
          {signedPhotoUrl ? (
            <Image
              src={signedPhotoUrl}
              alt={print.name}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No photo
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold tracking-tight">{print.name}</h1>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Print type</dt>
              <dd className="font-medium">{print.printType.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Print time</dt>
              <dd className="font-medium">{print.printTimeMinutes} min</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Filament</dt>
              <dd className="font-medium">{print.filamentGrams} g</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Document</dt>
              <dd className="font-medium">
                {print.documentUrl ? (
                  <a
                    href={print.documentUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline underline-offset-2"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Colors</span>
            <ColorSwatches colors={print.colors} showNames />
          </div>
        </div>
      </div>
    </div>
  );
}
