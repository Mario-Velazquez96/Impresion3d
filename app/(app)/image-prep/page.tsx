import type { Metadata } from "next";

import { ImagePrep } from "@/components/image-prep/ImagePrep";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Image prep — Tower Layers",
};

/**
 * Image prep (Server Component, 11_image_prep: R1, R13, R19). The (app) layout
 * redirects unauthenticated requests; requireUser() here is a second
 * server-layer guard before the single read (Prisma bypasses RLS, so the
 * server layer is the real guard). NO admin gating — any signed-in user may
 * use it (R1).
 *
 * The server does exactly one thing: authorize, load the Color catalog (one
 * query, name-ordered), pass it down. Everything after this render is
 * client-local: no Server Action, no route handler, no Storage, no URL state —
 * the image never leaves the browser and NOTHING is persisted (R19).
 */
export default async function ImagePrepPage() {
  await requireUser();

  const colors = await db.color.findMany({
    select: { id: true, name: true, hex: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Image prep</h1>
        <p className="text-sm text-muted-foreground">
          Turn an image into a HueForge-ready design: adjust, posterize, clean
          the palette, snap it to your filaments, download the PNG. Nothing
          here is saved.
        </p>
      </div>

      <ImagePrep catalogColors={colors} />
    </div>
  );
}
