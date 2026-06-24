import { describe, expect, it } from "vitest";

import { formatCurrency } from "@/lib/format";

/**
 * The centralized currency formatter (05_expense_tracking). MXN via
 * Intl.NumberFormat('es-MX'). We assert structure (currency symbol + exact two
 * decimals + grouping) rather than an exact byte string, since Intl output can
 * vary subtly across ICU versions.
 */
describe("formatCurrency (central MXN formatter)", () => {
  it("formats a decimal string with a $ symbol and exactly two decimals", () => {
    const out = formatCurrency("12.5");
    expect(out).toContain("$");
    expect(out).toMatch(/12\.50/);
  });

  it("formats an integer-valued string with two decimals", () => {
    expect(formatCurrency("5")).toMatch(/5\.00/);
  });

  it("groups thousands", () => {
    expect(formatCurrency("1234.99")).toMatch(/1,234\.99/);
  });

  it("accepts a number as well as a string", () => {
    expect(formatCurrency(99.99)).toMatch(/99\.99/);
  });

  it("falls back to a formatted zero for an unparseable value (never throws)", () => {
    expect(formatCurrency("not-a-number")).toMatch(/0\.00/);
  });

  it("preserves trailing-zero precision: '0.10' shows .10 not .1", () => {
    expect(formatCurrency("0.10")).toMatch(/0\.10/);
  });
});
