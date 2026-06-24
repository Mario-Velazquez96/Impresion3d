import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));
// @prisma/client only needs its Prisma namespace (for the `satisfies` type); the
// runtime value is unused at test time, so a thin stub is enough.
vi.mock("@prisma/client", () => ({ Prisma: {} }));

const { dbMock } = vi.hoisted(() => {
  const tx = {
    weekPlan: { upsert: vi.fn() },
    weekPlanColor: { deleteMany: vi.fn(), createMany: vi.fn() },
    weekPlanItem: { findFirst: vi.fn(), create: vi.fn() },
  };
  return {
    dbMock: {
      __tx: tx,
      weekPlan: { findUnique: vi.fn(), create: vi.fn() },
      weekPlanColor: { count: vi.fn() },
      weekPlanItem: { update: vi.fn(), delete: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});
vi.mock("@/lib/db", () => ({ db: dbMock }));

const { registerCatalogReferenceMock } = vi.hoisted(() => ({
  registerCatalogReferenceMock: vi.fn(),
}));
vi.mock("@/lib/services/catalogs", () => ({
  registerCatalogReference: (...a: unknown[]) =>
    registerCatalogReferenceMock(...a),
}));

import {
  assignPrintToDay,
  getOrCreateWeekPlan,
  moveWeekItem,
  removeWeekItem,
  setWeekColors,
  snapToMonday,
} from "@/lib/services/planning";

const registrationCalls = registerCatalogReferenceMock.mock.calls.slice();

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(
    async (cb: (t: typeof dbMock.__tx) => unknown) => cb(dbMock.__tx),
  );
});

describe("snapToMonday (R3 — week starts Monday)", () => {
  it("returns the same date for a Monday (midnight UTC)", () => {
    // 2026-06-22 is a Monday.
    const monday = snapToMonday(new Date("2026-06-22T15:30:00Z"));
    expect(monday.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });

  it("snaps a mid-week day back to its Monday", () => {
    // 2026-06-24 is a Wednesday → 2026-06-22.
    expect(snapToMonday(new Date("2026-06-24T00:00:00Z")).toISOString()).toBe(
      "2026-06-22T00:00:00.000Z",
    );
  });

  it("snaps a Sunday back to the Monday that started its week", () => {
    // 2026-06-28 is a Sunday → 2026-06-22.
    expect(snapToMonday(new Date("2026-06-28T23:00:00Z")).toISOString()).toBe(
      "2026-06-22T00:00:00.000Z",
    );
  });
});

describe("planning delete-guard registration", () => {
  it("registers a color counter at import time", () => {
    expect(registrationCalls.map((c) => c[0])).toContain("color");
  });

  it("the color counter counts weekPlanColor rows by colorId", async () => {
    const counter = registrationCalls.find((c) => c[0] === "color")![1] as (
      id: string,
    ) => Promise<number>;
    dbMock.weekPlanColor.count.mockResolvedValue(3);
    const n = await counter("c-1");
    expect(dbMock.weekPlanColor.count).toHaveBeenCalledWith({
      where: { colorId: "c-1" },
    });
    expect(n).toBe(3);
  });
});

const planRow = {
  id: "wp-1",
  weekStartDate: new Date("2026-06-22T00:00:00Z"),
  colors: [{ color: { id: "c-1", name: "Piel", hex: "#eecda3" } }],
  items: [
    {
      id: "it-1",
      printId: "p-1",
      dayOfWeek: "TUE",
      position: 0,
      print: {
        name: "Dragon",
        colors: [{ color: { id: "c-1", name: "Piel", hex: "#eecda3" } }],
      },
    },
  ],
};

describe("getOrCreateWeekPlan (R3 — snap + create-if-absent)", () => {
  it("looks up the plan by the snapped Monday and returns the flattened view", async () => {
    dbMock.weekPlan.findUnique.mockResolvedValue(planRow);

    const view = await getOrCreateWeekPlan(
      new Date("2026-06-24T12:00:00Z"), // Wednesday
      "user-1",
    );

    expect(dbMock.weekPlan.findUnique).toHaveBeenCalledWith({
      where: { weekStartDate: new Date("2026-06-22T00:00:00.000Z") },
      select: expect.anything(),
    });
    expect(dbMock.weekPlan.create).not.toHaveBeenCalled();
    expect(view.colors).toEqual([{ id: "c-1", name: "Piel", hex: "#eecda3" }]);
    expect(view.items[0]).toMatchObject({
      id: "it-1",
      printId: "p-1",
      printName: "Dragon",
      dayOfWeek: "TUE",
    });
    expect(view.items[0].colors).toEqual([
      { id: "c-1", name: "Piel", hex: "#eecda3" },
    ]);
  });

  it("creates the plan when absent, for the snapped Monday + createdById", async () => {
    dbMock.weekPlan.findUnique.mockResolvedValue(null);
    dbMock.weekPlan.create.mockResolvedValue({
      ...planRow,
      colors: [],
      items: [],
    });

    const view = await getOrCreateWeekPlan(
      new Date("2026-06-22T00:00:00Z"),
      "user-9",
    );

    expect(dbMock.weekPlan.create).toHaveBeenCalledWith({
      data: {
        weekStartDate: new Date("2026-06-22T00:00:00.000Z"),
        createdById: "user-9",
      },
      select: expect.anything(),
    });
    expect(view.colors).toEqual([]);
    expect(view.items).toEqual([]);
  });
});

describe("setWeekColors (R3 — upsert plan + replace color set in a transaction)", () => {
  it("upserts the plan by Monday, then deleteMany + createMany the colors in one tx", async () => {
    dbMock.__tx.weekPlan.upsert.mockResolvedValue({ id: "wp-1" });

    await setWeekColors(
      new Date("2026-06-24T00:00:00Z"), // Wednesday → Monday 06-22
      ["c-1", "c-2"],
      "user-1",
    );

    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
    expect(dbMock.__tx.weekPlan.upsert).toHaveBeenCalledWith({
      where: { weekStartDate: new Date("2026-06-22T00:00:00.000Z") },
      create: {
        weekStartDate: new Date("2026-06-22T00:00:00.000Z"),
        createdById: "user-1",
      },
      update: {},
      select: { id: true },
    });
    expect(dbMock.__tx.weekPlanColor.deleteMany).toHaveBeenCalledWith({
      where: { weekPlanId: "wp-1" },
    });
    expect(dbMock.__tx.weekPlanColor.createMany).toHaveBeenCalledWith({
      data: [
        { weekPlanId: "wp-1", colorId: "c-1" },
        { weekPlanId: "wp-1", colorId: "c-2" },
      ],
    });
  });

  it("replaces with an empty set (clears the colors) when none are given", async () => {
    dbMock.__tx.weekPlan.upsert.mockResolvedValue({ id: "wp-1" });
    await setWeekColors(new Date("2026-06-22T00:00:00Z"), [], "user-1");
    expect(dbMock.__tx.weekPlanColor.createMany).toHaveBeenCalledWith({
      data: [],
    });
  });
});

describe("assignPrintToDay (R7 — end of the day's order)", () => {
  it("appends at position 0 when the day is empty", async () => {
    dbMock.__tx.weekPlan.upsert.mockResolvedValue({ id: "wp-1" });
    dbMock.__tx.weekPlanItem.findFirst.mockResolvedValue(null);
    dbMock.__tx.weekPlanItem.create.mockResolvedValue({ id: "it-1" });

    await assignPrintToDay(
      new Date("2026-06-22T00:00:00Z"),
      "p-1",
      "WED",
      "user-1",
    );

    expect(dbMock.__tx.weekPlanItem.findFirst).toHaveBeenCalledWith({
      where: { weekPlanId: "wp-1", dayOfWeek: "WED" },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    expect(dbMock.__tx.weekPlanItem.create).toHaveBeenCalledWith({
      data: { weekPlanId: "wp-1", printId: "p-1", dayOfWeek: "WED", position: 0 },
      select: { id: true },
    });
  });

  it("appends at max+1 when the day already has items", async () => {
    dbMock.__tx.weekPlan.upsert.mockResolvedValue({ id: "wp-1" });
    dbMock.__tx.weekPlanItem.findFirst.mockResolvedValue({ position: 4 });
    dbMock.__tx.weekPlanItem.create.mockResolvedValue({ id: "it-2" });

    await assignPrintToDay(
      new Date("2026-06-22T00:00:00Z"),
      "p-2",
      "WED",
      "user-1",
    );

    const data = dbMock.__tx.weekPlanItem.create.mock.calls[0][0].data;
    expect(data.position).toBe(5);
  });
});

describe("moveWeekItem (R8)", () => {
  it("updates the item's day and position", async () => {
    await moveWeekItem("it-1", "FRI", 2);
    expect(dbMock.weekPlanItem.update).toHaveBeenCalledWith({
      where: { id: "it-1" },
      data: { dayOfWeek: "FRI", position: 2 },
    });
  });
});

describe("removeWeekItem (R8)", () => {
  it("deletes the item by id", async () => {
    await removeWeekItem("it-1");
    expect(dbMock.weekPlanItem.delete).toHaveBeenCalledWith({
      where: { id: "it-1" },
    });
  });
});
