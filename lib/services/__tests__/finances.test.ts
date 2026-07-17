import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    sale: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    withdrawal: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    // Present but MUST NEVER be touched by this service (R3).
    expense: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

// The finances service registers a Print reference counter at import time;
// capture that registration to assert it wires up the print delete-guard (R9).
const { registerPrintReferenceMock } = vi.hoisted(() => ({
  registerPrintReferenceMock: vi.fn(),
}));
vi.mock("@/lib/services/print-references", () => ({
  registerPrintReference: (...a: unknown[]) => registerPrintReferenceMock(...a),
}));

import {
  createSale,
  createWithdrawal,
  deleteSale,
  deleteWithdrawal,
  getBalanceSummary,
  listSales,
  listWithdrawals,
} from "@/lib/services/finances";

// Capture the import-time registration BEFORE any beforeEach clears the mock.
const registrationCall = registerPrintReferenceMock.mock.calls[0];
const registeredCounter = registrationCall?.[0] as
  | ((id: string) => Promise<number>)
  | undefined;

/**
 * A Decimal-like stub whose `toNumber()` THROWS. If any code path in the money
 * derivation reaches for a JS float, the test fails loudly instead of silently
 * drifting (R7). Only `.toString()` is legitimate.
 */
function decimalStub(value: string) {
  return {
    toString: () => value,
    toNumber: () => {
      throw new Error(
        "toNumber() must NEVER be called in the money path (R7) — pass .toString() to the pure core",
      );
    },
  };
}

/** Stub both aggregates' `_sum.amount` (null models an EMPTY ledger). */
function mockAggregates(sales: string | null, withdrawals: string | null) {
  dbMock.sale.aggregate.mockResolvedValue({
    _sum: { amount: sales === null ? null : decimalStub(sales) },
  });
  dbMock.withdrawal.aggregate.mockResolvedValue({
    _sum: { amount: withdrawals === null ? null : decimalStub(withdrawals) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerPrintReference wiring (the print delete-guard, R9)", () => {
  it("registers a print reference counter at import time", () => {
    expect(registrationCall).toBeDefined();
    expect(typeof registeredCounter).toBe("function");
  });

  it("the registered counter counts sales by printId", async () => {
    dbMock.sale.count.mockResolvedValue(2);
    const result = await registeredCounter!("p-1");
    expect(dbMock.sale.count).toHaveBeenCalledWith({
      where: { printId: "p-1" },
    });
    expect(result).toBe(2);
  });

  it("reports zero for a print with no sales", async () => {
    dbMock.sale.count.mockResolvedValue(0);
    expect(await registeredCounter!("p-2")).toBe(0);
  });
});

describe("getBalanceSummary — the balance is DERIVED IN THE DB (R2, R7)", () => {
  it("sums BOTH ledgers with Prisma _sum aggregates", async () => {
    mockAggregates("1350.25", "850.25");
    await getBalanceSummary();

    expect(dbMock.sale.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
    });
    expect(dbMock.withdrawal.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
    });
  });

  it("does NOT fetch rows and sum them in JS", async () => {
    mockAggregates("1350.25", "850.25");
    await getBalanceSummary();

    expect(dbMock.sale.findMany).not.toHaveBeenCalled();
    expect(dbMock.withdrawal.findMany).not.toHaveBeenCalled();
  });

  it("NEVER calls .toNumber() on the Decimals (the stub throws if it does)", async () => {
    mockAggregates("1350.25", "850.25");
    // Would reject with the stub's error if the money path touched a float.
    await expect(getBalanceSummary()).resolves.toBeDefined();
  });

  it("derives the worked example: 1350.25 − 850.25 = 500.00", async () => {
    mockAggregates("1350.25", "850.25");
    const summary = await getBalanceSummary();

    expect(summary.salesTotalCents).toBe(135025);
    expect(summary.withdrawalsTotalCents).toBe(85025);
    expect(summary.balanceCents).toBe(50000);
    expect(summary.balance).toBe("500.00");
    expect(summary.isNegative).toBe(false);
  });
});

describe("getBalanceSummary — expenses are DELIBERATELY EXCLUDED (R3)", () => {
  it("NEVER touches db.expense — not a query of any kind", async () => {
    mockAggregates("1350.25", "850.25");
    const summary = await getBalanceSummary();

    // The whole point: an Expense of $2,000.00 may exist; it is not read here and
    // cannot move the figure. The balance answers "revenue in that hasn't been
    // taken out", NOT "what is in the bank". This is a product decision, not a bug.
    expect(dbMock.expense.aggregate).not.toHaveBeenCalled();
    expect(dbMock.expense.findMany).not.toHaveBeenCalled();
    expect(dbMock.expense.count).not.toHaveBeenCalled();
    expect(summary.balance).toBe("500.00");
  });

  it("reads exactly two tables (Sale + Withdrawal) and nothing else", async () => {
    mockAggregates("100.00", "0");
    await getBalanceSummary();

    expect(dbMock.sale.aggregate).toHaveBeenCalledTimes(1);
    expect(dbMock.withdrawal.aggregate).toHaveBeenCalledTimes(1);
    expect(dbMock.expense.aggregate).toHaveBeenCalledTimes(0);
  });
});

describe("getBalanceSummary — empty ledgers (R5)", () => {
  it("a null _sum from BOTH aggregates yields $0.00, not NaN", async () => {
    mockAggregates(null, null);
    const summary = await getBalanceSummary();

    expect(summary.salesTotalCents).toBe(0);
    expect(summary.withdrawalsTotalCents).toBe(0);
    expect(summary.balance).toBe("0.00");
    expect(summary.isNegative).toBe(false);
  });

  it("a null sales _sum with real withdrawals still derives correctly", async () => {
    mockAggregates(null, "10.00");
    const summary = await getBalanceSummary();
    expect(summary.balance).toBe("-10.00");
    expect(summary.isNegative).toBe(true);
  });
});

