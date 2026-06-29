import { describe, expect, it } from "vitest";

import {
  createExpenseSchema,
  updateExpenseSchema,
} from "@/lib/validation/expense";

/**
 * Schema branch coverage for expense validation (R3, R8, R9). The cost field is
 * the load-bearing one: it must admit only a positive amount with at most two
 * decimal places and preserve it as an EXACT string (no float coercion), so the
 * service can build a lossless Prisma.Decimal.
 */

const valid = {
  cost: "12.50",
  reason: "PLA filament",
  date: "2026-06-01",
  supplyTypeId: "st-1",
};

describe("createExpenseSchema — cost (R8)", () => {
  it("accepts a positive amount and keeps it as an exact string", () => {
    const parsed = createExpenseSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cost).toBe("12.50");
      expect(typeof parsed.data.cost).toBe("string");
    }
  });

  it("accepts an integer amount and a one-decimal amount", () => {
    expect(createExpenseSchema.safeParse({ ...valid, cost: "5" }).success).toBe(
      true,
    );
    expect(
      createExpenseSchema.safeParse({ ...valid, cost: "5.5" }).success,
    ).toBe(true);
  });

  it("preserves trailing-zero precision (no float drift): '0.10' stays '0.10'", () => {
    const parsed = createExpenseSchema.safeParse({ ...valid, cost: "0.10" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cost).toBe("0.10");
  });

  it("rejects more than two decimal places", () => {
    const parsed = createExpenseSchema.safeParse({ ...valid, cost: "1.234" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["cost"]);
      expect(parsed.error.issues[0]?.message).toMatch(/two decimal/i);
    }
  });

  it("rejects a non-positive cost (zero)", () => {
    const parsed = createExpenseSchema.safeParse({ ...valid, cost: "0" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/greater than zero/i);
    }
  });

  it("rejects a non-positive cost (negative)", () => {
    expect(
      createExpenseSchema.safeParse({ ...valid, cost: "-5.00" }).success,
    ).toBe(false);
  });

  it("rejects a non-numeric cost", () => {
    expect(
      createExpenseSchema.safeParse({ ...valid, cost: "abc" }).success,
    ).toBe(false);
  });

  it("rejects an empty cost", () => {
    expect(createExpenseSchema.safeParse({ ...valid, cost: "" }).success).toBe(
      false,
    );
  });
});

describe("createExpenseSchema — purchaseUrl (R9)", () => {
  it("accepts an absent / empty purchaseUrl as undefined", () => {
    const a = createExpenseSchema.safeParse(valid);
    expect(a.success && a.data.purchaseUrl).toBeUndefined();
    const b = createExpenseSchema.safeParse({ ...valid, purchaseUrl: "" });
    expect(b.success && b.data.purchaseUrl).toBeUndefined();
  });

  it("accepts a valid URL", () => {
    const parsed = createExpenseSchema.safeParse({
      ...valid,
      purchaseUrl: "https://example.com/cart",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data.purchaseUrl).toBe("https://example.com/cart");
  });

  it("rejects a present-but-invalid URL with a field error (R9)", () => {
    const parsed = createExpenseSchema.safeParse({
      ...valid,
      purchaseUrl: "not a url",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["purchaseUrl"]);
      expect(parsed.error.issues[0]?.message).toMatch(/valid url/i);
    }
  });
});

describe("createExpenseSchema — required fields (R8)", () => {
  it("rejects a missing/empty supplyTypeId with a field error", () => {
    const parsed = createExpenseSchema.safeParse({ ...valid, supplyTypeId: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["supplyTypeId"]);
    }
  });

  it("rejects an empty reason", () => {
    expect(
      createExpenseSchema.safeParse({ ...valid, reason: "" }).success,
    ).toBe(false);
  });

  it("rejects an empty / unparseable date", () => {
    expect(createExpenseSchema.safeParse({ ...valid, date: "" }).success).toBe(
      false,
    );
    expect(
      createExpenseSchema.safeParse({ ...valid, date: "not-a-date" }).success,
    ).toBe(false);
  });

  it("coerces a valid date string to a Date", () => {
    const parsed = createExpenseSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.date).toBeInstanceOf(Date);
  });
});

describe("updateExpenseSchema (R4)", () => {
  it("is the create shape plus a required id", () => {
    const ok = updateExpenseSchema.safeParse({ ...valid, id: "e-1" });
    expect(ok.success).toBe(true);

    const missingId = updateExpenseSchema.safeParse(valid);
    expect(missingId.success).toBe(false);
  });
});
