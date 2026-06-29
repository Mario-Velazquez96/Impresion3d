import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  colorSeeds,
  printTypeSeeds,
  seedCatalogs,
  taskCategorySeeds,
  type SeedClient,
} from "@/prisma/seed";
import { hexColorRegex } from "@/lib/validation/catalog";

function makeClient() {
  const client = {
    color: { upsert: vi.fn().mockResolvedValue({}) },
    taskCategory: { upsert: vi.fn().mockResolvedValue({}) },
    printType: { upsert: vi.fn().mockResolvedValue({}) },
  };
  return client satisfies SeedClient as SeedClient & typeof client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seed data (R3)", () => {
  it("defines exactly the brief's initial values", () => {
    expect(colorSeeds).toHaveLength(6);
    expect(taskCategorySeeds).toHaveLength(4);
    expect(printTypeSeeds).toHaveLength(3);
  });

  it("includes the named colors with valid #RRGGBB hexes (R8)", () => {
    const names = colorSeeds.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Azul Ballena MM",
        "Café Moka MM",
        "Piel MM",
        "Verde Iguana MM",
        "Rojo Cochinilla MM",
        "Rojo Nochebuena MM",
      ]),
    );
    for (const color of colorSeeds) {
      expect(hexColorRegex.test(color.hex)).toBe(true);
    }
  });

  it("includes the brief's task categories and print types", () => {
    expect(taskCategorySeeds.map((c) => c.name)).toEqual([
      "Printer maintenance",
      "Design creation",
      "Purchases",
      "Customer follow-up",
    ]);
    expect(printTypeSeeds.map((p) => p.name)).toEqual([
      "keychain",
      "frame",
      "deckbox",
    ]);
  });

  it("has unique names within each catalog", () => {
    const unique = (arr: { name: string }[]) =>
      new Set(arr.map((a) => a.name)).size === arr.length;
    expect(unique(colorSeeds)).toBe(true);
    expect(unique(taskCategorySeeds)).toBe(true);
    expect(unique(printTypeSeeds)).toBe(true);
  });
});

describe("seedCatalogs idempotency (R3)", () => {
  it("upserts every value keyed on name", async () => {
    const client = makeClient();
    await seedCatalogs(client);

    expect(client.color.upsert).toHaveBeenCalledTimes(6);
    expect(client.taskCategory.upsert).toHaveBeenCalledTimes(4);
    expect(client.printType.upsert).toHaveBeenCalledTimes(3);

    // Every call is an upsert keyed on the unique name (so re-running is safe).
    for (const call of client.color.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty("name");
      expect(call[0]).toHaveProperty("create");
    }
  });

  it("refreshes color hex on update but no-ops name-only catalogs", async () => {
    const client = makeClient();
    await seedCatalogs(client);

    const colorCall = client.color.upsert.mock.calls[0][0];
    expect(colorCall.update).toHaveProperty("hex");

    const categoryCall = client.taskCategory.upsert.mock.calls[0][0];
    expect(categoryCall.update).toEqual({});
  });

  it("issues the same upserts on a second run (creates no duplicates)", async () => {
    const client = makeClient();
    await seedCatalogs(client);
    await seedCatalogs(client);

    // Twice the calls, identical args — upsert keyed on name means the DB inserts
    // once and updates thereafter; no duplicate rows.
    expect(client.color.upsert).toHaveBeenCalledTimes(12);
    expect(client.taskCategory.upsert).toHaveBeenCalledTimes(8);
    expect(client.printType.upsert).toHaveBeenCalledTimes(6);
  });
});
