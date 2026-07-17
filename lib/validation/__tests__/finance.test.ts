import { describe, expect, it } from "vitest";

import {
  amountSchema,
  createSaleSchema,
  createWithdrawalSchema,
} from "@/lib/validation/finance";

/**
 * The Zod boundary for sales & balance (10_sales_and_balance R8, R14, R15).
 * This is the REJECTION boundary for user input; `lib/finances-core.ts`'s clamp
 * is the independent belt-and-braces on the derivation side.
 */

const validSale = {
  amount: "1250.00",
  date: "2026-07-01",
  printId: "p-1",
};

const validWithdrawal = {
  amount: "500.00",
  date: "2026-07-02",
  reason: "Owner draw",
};

describe("amountSchema — accepts exact positive money (R14)", () => {
  it.each([
    ["5", "5"],
    ["5.5", "5.5"],
    ["5.50", "5.50"],
    ["1234.99", "1234.99"],
    ["0.01", "0.01"],
    [" 12.50 ", "12.50"], // trimmed
  ])("accepts %o and outputs the normalized STRING %o", (input, expected) => {
    const result = amountSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(expected);
      // The output must stay a string all the way to new Prisma.Decimal(...).
      expect(typeof result.data).toBe("string");
    }
  });

  it("stringifies a numeric input rather than keeping a float", () => {
    const result = amountSchema.safeParse(12.5);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("12.5");
  });
});

describe("amountSchema — rejects everything else (R14)", () => {
  it.each([
    ["negative", "-5", /greater than zero|two decimal/i],
    ["negative number", -5, /greater than zero|two decimal/i],
    ["zero", "0", /greater than zero/i],
    ["zero number", 0, /greater than zero/i],
    ["blank", "", /required/i],
    ["whitespace only", "   ", /required/i],
    ["non-numeric", "abc", /two decimal/i],
    ["three decimals", "1.234", /two decimal/i],
    ["NaN string", "NaN", /two decimal/i],
    // A NaN *number* is rejected by z.number() itself, before the transform runs,
    // so it carries the union's generic message rather than the format one. Still
    // a rejection with no write, which is what R14 requires.
    ["NaN number", NaN, /invalid input/i],
    ["Infinity", Infinity, /two decimal/i],
    ["-Infinity", -Infinity, /two decimal/i],
    ["currency formatted", "$12.50", /two decimal/i],
    ["thousands separator", "1,350.25", /two decimal/i],
  ])("rejects a %s amount", (_label, input, messageRe) => {
    const result = amountSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(messageRe);
    }
  });
});

describe("createSaleSchema — a sale REQUIRES a print (R8)", () => {
  it("accepts a valid sale", () => {
    expect(createSaleSchema.safeParse(validSale).success).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["blank", ""],
    ["whitespace only", "   "],
  ])("rejects a %s printId with 'Print is required'", (_label, printId) => {
    const result = createSaleSchema.safeParse({ ...validSale, printId });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "printId");
      expect(issue).toBeDefined();
    }
  });

  it("normalizes optional buyer/notes: blank and null both become undefined", () => {
    const result = createSaleSchema.safeParse({
      ...validSale,
      buyer: "",
      notes: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buyer).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("trims present buyer/notes", () => {
    const result = createSaleSchema.safeParse({
      ...validSale,
      buyer: "  Ana  ",
      notes: "  Repeat  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buyer).toBe("Ana");
      expect(result.data.notes).toBe("Repeat");
    }
  });

  it("accepts an omitted buyer/notes entirely (they are optional)", () => {
    const result = createSaleSchema.safeParse(validSale);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buyer).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("parses the date into a Date", () => {
    const result = createSaleSchema.safeParse(validSale);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBeInstanceOf(Date);
  });

  it("accepts a Date object for the date", () => {
    const result = createSaleSchema.safeParse({
      ...validSale,
      date: new Date("2026-07-01T00:00:00.000Z"),
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["blank", "", /Date is required/],
    ["unparseable", "not-a-date", /valid date/],
  ])("rejects a %s date", (_label, date, messageRe) => {
    const result = createSaleSchema.safeParse({ ...validSale, date });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(messageRe);
    }
  });

  it("rejects an invalid Date object", () => {
    const result = createSaleSchema.safeParse({
      ...validSale,
      date: new Date("nonsense"),
    });
    expect(result.success).toBe(false);
  });
});

describe("createWithdrawalSchema — reason required, recordedById NOT client input (R14, R15)", () => {
  it("accepts a valid withdrawal", () => {
    expect(createWithdrawalSchema.safeParse(validWithdrawal).success).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["blank", ""],
    ["whitespace only", "   "],
  ])("rejects a %s reason", (_label, reason) => {
    const result = createWithdrawalSchema.safeParse({
      ...validWithdrawal,
      reason,
    });
    expect(result.success).toBe(false);
  });

  it("trims the reason", () => {
    const result = createWithdrawalSchema.safeParse({
      ...validWithdrawal,
      reason: "  Owner draw  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reason).toBe("Owner draw");
  });

  it("STRIPS a recordedById planted in the payload — it is not part of the schema", () => {
    // The audit trail is assigned server-side from the session (R15). A forged
    // value must never survive parsing and reach the service.
    const result = createWithdrawalSchema.safeParse({
      ...validWithdrawal,
      recordedById: "FORGED-victim",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("recordedById");
      expect(JSON.stringify(result.data)).not.toContain("FORGED-victim");
    }
  });

  it("has no printId requirement (withdrawals are not tied to a print)", () => {
    expect(createWithdrawalSchema.safeParse(validWithdrawal).success).toBe(true);
  });
});
