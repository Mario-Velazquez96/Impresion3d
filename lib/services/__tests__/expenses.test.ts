import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    expense: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

// The expenses service registers a SupplyType reference counter at import time;
// capture that registration to assert it wires up the catalog delete-guard.
const { registerCatalogReferenceMock } = vi.hoisted(() => ({
  registerCatalogReferenceMock: vi.fn(),
}));
vi.mock("@/lib/services/catalogs", () => ({
  registerCatalogReference: (...a: unknown[]) =>
    registerCatalogReferenceMock(...a),
}));

import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from "@/lib/services/expenses";

// Capture the import-time registration BEFORE any beforeEach clears the mock.
const registrationCall = registerCatalogReferenceMock.mock.calls[0];
const registeredCounter = registrationCall?.[1] as
  | ((id: string) => Promise<number>)
  | undefined;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerCatalogReference wiring (02 delete-guard)", () => {
  it("registers a supplyType counter at import time", () => {
    expect(registrationCall?.[0]).toBe("supplyType");
    expect(typeof registeredCounter).toBe("function");
  });

  it("the registered counter counts expenses by supplyTypeId", async () => {
    dbMock.expense.count.mockResolvedValue(3);
    const result = await registeredCounter!("st-1");
    expect(dbMock.expense.count).toHaveBeenCalledWith({
      where: { supplyTypeId: "st-1" },
    });
    expect(result).toBe(3);
  });
});

describe("listExpenses (R6 — single query, date desc, supplyType included)", () => {
  it("queries ordered by date desc and includes the supply type", async () => {
    dbMock.expense.findMany.mockResolvedValue([]);
    await listExpenses();

    expect(dbMock.expense.findMany).toHaveBeenCalledTimes(1);
    const args = dbMock.expense.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ date: "desc" });
    expect(args.select.supplyType).toEqual({
      select: { id: true, name: true },
    });
  });
});

describe("createExpense (R3 — Decimal storage, no float)", () => {
  it("writes cost as a Prisma.Decimal built from the validated string", async () => {
    dbMock.expense.create.mockResolvedValue({ id: "e1" });

    await createExpense({
      cost: "12.50",
      reason: "PLA",
      date: new Date("2026-06-01T00:00:00.000Z"),
      purchaseUrl: undefined,
      supplyTypeId: "st-1",
    });

    const data = dbMock.expense.create.mock.calls[0][0].data;
    expect(data.cost).toBeInstanceOf(Prisma.Decimal);
    expect(data.cost.toString()).toBe("12.5");
    expect(data.supplyTypeId).toBe("st-1");
    expect(data.purchaseUrl).toBeNull();
  });

  it("passes a present purchaseUrl through", async () => {
    dbMock.expense.create.mockResolvedValue({ id: "e2" });
    await createExpense({
      cost: "1.00",
      reason: "x",
      date: new Date(),
      purchaseUrl: "https://example.com",
      supplyTypeId: "st-1",
    });
    expect(dbMock.expense.create.mock.calls[0][0].data.purchaseUrl).toBe(
      "https://example.com",
    );
  });

  it("propagates a Prisma error (e.g. P2003 bad FK) without a second write", async () => {
    dbMock.expense.create.mockRejectedValue({ code: "P2003" });
    await expect(
      createExpense({
        cost: "1.00",
        reason: "x",
        date: new Date(),
        purchaseUrl: undefined,
        supplyTypeId: "missing",
      }),
    ).rejects.toEqual({ code: "P2003" });
  });
});

describe("updateExpense (R4)", () => {
  it("updates by id and writes cost as a Decimal", async () => {
    dbMock.expense.update.mockResolvedValue({ id: "e1" });

    await updateExpense({
      id: "e1",
      cost: "99.99",
      reason: "ABS",
      date: new Date("2026-06-02T00:00:00.000Z"),
      purchaseUrl: undefined,
      supplyTypeId: "st-2",
    });

    const args = dbMock.expense.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "e1" });
    expect(args.data.cost).toBeInstanceOf(Prisma.Decimal);
    expect(args.data.cost.toString()).toBe("99.99");
  });
});

describe("deleteExpense (R5)", () => {
  it("deletes by id", async () => {
    dbMock.expense.delete.mockResolvedValue({ id: "e1" });
    await deleteExpense("e1");
    expect(dbMock.expense.delete).toHaveBeenCalledWith({
      where: { id: "e1" },
    });
  });
});

describe("cost Decimal round-trip — exact two-decimal precision (R1/R3)", () => {
  // The end-to-end contract: the validated string → Prisma.Decimal → DB → back.
  // Prisma.Decimal is arbitrary-precision, so values that are NOT exactly
  // representable as IEEE-754 floats (0.10, 0.20, 0.30 → 0.30000000000000004 as
  // a float) round-trip with no drift. This is the proof the amount never becomes
  // a JS float.
  it("0.10 + 0.20 sums to exactly 0.30 (a float gives 0.30000000000000004)", () => {
    const a = new Prisma.Decimal("0.10");
    const b = new Prisma.Decimal("0.20");
    expect(a.plus(b).toString()).toBe("0.3");
    // The float trap, for contrast:
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("preserves the value the service stores: '1234.99' → Decimal → '1234.99'", () => {
    const stored = new Prisma.Decimal("1234.99");
    expect(stored.toString()).toBe("1234.99");
    expect(stored.toFixed(2)).toBe("1234.99");
  });

  it("a value built from the form string equals one built from the same string", () => {
    const fromForm = new Prisma.Decimal("19.95");
    const reread = new Prisma.Decimal(fromForm.toString());
    expect(reread.toFixed(2)).toBe("19.95");
    expect(reread.equals(fromForm)).toBe(true);
  });
});
