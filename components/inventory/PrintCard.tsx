import Image from "next/image";
import Link from "next/link";

import { ColorSwatches } from "@/components/inventory/ColorSwatches";

/**
 * A single inventory card (Server Component, R11). Shows the print's photo (via a
 * server-generated signed URL passed in — never a stored public URL), name, type,
 * and color swatches. The whole card links to the detail view. When there is no
 * photo (or signing failed) a neutral placeholder is shown.
 */

export type PrintCardView = {
  id: string;
  name: string;
  printTypeName: string;
  signedPhotoUrl: string | null;
  colors: { id: string; name: string; hex: string }[];
};

export function PrintCard({ print }: { print: PrintCardView }) {
  return (
    <Link
      href={`/inventory/${print.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-colors hover:border-primary"
    >
      <div className="relative aspect-square w-full bg-muted">
        {print.signedPhotoUrl ? (
          <Image
            src={print.signedPhotoUrl}
            alt={print.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium leading-tight">{print.name}</span>
          <span className="text-xs text-muted-foreground">
            {print.printTypeName}
          </span>
        </div>
        <ColorSwatches colors={print.colors} />
      </div>
    </Link>
  );
}
