import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => {
  const delegate = () => ({
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  });
  return {
    dbMock: {
      color: delegate(),
      printType: delegate(),
      supplyType: delegate(),
      taskCategory: delegate(),
    },
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  __resetCatalogReferencesForTests,
  createCatalogValue,
  deleteCatalogValue,
  isCatalogValueInUse,
  listCatalog,
  registerCatalogReference,
  updateCatalogValue,
} from "@/lib/services/catalogs";

beforeEach(() => {
  vi.clearAllMocks();
  __resetCatalogReferencesForTests();
});

describe("listCatalog", () => {
  it("lists rows alphabetically from the right delegate", async () => {
    const rows = [{ id: "c1", name: "A" }];
    dbMock.taskCategory.findMany.mockResolvedValue(rows);

    const result = await listCatalog("taskCategory");

    expect(dbMock.taskCategory.findMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
    });
    expect(result).toBe(rows);
  });

  it("routes color to the color delegate", async () => {
    dbMock.color.findMany.mockResolvedValue([]);
    await listCatalog("color");
    expect(dbMock.color.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.printType.findMany).not.toHaveBeenCalled();
  });
});

describe("createCatalogValue", () => {
  it("creates a color with name + hex", async () => {
    dbMock.color.create.mockResolvedValue({ id: "x" });
    await createCatalogValue("color", { name: "Blue", hex: "#0000FF" });
    expect(dbMock.color.create).toHaveBeenCalledWith({
      data: { name: "Blue", hex: "#0000FF" },
    });
  });

  it("creates a name-only value on the matching delegate", async () => {
    dbMock.printType.create.mockResolvedValue({ id: "p" });
    await createCatalogValue("printType", { name: "frame" });
    expect(dbMock.printType.create).toHaveBeenCalledWith({
      data: { name: "frame" },
    });
  });
});

describe("updateCatalogValue", () => {
  it("updates by id on the matching delegate", async () => {
    dbMock.supplyType.update.mockResolvedValue({ id: "s1" });
    await updateCatalogValue("supplyType", "s1", { name: "PLA" });
    expect(dbMock.supplyType.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { name: "PLA" },
    });
  });
});

describe("deleteCatalogValue", () => {
  it("deletes by id on the matching delegate", async () => {
    dbMock.taskCategory.delete.mockResolvedValue({ id: "t1" });
    await deleteCatalogValue("taskCategory", "t1");
    expect(dbMock.taskCategory.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
  });
});

describe("isCatalogValueInUse (R6)", () => {
  it("returns false when no references are registered (current state)", async () => {
    await expect(isCatalogValueInUse("color", "c1")).resolves.toBe(false);
  });

  it("returns false when every registered counter reports zero", async () => {
    registerCatalogReference("taskCategory", async () => 0);
    await expect(isCatalogValueInUse("taskCategory", "t1")).resolves.toBe(false);
  });

  it("returns true when any registered counter reports a reference", async () => {
    registerCatalogReference("taskCategory", async () => 0);
    registerCatalogReference("taskCategory", async () => 3);
    await expect(isCatalogValueInUse("taskCategory", "t1")).resolves.toBe(true);
  });

  it("passes the id through to the registered counter", async () => {
    const counter = vi.fn(async () => 0);
    registerCatalogReference("supplyType", counter);
    await isCatalogValueInUse("supplyType", "s99");
    expect(counter).toHaveBeenCalledWith("s99");
  });

  it("isolates counters per catalog", async () => {
    registerCatalogReference("printType", async () => 5);
    // A different catalog has no counters, so it is still free.
    await expect(isCatalogValueInUse("color", "c1")).resolves.toBe(false);
    await expect(isCatalogValueInUse("printType", "p1")).resolves.toBe(true);
  });
});
