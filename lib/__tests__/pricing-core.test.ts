import { describe, expect, it } from "vitest";

import {
  calculateBreakdown,
  filamentRowCost,
  powerCost,
  roundMoney,
  sanitizeAmount,
  type CalculatorInput,
} from "@/lib/pricing-core";

/**
 * The HIGHEST-VALUE test set (09_price_calculator): the PURE pricing core.
 * Target 100% BRANCH coverage on sanitizeAmount / powerCost / filamentRowCost /
 * calculateBreakdown / roundMoney. Anchored on the spec's WORKED EXAMPLE:
 *
 *   power $2.50/h × 90 min          → 3.75
 *   row 1: 30 g @ $450/kg           → 13.50
 *   row 2: 20 g @ $500/kg           → 10.00
 *   filamentTotal                   → 23.50
 *   total                           → 27.25
 */

const WORKED_EXAMPLE: CalculatorInput = {
  powerPricePerHour: 2.5,
  printTimeMinutes: 90,
  rows: [
    { colorId: "piel", grams: 30, pricePerKg: 450 },
    { colorId: "verde", grams: 20, pricePerKg: 500 },
  ],
};

describe("worked example (R2, R3, R4)", () => {
  it("computes the spec's canonical case end to end: total = 27.25", () => {
    const result = calculateBreakdown(WORKED_EXAMPLE);

    expect(result.powerCost).toBeCloseTo(3.75, 10);
    expect(result.filamentLines.map((l) => l.cost)).toEqual([13.5, 10]);
    expect(result.filamentTotal).toBeCloseTo(23.5, 10);
    expect(result.total).toBeCloseTo(27.25, 10);
    // The exact figure the UI displays, rounded at the display edge.
    expect(roundMoney(result.total)).toBe(27.25);
  });

  it("keeps the lines 1:1 with the input rows, in input order (R4)", () => {
    const result = calculateBreakdown(WORKED_EXAMPLE);
    expect(result.filamentLines).toHaveLength(WORKED_EXAMPLE.rows.length);
    expect(result.filamentLines.map((l) => l.colorId)).toEqual([
      "piel",
      "verde",
    ]);
  });
});

describe("powerCost (R2 — pricePerHour × minutes / 60)", () => {
  it("charges exactly one hour's price at 60 minutes", () => {
    expect(powerCost(2.5, 60)).toBeCloseTo(2.5, 10);
  });

  it("charges half an hour's price at 30 minutes (sub-hour)", () => {
    expect(powerCost(2.5, 30)).toBeCloseTo(1.25, 10);
  });

  it("charges two hours' price at 120 minutes (multi-hour)", () => {
    expect(powerCost(2.5, 120)).toBeCloseTo(5, 10);
  });

  it("is 0 when the print takes no time", () => {
    expect(powerCost(2.5, 0)).toBe(0);
  });
});

describe("filamentRowCost (R3 — the kg→g conversion)", () => {
  it("charges a full spool price for a full kilogram (1000 g @ 450/kg = 450)", () => {
    expect(filamentRowCost(1000, 450)).toBeCloseTo(450, 10);
  });

  it("charges one thousandth of the spool price per gram (1 g @ 1000/kg = 1)", () => {
    expect(filamentRowCost(1, 1000)).toBeCloseTo(1, 10);
  });

  it("computes the worked example's rows (30 g @ 450 = 13.50; 20 g @ 500 = 10)", () => {
    expect(filamentRowCost(30, 450)).toBeCloseTo(13.5, 10);
    expect(filamentRowCost(20, 500)).toBeCloseTo(10, 10);
  });

  it("is 0 when no grams are used, whatever the spool costs", () => {
    expect(filamentRowCost(0, 450)).toBe(0);
  });
});