describe("getBalanceSummary — negative balance (R6)", () => {
  it("sales under withdrawals yields the signed, unclamped summary", async () => {
    mockAggregates("100.00", "250.50");
    const summary = await getBalanceSummary();

    expect(summary.balanceCents).toBe(-15050);
    expect(summary.balance).toBe("-150.50");
    expect(summary.isNegative).toBe(true);
  });
});

describe("listSales (R17 — single query, date desc, print included)", () => {
  it("queries ordered by date desc and includes the print", async () => {
    dbMock.sale.findMany.mockResolvedValue([]);
    await listSales();

    expect(dbMock.sale.findMany).toHaveBeenCalledTimes(1);
    const args = dbMock.sale.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ date: "desc" });
    expect(args.select.print).toEqual({ select: { id: true, name: true } });
  });
});

describe("listWithdrawals (R15, R17 — single query, date desc, recordedBy included)", () => {
  it("queries ordered by date desc and includes the recording user", async () => {
    dbMock.withdrawal.findMany.mockResolvedValue([]);
    await listWithdrawals();

    expect(dbMock.withdrawal.findMany).toHaveBeenCalledTimes(1);
    const args = dbMock.withdrawal.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ date: "desc" });
    expect(args.select.recordedBy).toEqual({
      select: { id: true, name: true },
    });
  });
});

describe("createSale (R7, R8 — Decimal storage, no float)", () => {
  it("writes amount as a Prisma.Decimal built from the validated string", async () => {
    dbMock.sale.create.mockResolvedValue({ id: "s1" });

    await createSale({
      amount: "1250.00",
      date: new Date("2026-07-01T00:00:00.000Z"),
      printId: "p-1",
      buyer: undefined,
      notes: undefined,
    });

    const data = dbMock.sale.create.mock.calls[0][0].data;
    expect(data.amount).toBeInstanceOf(Prisma.Decimal);
    // Built from the STRING — no parseFloat anywhere in the path.
    expect(data.amount.toFixed(2)).toBe("1250.00");
    expect(data.printId).toBe("p-1");
    expect(data.buyer).toBeNull();
    expect(data.notes).toBeNull();
  });

  it("passes present buyer/notes through", async () => {
    dbMock.sale.create.mockResolvedValue({ id: "s2" });
    await createSale({
      amount: "99.95",
      date: new Date(),
      printId: "p-2",
      buyer: "Ana",
      notes: "Repeat customer",
    });

    const data = dbMock.sale.create.mock.calls[0][0].data;
    expect(data.buyer).toBe("Ana");
    expect(data.notes).toBe("Repeat customer");
  });

  it("stores the float-trap amounts exactly ('0.10' and '0.20')", async () => {
    dbMock.sale.create.mockResolvedValue({ id: "s3" });
    await createSale({
      amount: "0.10",
      date: new Date(),
      printId: "p-1",
      buyer: undefined,
      notes: undefined,
    });
    expect(dbMock.sale.create.mock.calls[0][0].data.amount.toFixed(2)).toBe(
      "0.10",
    );
  });

  it("propagates a Prisma error (P2003 bad printId) without a second write", async () => {
    dbMock.sale.create.mockRejectedValue({ code: "P2003" });
    await expect(
      createSale({
        amount: "1.00",
        date: new Date(),
        printId: "missing",
        buyer: undefined,
        notes: undefined,
      }),
    ).rejects.toEqual({ code: "P2003" });
    expect(dbMock.sale.create).toHaveBeenCalledTimes(1);
  });
});

describe("createWithdrawal (R15 — the audit trail comes from the ARGUMENT)", () => {
  it("writes recordedById from the caller's authenticated actor", async () => {
    dbMock.withdrawal.create.mockResolvedValue({ id: "w1" });

    await createWithdrawal(
      {
        amount: "500.00",
        date: new Date("2026-07-02T00:00:00.000Z"),
        reason: "Owner draw",
      },
      "user-1",
    );

    const data = dbMock.withdrawal.create.mock.calls[0][0].data;
    expect(data.recordedById).toBe("user-1");
    expect(data.amount).toBeInstanceOf(Prisma.Decimal);
    expect(data.amount.toFixed(2)).toBe("500.00");
    expect(data.reason).toBe("Owner draw");
  });

  it("IGNORES any recordedById smuggled into the input object", async () => {
    dbMock.withdrawal.create.mockResolvedValue({ id: "w2" });

    await createWithdrawal(
      {
        amount: "10.00",
        date: new Date(),
        reason: "x",
        // A forged field that is not part of CreateWithdrawalInput.
        recordedById: "FORGED-user",
      } as never,
      "user-1",
    );

    const data = dbMock.withdrawal.create.mock.calls[0][0].data;
    expect(data.recordedById).toBe("user-1");
    expect(data.recordedById).not.toBe("FORGED-user");
  });
});

describe("deleteSale / deleteWithdrawal (R10, R12)", () => {
  it("deletes a sale by id", async () => {
    dbMock.sale.delete.mockResolvedValue({ id: "s1" });
    await deleteSale("s1");
    expect(dbMock.sale.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("deletes a withdrawal by id", async () => {
    dbMock.withdrawal.delete.mockResolvedValue({ id: "w1" });
    await deleteWithdrawal("w1");
    expect(dbMock.withdrawal.delete).toHaveBeenCalledWith({
      where: { id: "w1" },
    });
  });
});
