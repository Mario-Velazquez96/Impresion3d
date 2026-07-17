import "server-only";

import { Prisma } from "@prisma/client";

import { computeBalance, type BalanceSummary } from "@/lib/finances-core";
import { db } from "@/lib/db";
import { registerPrintReference } from "@/lib/services/print-references";
import type {
  CreateSaleInput,
  CreateWithdrawalInput,
} from "@/lib/validation/finance";

/**
 * Business logic for sales & balance (10_sales_and_balance). Authorization
 * happens in the caller (actions/sales.ts: requireUser to record, requireAdmin to
 * delete; actions/withdrawals.ts: requireAdmin for both) — these functions assume
 * the actor is already resolved and authorized. Prisma bypasses RLS, so the
 * server layer is the real guard (Sale/Withdrawal RLS is defense-in-depth).
 *
 * THE BALANCE IS DERIVED, NEVER STORED (R2). There is no balance column, cache,
 * or running total; `getBalanceSummary` recomputes it from the two ledgers on
 * every read, via Postgres aggregates.
 *
 * EXPENSES ARE DELIBERATELY EXCLUDED FROM THE BALANCE (R3). This module NEVER
 * queries `db.expense`. The balance answers "how much revenue came in that hasn't
 * been taken out yet", NOT "what is truly in the bank" — a product decision, not
 * a bug. Supply spending stays a separate 05_expense_tracking concern.
 *
 * MONEY IS EXACT (R7). Amounts are Decimal(10,2); totals are summed IN THE
 * DATABASE via `_sum`; the Decimals cross into the pure core as `.toString()`.
 * `Decimal.toNumber()` and float arithmetic appear NOWHERE in this path.
 */

// 10 references Print with onDelete: Restrict (Sale.printId). Register a print
// reference counter so the print delete-guard (R9) reports a print as in-use
// while any sale points at it, before the DB FK Restrict would block the delete.
// Mirrors how 03/05/06 register catalog counters — see lib/services/print-references.ts
// for why the catalog registry itself cannot be reused (a Print is not a CatalogKey).
registerPrintReference((id) => db.sale.count({ where: { printId: id } }));

// A sale joined with its print, as returned by listSales. `amount` stays a
// Prisma.Decimal — the page maps it to a string for display via formatCurrency,
// never to a JS float.
export type SaleWithPrint = {
  id: string;
  amount: Prisma.Decimal;
  date: Date;
  printId: string;
  buyer: string | null;
  notes: string | null;
  print: { id: string; name: string };
};

// A withdrawal joined with the user who recorded it (the audit trail, R15).
export type WithdrawalWithUser = {
  id: string;
  amount: Prisma.Decimal;
  date: Date;
  reason: string;
  recordedById: string;
  recordedBy: { id: string; name: string };
};

/**
 * THE balance derivation (R2, R3, R5, R7): `sum(Sale.amount) −
 * sum(Withdrawal.amount)`, recomputed on every read and never stored.
 *
 * The two `_sum` aggregates run in the DATABASE — Postgres sums the `numeric`
 * column exactly — rather than fetching rows and summing them in JS, which would
 * be both slower and float-lossy. Each Decimal crosses into the pure core as a
 * STRING (`.toString()`, never `.toNumber()`), where the arithmetic happens in
 * integer cents.
 *
 * An EMPTY ledger makes Postgres return NULL for its sum; `?? null` hands that to
 * `computeBalance`, which treats it as 0 — so an empty system renders $0.00, not
 * blank/NaN/an error (R5).
 *
 * NOTE: `db.expense` is NOT queried here, deliberately (R3). An expense of any
 * size leaves this figure untouched.
 */
export async function getBalanceSummary(): Promise<BalanceSummary> {
  const [sales, withdrawals] = await Promise.all([
    db.sale.aggregate({ _sum: { amount: true } }),
    db.withdrawal.aggregate({ _sum: { amount: true } }),
  ]);

  return computeBalance(
    sales._sum.amount?.toString() ?? null,
    withdrawals._sum.amount?.toString() ?? null,
  );
}

/**
 * All sales ordered by date descending (R17), each including its print in a
 * single query (no N+1).
 */
export async function listSales(): Promise<SaleWithPrint[]> {
  return db.sale.findMany({
    orderBy: { date: "desc" },
    select: {
      id: true,
      amount: true,
      date: true,
      printId: true,
      buyer: true,
      notes: true,
      print: { select: { id: true, name: true } },
    },
  });
}

/**
 * All withdrawals ordered by date descending (R17), each including the user who
 * recorded it (R15) in a single query (no N+1).
 */
export async function listWithdrawals(): Promise<WithdrawalWithUser[]> {
  return db.withdrawal.findMany({
    orderBy: { date: "desc" },
    select: {
      id: true,
      amount: true,
      date: true,
      reason: true,
      recordedById: true,
      recordedBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * Insert a sale (R8). Caller must have Zod-validated `input` and authorized via
 * requireUser. `amount` arrives as a validated string and is stored as a
 * Prisma.Decimal — it is NEVER parsed to a JS float, so the amount round-trips
 * with exact two-decimal precision. A bad printId surfaces as Prisma P2003, which
 * the action maps to a field error (no partial write).
 */
export async function createSale(input: CreateSaleInput) {
  return db.sale.create({
    data: {
      amount: new Prisma.Decimal(input.amount),
      date: input.date,
      printId: input.printId,
      buyer: input.buyer ?? null,
      notes: input.notes ?? null,
    },
  });
}

/**
 * Insert a withdrawal (R15). Note the SECOND PARAMETER: `recordedById` comes from
 * the authenticated actor the action resolved via requireAdmin(), NEVER from the
 * Zod input / FormData (`createWithdrawalSchema` has no such field), so a client
 * cannot forge the audit trail of who took money out. Same Decimal handling as
 * createSale.
 */
export async function createWithdrawal(
  input: CreateWithdrawalInput,
  recordedById: string,
) {
  return db.withdrawal.create({
    data: {
      amount: new Prisma.Decimal(input.amount),
      date: input.date,
      reason: input.reason,
      recordedById,
    },
  });
}

/** Delete a sale by id (R10). Admin-only authorization is the caller's job. */
export async function deleteSale(id: string) {
  return db.sale.delete({ where: { id } });
}

/** Delete a withdrawal by id (R12). Admin-only authorization is the caller's job. */
export async function deleteWithdrawal(id: string) {
  return db.withdrawal.delete({ where: { id } });
}
