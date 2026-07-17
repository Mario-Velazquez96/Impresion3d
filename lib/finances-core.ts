/**
 * The PURE CORE of sales & balance (10_sales_and_balance) — exact money
 * arithmetic in integer cents and THE balance derivation (R2, R5, R6, R7, R14).
 *
 * Framework-agnostic: no Prisma, no React, and deliberately NO `server-only`.
 * It lives in `lib/` rather than `lib/services/` precisely BECAUSE of that:
 * services are server-only (they touch Prisma via the db singleton), whereas this
 * module is plain arithmetic. Being dependency-free makes it directly
 * unit-testable to 100% branch coverage with no mocks, and leaves it importable
 * from a Client island should one ever need it (mirrors lib/pricing-core.ts).
 *
 * THE BALANCE IS DERIVED, NEVER STORED. Nothing here persists anything; there is
 * no balance column, cache, or running total in the schema. `computeBalance` is
 * re-run on every read from the two ledgers' DB aggregates.
 *
 * EXPENSES ARE DELIBERATELY EXCLUDED. The balance is sales minus withdrawals
 * only — "how much revenue came in that hasn't been taken out yet", NOT "what is
 * truly in the bank". That is a product decision, not an oversight; do not add
 * expenses to this figure.
 *
 * WHY INTEGER CENTS AND NOT `Prisma.Decimal` OR FLOATS:
 *   - `Decimal` lives in `@prisma/client`; importing it here would drag a
 *     server-flavoured dependency into a module that must stay client-importable
 *     and mock-free.
 *   - Floats are simply wrong for money: `0.1 + 0.2 === 0.30000000000000004`, and
 *     `0.29 * 100 === 28.999999999999996`. So `toCents` parses the STRING and
 *     never multiplies a fraction by 100.
 *   - Cents are exact, dependency-free, and trivially testable — and the heavy
 *     summing already happens in Postgres via `_sum`, so this core only ever
 *     handles a handful of values.
 * `Decimal.toNumber()` is used NOWHERE in this feature's data path; the service
 * hands `_sum` Decimals across as `.toString()`.
 */

/** A 2-dp money string as it arrives from a Decimal (`"1350.25"`) or an input. */
export type MoneyString = string;

export type BalanceSummary = {
  salesTotalCents: number;
  withdrawalsTotalCents: number;
  /** May be NEGATIVE — that is a real, displayable state (R6). */
  balanceCents: number;
  salesTotal: MoneyString; // "1350.25"
  withdrawalsTotal: MoneyString; // "850.25"
  balance: MoneyString; // "500.00" / "-150.50"
  isNegative: boolean;
};

// A money value: optional sign, digits, and AT MOST two decimal places. More than
// two decimals is not a rounding opportunity — it is an invalid amount (R14).
const MONEY_REGEX = /^-?\d+(\.\d{1,2})?$/;

/**
 * Exact string→cents (R7). Non-numeric / blank / null / undefined / NaN /
 * Infinity / more-than-2dp → 0. The SIGN IS KEPT (`"-150.50"` → `-15050`), so
 * this is the parsing primitive; clamping is `sanitizeAmountCents`'s job.
 *
 * The arithmetic is deliberately done on the STRING PARTS — `intPart * 100 +
 * fracPart` — never `Number(value) * 100`, which would drift on any fraction that
 * is not exactly representable in binary (`0.29 * 100 → 28.999999999999996`).
 * Both operands here are integers, so the result is exact.
 */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;

  // A number input is stringified rather than multiplied, so it takes the same
  // exact string path. Non-finite numbers stringify to "NaN"/"Infinity", which
  // the regex rejects below.
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (raw.length === 0) return 0;
  if (!MONEY_REGEX.test(raw)) return 0;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, fracPart = ""] = unsigned.split(".");

  // "5" → "00", "5.5" → "50", "5.55" → "55". Integer math only.
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/**
 * `toCents` + CLAMP negatives to 0 — the ledger-amount choke point (R14),
 * mirroring `lib/pricing-core.ts#sanitizeAmount`. Blank / null / undefined /
 * non-numeric / NaN / Infinity / >2dp → 0, and any negative is clamped to 0, so a
 * bad value can never REDUCE a total nor propagate NaN into a displayed figure.
 *
 * Zod (`lib/validation/finance.ts`) is the REJECTION boundary for user input;
 * this clamp is the independent belt-and-braces on the derivation side.
 */
export function sanitizeAmountCents(
  value: string | number | null | undefined,
): number {
  const cents = toCents(value);
  return cents > 0 ? cents : 0;
}

/**
 * cents → a 2-dp money string, SIGN PRESERVED: `-15050` → `"-150.50"`, `-5` →
 * `"-0.05"`, `30` → `"0.30"` (R6, R7). No rounding happens here — cents are
 * already exact integers; this is pure formatting of an exact value. The only
 * rounding/locale step in the feature is `formatCurrency` at the display edge.
 */
export function fromCents(cents: number): MoneyString {
  // Defensive: a non-finite/fractional cents value can only arrive from a caller
  // outside this module's contract; treat it as 0 rather than emitting "NaN".
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${negative ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`;
}

/**
 * Sum ledger amounts exactly, in cents (R7, R14). Each value is sanitized first,
 * so a negative/invalid row contributes 0 and can never reduce the total.
 */
export function sumAmountCents(
  values: (string | number | null | undefined)[],
): number {
  return values.reduce<number>((sum, v) => sum + sanitizeAmountCents(v), 0);
}

/**
 * THE derivation (R2): `balance = sales − withdrawals`. Both inputs are the DB
 * `_sum` aggregates as strings; `null`/`undefined` (an EMPTY ledger — Postgres
 * returns NULL for a sum over no rows) is treated as 0, so an empty system shows
 * `$0.00`, never blank/NaN/an error (R5).
 *
 * Each INPUT TOTAL is sanitized (a ledger total is never legitimately negative),
 * but THE RESULT IS NOT CLAMPED: when withdrawals exceed sales the balance is
 * genuinely negative and is returned as-is, signed, with `isNegative` set (R6).
 * A negative balance is a true state the operator must see — not something to
 * hide, zero out, or show as an absolute value.
 */
export function computeBalance(
  salesTotal: string | number | null | undefined,
  withdrawalsTotal: string | number | null | undefined,
): BalanceSummary {
  const salesTotalCents = sanitizeAmountCents(salesTotal);
  const withdrawalsTotalCents = sanitizeAmountCents(withdrawalsTotal);
  const balanceCents = salesTotalCents - withdrawalsTotalCents;

  return {
    salesTotalCents,
    withdrawalsTotalCents,
    balanceCents,
    salesTotal: fromCents(salesTotalCents),
    withdrawalsTotal: fromCents(withdrawalsTotalCents),
    balance: fromCents(balanceCents),
    isNegative: balanceCents < 0,
  };
}
