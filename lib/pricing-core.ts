/**
 * The PURE CORE of the price calculator (09_price_calculator) — electricity cost
 * + per-color filament cost + the totals (R2, R3, R4, R7, R8, R11).
 *
 * Framework-agnostic: no Prisma, no React, and deliberately NO `server-only`.
 * It lives in `lib/` rather than `lib/services/` precisely BECAUSE of that:
 * services are server-only (they touch Prisma via the db singleton), whereas this
 * module is plain arithmetic that the Client island imports directly to re-derive
 * the breakdown on every keystroke — importing a server guard into the browser
 * bundle would break that. Being dependency-free also makes it directly
 * unit-testable to 100% branch coverage with no mocks (mirrors lib/planning-core.ts).
 *
 * The calculator is STATELESS: nothing here is ever persisted. Money is computed
 * as plain floats, summed unrounded, and rounded ONCE at the display edge via
 * `roundMoney` before `formatCurrency`. (The `Decimal` rule protects STORED
 * amounts; nothing here is stored.)
 */

/** One filament line: a color plus what it costs to use. */
export type FilamentInput = {
  /** null = no color chosen yet — the row still costs money. */
  colorId: string | null;
  /** May arrive blank/NaN/negative from an input; sanitized before the math. */
  grams: number;
  /** SPOOL price, per KILOGRAM. Converted to a per-gram rate in the math. */
  pricePerKg: number;
};

export type CalculatorInput = {
  powerPricePerHour: number;
  printTimeMinutes: number;
  rows: FilamentInput[];
};

/** One computed filament line, 1:1 with its input row (order preserved). */
export type FilamentLine = { colorId: string | null; cost: number };

export type Breakdown = {
  powerCost: number;
  filamentLines: FilamentLine[];
  filamentTotal: number;
  total: number;
};

/**
 * The single choke point every numeric passes through before any multiplication.
 * Blank / empty / null / undefined / non-numeric / NaN / Infinity → 0 (R7), and
 * any negative value is CLAMPED to 0 (R8), so a negative can never reduce a total
 * and NaN/Infinity can never propagate into a figure the user sees.
 */
export function sanitizeAmount(
  value: number | string | null | undefined,
): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Electricity: `pricePerHour × (minutes / 60)` (R2). Inputs sanitized first. */
export function powerCost(pricePerHour: number, minutes: number): number {
  return sanitizeAmount(pricePerHour) * (sanitizeAmount(minutes) / 60);
}

/**
 * One row: `grams × (pricePerKg / 1000)` (R3) — the kg→g conversion, so a price
 * quoted per kilogram is charged per gram actually used.
 */
export function filamentRowCost(grams: number, pricePerKg: number): number {
  return sanitizeAmount(grams) * (sanitizeAmount(pricePerKg) / 1000);
}

/**
 * The whole breakdown (R4): one line per input row in input order, the filament
 * subtotal (their sum), and `total = powerCost + filamentTotal`. Costs are summed
 * UNROUNDED — `roundMoney` is applied by the caller at the display edge only, so
 * intermediate float drift never surfaces as e.g. "$27.249999".
 */
export function calculateBreakdown(input: CalculatorInput): Breakdown {
  const power = powerCost(input.powerPricePerHour, input.printTimeMinutes);

  const filamentLines: FilamentLine[] = input.rows.map((row) => ({
    colorId: row.colorId,
    cost: filamentRowCost(row.grams, row.pricePerKg),
  }));

  const filamentTotal = filamentLines.reduce((sum, line) => sum + line.cost, 0);

  return {
    powerCost: power,
    filamentLines,
    filamentTotal,
    total: power + filamentTotal,
  };
}

/**
 * Round to 2 dp for DISPLAY only (R11). Kills binary-float drift (a total landing
 * on 27.249999999999996 renders as 27.25). Never used to store a value — nothing
 * the calculator computes is stored.
 */
export function roundMoney(value: number): number {
  const n = sanitizeAmount(value);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
