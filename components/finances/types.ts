/**
 * Client-safe view types for the finances UI (10_sales_and_balance, R17).
 *
 * Declared HERE rather than imported from `lib/services/finances.ts`: that module
 * is `server-only` and its row types carry `Prisma.Decimal`/`Date`, neither of
 * which may cross the Server→Client boundary. The page maps its reads to these
 * shapes (mirrors components/calculator/types.ts).
 *
 * EVERY MONETARY AMOUNT HERE IS A STRING — the exact decimal from
 * `Prisma.Decimal.toString()` (e.g. "1350.25"), never a JS float. Components
 * format it with `formatCurrency` at the display edge; no client-side money math.
 */

/** One sale row, pre-ordered date-descending by the service. */
export type SaleRowView = {
  id: string;
  amount: string; // exact decimal string, e.g. "1250.00"
  date: string; // ISO string
  printName: string;
  buyer: string | null;
  notes: string | null;
};

/** One withdrawal row, pre-ordered date-descending, with the audit trail (R15). */
export type WithdrawalRowView = {
  id: string;
  amount: string; // exact decimal string
  date: string; // ISO string
  reason: string;
  recordedByName: string;
};

/** A print option for the sale form's required print select (R8). */
export type PrintOptionView = { id: string; name: string };

/**
 * The DERIVED balance, computed server-side by `getBalanceSummary()` and passed
 * down for display only. Never stored, never recomputed in the browser.
 */
export type BalanceView = {
  salesTotal: string; // "1350.25"
  withdrawalsTotal: string; // "850.25"
  balance: string; // "500.00" / "-150.50" — signed, never clamped (R6)
  isNegative: boolean;
};