describe("sanitizeAmount (R7 — blank/empty/non-numeric/zero → 0, never NaN)", () => {
  it.each([
    ["empty string", "", 0],
    ["null", null, 0],
    ["undefined", undefined, 0],
    ["non-numeric string", "abc", 0],
    ["NaN", Number.NaN, 0],
    ["Infinity", Number.POSITIVE_INFINITY, 0],
    ["-Infinity", Number.NEGATIVE_INFINITY, 0],
    ["zero", 0, 0],
    ['"0"', "0", 0],
    ["whitespace", "   ", 0],
    ["a valid number", 12.5, 12.5],
    ["a valid numeric string", "12.5", 12.5],
  ])("maps %s to %s", (_label, input, expected) => {
    const result = sanitizeAmount(input as number | string | null | undefined);
    expect(result).toBe(expected);
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe("calculateBreakdown with blank inputs (R7 — 0 everywhere, never NaN)", () => {
  it("returns 0 for every figure when everything is blank/NaN", () => {
    const result = calculateBreakdown({
      powerPricePerHour: Number(""),
      printTimeMinutes: Number(""),
      rows: [{ colorId: null, grams: Number(""), pricePerKg: Number("") }],
    });

    expect(result.powerCost).toBe(0);
    expect(result.filamentLines[0].cost).toBe(0);
    expect(result.filamentTotal).toBe(0);
    expect(result.total).toBe(0);
  });

  it("never yields NaN or Infinity from non-numeric input", () => {
    const result = calculateBreakdown({
      powerPricePerHour: Number("abc"),
      printTimeMinutes: Number.POSITIVE_INFINITY,
      rows: [
        { colorId: null, grams: Number.NaN, pricePerKg: Number("oops") },
        { colorId: "piel", grams: 30, pricePerKg: Number.POSITIVE_INFINITY },
      ],
    });

    const figures = [
      result.powerCost,
      result.filamentTotal,
      result.total,
      ...result.filamentLines.map((l) => l.cost),
    ];
    for (const figure of figures) {
      expect(Number.isNaN(figure)).toBe(false);
      expect(Number.isFinite(figure)).toBe(true);
      expect(figure).toBe(0);
    }
  });
});

describe("negative inputs (R8 — clamped to 0, never reduce a total)", () => {
  it("clamps a negative power price and negative minutes to 0", () => {
    expect(powerCost(-2.5, 90)).toBe(0);
    expect(powerCost(2.5, -90)).toBe(0);
    expect(sanitizeAmount(-1)).toBe(0);
    expect(sanitizeAmount("-1")).toBe(0);
  });

  it("clamps negative grams and a negative price per kg to 0", () => {
    expect(filamentRowCost(-30, 450)).toBe(0);
    expect(filamentRowCost(30, -450)).toBe(0);
  });

  it("a negative row contributes 0 and never lowers the total below the other rows", () => {
    const result = calculateBreakdown({
      powerPricePerHour: 2.5,
      printTimeMinutes: 90,
      rows: [
        { colorId: "piel", grams: 30, pricePerKg: 450 },
        { colorId: "verde", grams: -9999, pricePerKg: 500 },
        { colorId: "rojo", grams: 20, pricePerKg: -9999 },
      ],
    });

    expect(result.filamentLines.map((l) => l.cost)).toEqual([13.5, 0, 0]);
    expect(result.filamentTotal).toBeCloseTo(13.5, 10);
    // 3.75 + 13.50 — the negatives added nothing and subtracted nothing.
    expect(result.total).toBeCloseTo(17.25, 10);
    expect(result.total).toBeGreaterThanOrEqual(result.powerCost);
  });
});

describe("row semantics (R3, R4, R9 — N rows, zero rows, one row, null color)", () => {
  it("sums N rows into filamentTotal, preserving order", () => {
    const result = calculateBreakdown({
      powerPricePerHour: 0,
      printTimeMinutes: 0,
      rows: [
        { colorId: "a", grams: 10, pricePerKg: 100 }, // 1.00
        { colorId: "b", grams: 20, pricePerKg: 200 }, // 4.00
        { colorId: "c", grams: 30, pricePerKg: 300 }, // 9.00
        { colorId: "d", grams: 40, pricePerKg: 400 }, // 16.00
      ],
    });

    expect(result.filamentLines.map((l) => l.colorId)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(result.filamentLines.map((l) => l.cost)).toEqual([1, 4, 9, 16]);
    expect(result.filamentTotal).toBeCloseTo(30, 10);
    expect(result.total).toBeCloseTo(30, 10);
  });

  it("zero rows → filamentTotal 0 and total = powerCost (the remove-to-empty edge)", () => {
    const result = calculateBreakdown({
      powerPricePerHour: 2.5,
      printTimeMinutes: 90,
      rows: [],
    });

    expect(result.filamentLines).toEqual([]);
    expect(result.filamentTotal).toBe(0);
    expect(result.total).toBeCloseTo(3.75, 10);
    expect(result.total).toBe(result.powerCost);
  });

  it("one row → total = powerCost + that row's cost", () => {
    const result = calculateBreakdown({
      powerPricePerHour: 2.5,
      printTimeMinutes: 90,
      rows: [{ colorId: "piel", grams: 30, pricePerKg: 450 }],
    });

    expect(result.filamentLines).toHaveLength(1);
    expect(result.filamentTotal).toBeCloseTo(13.5, 10);
    expect(result.total).toBeCloseTo(17.25, 10);
  });

  it("a row with no color still costs money and keeps its null id (R10 fallback)", () => {
    const result = calculateBreakdown({
      powerPricePerHour: 0,
      printTimeMinutes: 0,
      rows: [{ colorId: null, grams: 30, pricePerKg: 450 }],
    });

    expect(result.filamentLines[0].colorId).toBeNull();
    expect(result.filamentLines[0].cost).toBeCloseTo(13.5, 10);
    expect(result.total).toBeCloseTo(13.5, 10);
  });
});

describe("roundMoney (R11 — 2 dp at the display edge, kills float drift)", () => {
  it("rounds to two decimals", () => {
    expect(roundMoney(3.75)).toBe(3.75);
    expect(roundMoney(13.499)).toBe(13.5);
    expect(roundMoney(0.005)).toBe(0.01);
    expect(roundMoney(2)).toBe(2);
  });

  it("kills binary float drift (27.249999999999996 → 27.25)", () => {
    expect(roundMoney(27.249999999999996)).toBe(27.25);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("is 0 for non-finite or negative values, never NaN (R7, R8)", () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundMoney(-5)).toBe(0);
    expect(roundMoney(0)).toBe(0);
  });
});
