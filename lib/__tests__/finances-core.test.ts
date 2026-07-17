import { describe, expect, it } from "vitest";

import {
  computeBalance,
  fromCents,
  sanitizeAmountCents,
  sumAmountCents,
  toCents,
} from "@/lib/finances-core";
import { formatCurrency } from "@/lib/format";

/**
 * Unit tests for the PURE core of 10_sales_and_balance (R2, R5, R6, R7, R14).
 * No mocks: the module imports nothing, so every branch is directly reachable.
 * Coverage target for lib/finances-core.ts is 100% BRANCH (the repo's pure-core
 * standard, matching lib/pricing-core.ts).
 */

describe("computeBalance — THE worked example (R2, R7)", () => {
  // The canonical case from requirements.md:
  //   sales       1250.00 + 0.10 + 0.20 + 99.95 = 1350.25
  //   withdrawals  500.00 + 350.25             =  850.25
  //   balance                                   =  500.00
  // (An Expense of $2,000.00 exists in that scenario and is deliberately NOT part
  // of any figure here — this core never sees expenses at all.)
  const summary = computeBalance("1350.25", "850.25");

  it("derives salesTotalCents, withdrawalsTotalCents and balanceCents exactly", () => {
    expect(summary.salesTotalCents).toBe(135025);
    expect(summary.withdrawalsTotalCents).toBe(85025);
    expect(summary.balanceCents).toBe(50000);
  });

  it("renders the balance as '500.00' and is not negative", () => {
    expect(summary.balance).toBe("500.00");
    expect(summary.isNegative).toBe(false);
  });

  it("carries the sub-totals back out as exact money strings", () => {
    expect(summary.salesTotal).toBe("1350.25");
    expect(summary.withdrawalsTotal).toBe("850.25");
  });

  it("formats to $500.00 at the display edge (the single rounding step)", () => {
    expect(formatCurrency(summary.balance)).toBe("$500.00");
  });
});

describe("exact decimal precision — no float drift (R7)", () => {
  // WHY THIS TEST EXISTS: money in JS floats is simply wrong. 0.1 + 0.2 is
  // 0.30000000000000004, and 0.29 * 100 is 28.999999999999996. The core parses
  // money STRINGS into integer cents and does integer arithmetic, so neither trap
  // can fire. The assertions below pin that down.
  it("plain float arithmetic really does drift (the thing we are avoiding)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(0.1 + 0.2).toBe(0.30000000000000004);
    expect(0.29 * 100).not.toBe(29);
  });

  it("sumAmountCents(['0.10','0.20']) === 30 and fromCents(30) === '0.30'", () => {
    expect(sumAmountCents(["0.10", "0.20"])).toBe(30);
    expect(fromCents(30)).toBe("0.30");
    // Explicitly NOT the float result:
    expect(fromCents(sumAmountCents(["0.10", "0.20"]))).not.toBe(
      "0.30000000000000004",
    );
  });

  it("toCents('0.29') === 29 (the 0.29 * 100 float trap)", () => {
    expect(toCents("0.29")).toBe(29);
  });

  it("the worked example's sales rows sum to exactly 135025 → '1350.25'", () => {
    const cents = sumAmountCents(["1250.00", "0.10", "0.20", "99.95"]);
    expect(cents).toBe(135025);
    expect(fromCents(cents)).toBe("1350.25");
  });

  it("100 rows of '0.07' sum to exactly '7.00' (a float sum would drift)", () => {
    const rows = Array.from({ length: 100 }, () => "0.07");
    expect(sumAmountCents(rows)).toBe(700);
    expect(fromCents(sumAmountCents(rows))).toBe("7.00");
    // For contrast, the float sum of the same rows is NOT 7.
    const floatSum = rows.reduce((s, v) => s + Number(v), 0);
    expect(floatSum).not.toBe(7);
  });

  it("sums an empty ledger to 0", () => {
    expect(sumAmountCents([])).toBe(0);
  });
});

