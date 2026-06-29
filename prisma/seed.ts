import { PrismaClient } from "@prisma/client";

/**
 * Idempotent catalog seed (R3, 02_catalog_management). Re-running creates no
 * duplicates because every row is an `upsert` keyed on the unique `name`:
 *   - colors update their hex on re-seed (so shade tweaks land),
 *   - name-only catalogs are no-ops on re-seed.
 *
 * The seed DATA and the seeding LOGIC are exported so they can be unit-tested
 * against a mock client without a live database; `main()` runs them against the
 * real Prisma client.
 *
 * Hex shades are sensible #RRGGBB defaults per color name; they are editable
 * later via the admin catalog UI, so exact values are not load-bearing.
 */

export const colorSeeds: { name: string; hex: string }[] = [
  { name: "Azul Ballena MM", hex: "#1F4E79" },
  { name: "Café Moka MM", hex: "#4B2E1E" },
  { name: "Piel MM", hex: "#E8B98A" },
  { name: "Verde Iguana MM", hex: "#3FA34D" },
  { name: "Rojo Cochinilla MM", hex: "#9B1B30" },
  { name: "Rojo Nochebuena MM", hex: "#C81D25" },
];

export const taskCategorySeeds: { name: string }[] = [
  { name: "Printer maintenance" },
  { name: "Design creation" },
  { name: "Purchases" },
  { name: "Customer follow-up" },
];

export const printTypeSeeds: { name: string }[] = [
  { name: "keychain" },
  { name: "frame" },
  { name: "deckbox" },
];

// Structural shape of the upsert calls the seed makes — narrow enough to mock in
// tests, satisfied by the real PrismaClient.
type Upsertable<T> = {
  upsert: (args: {
    where: { name: string };
    update: Partial<T>;
    create: T;
  }) => Promise<unknown>;
};

export type SeedClient = {
  color: Upsertable<{ name: string; hex: string }>;
  taskCategory: Upsertable<{ name: string }>;
  printType: Upsertable<{ name: string }>;
};

/**
 * Upsert every catalog seed value (R3). Keyed on `name`, so a second run updates
 * in place (colors refresh their hex) and never inserts a duplicate.
 */
export async function seedCatalogs(client: SeedClient): Promise<void> {
  for (const color of colorSeeds) {
    await client.color.upsert({
      where: { name: color.name },
      update: { hex: color.hex },
      create: color,
    });
  }

  for (const category of taskCategorySeeds) {
    await client.taskCategory.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  for (const printType of printTypeSeeds) {
    await client.printType.upsert({
      where: { name: printType.name },
      update: {},
      create: printType,
    });
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedCatalogs(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly (e.g. `prisma db seed`), not when imported by a
// test. import.meta.url-based guards are awkward under the bundler module target,
// so we gate on an env flag the seed command sets.
if (process.env.PRISMA_SEED_RUN === "1") {
  void main();
}
