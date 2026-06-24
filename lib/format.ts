/**
 * Centralized display formatters (05_expense_tracking).
 *
 * Currency formatting lives in ONE place so the app's currency can be changed by
 * editing this module alone. Amounts are STORED as Prisma `Decimal` (exact
 * two-decimal precision); formatting here is display-only and accepts the value
 * as a string or number so the caller can pass a Decimal's `.toString()` without
 * ever creating a lossy JS float for storage.
 */

const CURRENCY_LOCALE = "es-MX";
const CURRENCY_CODE = "MXN";

const currencyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: "currency",
  currency: CURRENCY_CODE,
});

/**
 * Format a monetary amount for display, e.g. `formatCurrency("1234.5")` →
 * "$1,234.50". Accepts a string (preferred — pass a Prisma Decimal's
 * `.toString()`) or a number. A non-finite/unparseable value yields the
 * formatter's representation of 0 rather than throwing, so a render never breaks.
 */
export function formatCurrency(amount: string | number): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}
