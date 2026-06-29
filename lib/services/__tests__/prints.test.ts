import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => {
  const tx = {
    print: {
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    printColor: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  };
  return {
    dbMock: {
      __tx: tx,
      print: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
      printColor: {
        count: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// Capture the catalog-reference registrations done at import time.
const { registerCatalogReferenceMock } = vi.hoisted(() => ({
  registerCatalogReferenceMock: vi.fn(),
}));
vi.mock("@/lib/services/catalogs", () => ({
  registerCatalogReference: (...a: unknown[]) =>
    registerCatalogReferenceMock(...a),
}));

// Storage is mocked so the service can be unit-tested without Supabase.
const { removePhotoMock, createSignedUrlMock } = vi.hoisted(() => ({
  removePhotoMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  removePhoto: (...a: unknown[]) => removePhotoMock(...a),
  createSignedUrl: (...a: unknown[]) => createSignedUrlMock(...a),
}));

import {
  buildPrintWhere,
  createPrint,
  deletePrint,
  getPrint,
  listPrints,
  signPhoto,
  updatePrint,
} from "@/lib/services/prints";

// Snapshot the import-time registrations before beforeEach clears the mock.
const registrationCalls = registerCatalogReferenceMock.mock.calls.slice();

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(
    async (cb: (t: typeof dbMock.__tx) => unknown) => cb(dbMock.__tx),
  );
});

describe("catalog delete-guard registration (02 registry)", () => {
  it("registers a printType counter and a color counter at import time", () => {
    const keys = registrationCalls.map((c) => c[0]);
    expect(keys).toContain("printType");
    expect(keys).toContain("color");
  });

  it("the printType counter counts prints by printTypeId", async () => {
    const counter = registrationCalls.find((c) => c[0] === "printType")![1] as (
      id: string,
    ) => Promise<number>;
    dbMock.print.count.mockResolvedValue(2);
    const n = await counter("pt-1");
    expect(dbMock.print.count).toHaveBeenCalledWith({
      where: { printTypeId: "pt-1" },
    });
    expect(n).toBe(2);
  });

  it("the color counter counts printColor rows by colorId", async () => {
    const counter = registrationCalls.find((c) => c[0] === "color")![1] as (
      id: string,
    ) => Promise<number>;
    dbMock.printColor.count.mockResolvedValue(4);
    const n = await counter("c-1");
    expect(dbMock.printColor.count).toHaveBeenCalledWith({
      where: { colorId: "c-1" },
    });
    expect(n).toBe(4);
  });
});

describe("buildPrintWhere (R8 — filter composition)", () => {
  it("returns an empty where with no filters", () => {
    expect(buildPrintWhere({})).toEqual({});
  });

  it("builds a case-insensitive name contains from q", () => {
    expect(buildPrintWhere({ q: "drag" })).toEqual({
      name: { contains: "drag", mode: "insensitive" },
    });
  });

  it("trims q and ignores a blank/whitespace q", () => {
    expect(buildPrintWhere({ q: "  dragon  " })).toEqual({
      name: { contains: "dragon", mode: "insensitive" },
    });
    expect(buildPrintWhere({ q: "   " })).toEqual({});
  });

  it("builds printTypeId from type", () => {
    expect(buildPrintWhere({ type: "pt-1" })).toEqual({ printTypeId: "pt-1" });
  });

  it("builds a colors-some relation from color", () => {
    expect(buildPrintWhere({ color: "c-1" })).toEqual({
      colors: { some: { colorId: "c-1" } },
    });
  });

  it("composes q + type + color together", () => {
    expect(buildPrintWhere({ q: "x", type: "pt-1", color: "c-1" })).toEqual({
      name: { contains: "x", mode: "insensitive" },
      printTypeId: "pt-1",
      colors: { some: { colorId: "c-1" } },
    });
  });
});

const dbRow = {
  id: "p-1",
  name: "Dragon",
  printTimeMinutes: 120,
  filamentGrams: 45,
  photoPath: "prints/x.png",
  documentUrl: null,
  printTypeId: "pt-1",
  printType: { id: "pt-1", name: "Mini" },
  colors: [{ color: { id: "c-1", name: "Red", hex: "#ff0000" } }],
};

describe("listPrints (R8 — single query, flattened colors)", () => {
  it("queries with the built where, name asc, and maps colors flat", async () => {
    dbMock.print.findMany.mockResolvedValue([dbRow]);
    const result = await listPrints({ q: "drag" });

    expect(dbMock.print.findMany).toHaveBeenCalledTimes(1);
    const args = dbMock.print.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      name: { contains: "drag", mode: "insensitive" },
    });
    expect(args.orderBy).toEqual({ name: "asc" });
    expect(result[0].colors).toEqual([
      { id: "c-1", name: "Red", hex: "#ff0000" },
    ]);
  });
});

describe("getPrint", () => {
  it("returns the flattened print or null", async () => {
    dbMock.print.findUnique.mockResolvedValueOnce(dbRow);
    const found = await getPrint("p-1");
    expect(found?.colors[0].hex).toBe("#ff0000");

    dbMock.print.findUnique.mockResolvedValueOnce(null);
    expect(await getPrint("missing")).toBeNull();
  });
});

describe("createPrint (R5 — row + nested color set)", () => {
  it("creates the print with nested PrintColor create rows", async () => {
    dbMock.print.create.mockResolvedValue({ id: "p-1" });

    await createPrint(
      {
        name: "Dragon",
        printTimeMinutes: 120,
        filamentGrams: 45,
        documentUrl: undefined,
        printTypeId: "pt-1",
        colorIds: ["c-1", "c-2"],
      },
      "prints/x.png",
    );

    const data = dbMock.print.create.mock.calls[0][0].data;
    expect(data.name).toBe("Dragon");
    expect(data.photoPath).toBe("prints/x.png");
    expect(data.documentUrl).toBeNull();
    expect(data.colors.create).toEqual([
      { colorId: "c-1" },
      { colorId: "c-2" },
    ]);
  });

  it("stores null photoPath when no photo was uploaded", async () => {
    dbMock.print.create.mockResolvedValue({ id: "p-2" });
    await createPrint(
      {
        name: "X",
        printTimeMinutes: 0,
        filamentGrams: 0,
        documentUrl: "https://e.com",
        printTypeId: "pt-1",
        colorIds: ["c-1"],
      },
      null,
    );
    const data = dbMock.print.create.mock.calls[0][0].data;
    expect(data.photoPath).toBeNull();
    expect(data.documentUrl).toBe("https://e.com");
  });
});

describe("updatePrint (R6 — atomic color-set replace in a transaction)", () => {
  it("updates fields and replaces the color set via deleteMany + createMany in $transaction", async () => {
    await updatePrint(
      {
        id: "p-1",
        name: "Dragon v2",
        printTimeMinutes: 130,
        filamentGrams: 50,
        documentUrl: undefined,
        printTypeId: "pt-2",
        colorIds: ["c-3", "c-4"],
      },
      "prints/new.png",
    );

    // The whole replace ran inside one transaction.
    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);

    const tx = dbMock.__tx;
    expect(tx.print.update).toHaveBeenCalledTimes(1);
    const updateArgs = tx.print.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "p-1" });
    expect(updateArgs.data.name).toBe("Dragon v2");
    expect(updateArgs.data.photoPath).toBe("prints/new.png");

    expect(tx.printColor.deleteMany).toHaveBeenCalledWith({
      where: { printId: "p-1" },
    });
    expect(tx.printColor.createMany).toHaveBeenCalledWith({
      data: [
        { printId: "p-1", colorId: "c-3" },
        { printId: "p-1", colorId: "c-4" },
      ],
    });
  });

  it("leaves photoPath untouched when photoPath is undefined (no new photo)", async () => {
    await updatePrint(
      {
        id: "p-1",
        name: "Dragon",
        printTimeMinutes: 1,
        filamentGrams: 1,
        documentUrl: undefined,
        printTypeId: "pt-1",
        colorIds: ["c-1"],
      },
      undefined,
    );
    const updateArgs = dbMock.__tx.print.update.mock.calls[0][0];
    expect("photoPath" in updateArgs.data).toBe(false);
  });
});