describe("empty ledgers → $0.00, never blank/NaN (R5)", () => {
  // Postgres returns NULL for a sum over zero rows; the service passes that
  // through as null. It must read as $0.00, not blank/NaN/an error.
  it.each([
    ["null", null, null],
    ["undefined", undefined, undefined],
    ["empty string", "", ""],
  ])("computeBalance with %s totals → 0 / '0.00' / not negative", (_l, s, w) => {
    const summary = computeBalance(s, w);
    expect(summary.salesTotalCents).toBe(0);
    expect(summary.withdrawalsTotalCents).toBe(0);
    expect(summary.balanceCents).toBe(0);
    expect(summary.balance).toBe("0.00");
    expect(summary.isNegative).toBe(false);
    expect(summary.balance).not.toContain("NaN");
    expect(formatCurrency(summary.balance)).toBe("$0.00");
  });

  it("one empty ledger still derives the other exactly", () => {
    expect(computeBalance("10.00", null).balance).toBe("10.00");
    expect(computeBalance(null, "10.00").balance).toBe("-10.00");
  });
});

describe("a negative balance is returned AS-IS (R6)", () => {
  // Sales 100.00 − withdrawals 250.50 = -150.50. R6's decision: a negative
  // balance is a TRUE state and is displayed signed — never clamped to zero,
  // hidden, or shown as an absolute value.
  const summary = computeBalance("100.00", "250.50");

  it("keeps the sign and the exact magnitude", () => {
    expect(summary.balanceCents).toBe(-15050);
    expect(summary.balance).toBe("-150.50");
    expect(summary.isNegative).toBe(true);
  });

  it("is NOT clamped to zero", () => {
    expect(summary.balanceCents).not.toBe(0);
    expect(summary.balance).not.toBe("0.00");
  });

  it("is NOT the absolute value", () => {
    expect(summary.balanceCents).not.toBe(15050);
    expect(summary.balance).not.toBe("150.50");
  });

  it("renders as -$150.50 at the display edge", () => {
    expect(formatCurrency(summary.balance)).toBe("-$150.50");
  });

  it("fromCents keeps the sign, including sub-peso amounts", () => {
    expect(fromCents(-15050)).toBe("-150.50");
    expect(fromCents(-5)).toBe("-0.05");
    expect(fromCents(-100)).toBe("-1.00");
  });

  it("a one-cent overdraw is still shown: computeBalance('0','0.01') → '-0.01'", () => {
    const s = computeBalance("0", "0.01");
    expect(s.balanceCents).toBe(-1);
    expect(s.balance).toBe("-0.01");
    expect(s.isNegative).toBe(true);
  });

  it("an exactly-zero balance is not marked negative", () => {
    const s = computeBalance("50.00", "50.00");
    expect(s.balanceCents).toBe(0);
    expect(s.isNegative).toBe(false);
  });
});