describe("deletePrint (R7 — tx removes rows, then Storage object)", () => {
  it("deletes PrintColor + Print in a transaction and removes the photo after commit", async () => {
    dbMock.__tx.print.findUnique.mockResolvedValue({
      photoPath: "prints/x.png",
    });

    const result = await deletePrint("p-1");

    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
    expect(dbMock.__tx.printColor.deleteMany).toHaveBeenCalledWith({
      where: { printId: "p-1" },
    });
    expect(dbMock.__tx.print.delete).toHaveBeenCalledWith({
      where: { id: "p-1" },
    });
    expect(removePhotoMock).toHaveBeenCalledWith("prints/x.png");
    expect(result.photoPath).toBe("prints/x.png");
  });

  it("does not call Storage when the print had no photo", async () => {
    dbMock.__tx.print.findUnique.mockResolvedValue({ photoPath: null });
    const result = await deletePrint("p-2");
    expect(removePhotoMock).not.toHaveBeenCalled();
    expect(result.photoPath).toBeNull();
  });
});

describe("signPhoto (R4)", () => {
  it("delegates to the Storage createSignedUrl helper", async () => {
    createSignedUrlMock.mockResolvedValue("https://signed/x");
    const url = await signPhoto("prints/x.png");
    expect(createSignedUrlMock).toHaveBeenCalledWith("prints/x.png");
    expect(url).toBe("https://signed/x");
  });
});