describe("toCents — the parsing choke point (R7)", () => {
  it.each([
    ["5", 500],
    ["5.5", 550],
    ["5.55", 555],
    ["0", 0],
    ["0.01", 1],
    ["0.10", 10],
    ["1250.00", 125000],
    ["1350.25", 135025],
    [" 12.50 ", 1250], // trimmed
    ["-150.50", -15050], // sign KEPT (clamping is sanitizeAmountCents' job)
    ["-0.05", -5],
    [5, 500],
    [5.5, 550],
    [0, 0],
    [-5, -500],
  ])("toCents(%o) === %i", (input, expected) => {
    expect(toCents(input as string | number)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
    ["non-numeric", "abc"],
    ["partly numeric", "12abc"],
    ["three decimals", "1.234"],
    ["lone dot", "."],
    ["trailing dot", "5."],
    ["NaN number", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["NaN string", "NaN"],
    ["Infinity string", "Infinity"],
    ["currency-formatted", "$12.50"],
    ["thousands separator", "1,350.25"],
    ["exponential", "1e3"],
  ])("toCents(%s) === 0", (_label, input) => {
    expect(toCents(input as string | number | null | undefined)).toBe(0);
  });
});

describe("fromCents (R6, R7)", () => {
  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [30, "0.30"],
    [100, "1.00"],
    [555, "5.55"],
    [50000, "500.00"],
    [135025, "1350.25"],
    [-1, "-0.01"],
    [-15050, "-150.50"],
  ])("fromCents(%i) === %s", (cents, expected) => {
    expect(fromCents(cents)).toBe(expected);
  });

  it("never emits NaN for a non-finite input (defensive)", () => {
    expect(fromCents(NaN)).toBe("0.00");
    expect(fromCents(Infinity)).toBe("0.00");
    expect(fromCents(-Infinity)).toBe("0.00");
  });

  it("truncates a fractional cents value rather than emitting a third decimal", () => {
    expect(fromCents(10.9)).toBe("0.10");
    expect(fromCents(-10.9)).toBe("-0.10");
  });
});

describe("toCents ↔ fromCents round-trip (R7)", () => {
  it.each(["0.00", "0.01", "0.30", "1.00", "5.55", "99.95", "1250.00", "1350.25"])(
    "'%s' → cents → '%s' unchanged",
    (money) => {
      expect(fromCents(toCents(money))).toBe(money);
    },
  );

  it("normalizes a 1-dp value on the way back ('5.5' → '5.50')", () => {
    expect(fromCents(toCents("5.5"))).toBe("5.50");
  });
});

describe("sanitizeAmountCents — clamp + reject (R14)", () => {
  // Mirrors lib/pricing-core.ts#sanitizeAmount: blank/null/undefined/non-numeric/
  // NaN/Infinity → 0, and negatives CLAMPED to 0. Zod is the rejection boundary
  // for user input; this is the independent belt-and-braces so a bad value can
  // never reduce a total nor leak NaN into a displayed figure.
  it.each([
    ["empty string", "", 0],
    ["null", null, 0],
    ["undefined", undefined, 0],
    ["non-numeric", "abc", 0],
    ["NaN", NaN, 0],
    ["Infinity", Infinity, 0],
    ["-Infinity", -Infinity, 0],
    ["three decimals", "1.234", 0],
    ["negative string", "-5", 0],
    ["negative number", -5, 0],
    ["negative sub-peso", "-0.01", 0],
    ["zero", "0", 0],
    ["positive string", "5", 500],
    ["positive number", 5, 500],
    ["one decimal", "5.5", 550],
  ])("sanitizeAmountCents(%s) === %i", (_label, input, expected) => {
    const result = sanitizeAmountCents(input as string | number | null);
    expect(result).toBe(expected);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("a negative row NEVER reduces a total", () => {
    expect(sumAmountCents(["10.00", "-5.00"])).toBe(1000);
    expect(sumAmountCents(["-5.00"])).toBe(0);
  });

  it("an invalid row NEVER propagates NaN into a total", () => {
    const cents = sumAmountCents(["10.00", "abc", NaN, Infinity, null, undefined]);
    expect(cents).toBe(1000);
    expect(fromCents(cents)).toBe("10.00");
  });

  it("computeBalance clamps a negative INPUT TOTAL (which is never legitimate)", () => {
    // A negative sales total is not a real state; it clamps to 0. The balance
    // itself may still go negative — that is a different thing (R6).
    const s = computeBalance("-100.00", "50.00");
    expect(s.salesTotalCents).toBe(0);
    expect(s.balanceCents).toBe(-5000);
  });

  it("computeBalance never yields NaN from garbage totals", () => {
    const s = computeBalance("abc", NaN);
    expect(s.balanceCents).toBe(0);
    expect(s.balance).toBe("0.00");
    expect(formatCurrency(s.balance)).toBe("$0.00");
  });
});
