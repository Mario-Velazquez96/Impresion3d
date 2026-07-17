import type { Metadata } from "next";

import { BalanceCard } from "@/components/finances/BalanceCard";
import { SaleFormDialog } from "@/components/finances/SaleFormDialog";
import { SalesTable } from "@/components/finances/SalesTable";
import { WithdrawalFormDialog } from "@/components/finances/WithdrawalFormDialog";
import { WithdrawalsTable } from "@/components/finances/WithdrawalsTable";
import type {
  SaleRowView,
  WithdrawalRowView,
} from "@/components/finances/types";
import { requireUser } from "@/lib/auth";
import {
  getBalanceSummary,
  listSales,
  listWithdrawals,
} from "@/lib/services/finances";
import { listPrints } from "@/lib/services/prints";

export const metadata: Metadata = {
  title: "Finances — Tower Layers",
};

/**
 * The finances page (Server Component, R1, R2, R4, R17): the DERIVED balance
 * headline plus the two ledgers.
 *
 * The (app) layout already redirects unauthenticated requests; requireUser() here
 * is a second server-layer guard before any data read and also yields the
 * viewer's role. There is deliberately NO requireAdmin(): ANY signed-in user
 * (EMPLOYEE or ADMIN) views the balance and both lists (R1). The role only gates
 * the Admin-only CONTROLS (delete, record-withdrawal) — and that gating is UX;
 * the server actions' requireAdmin() calls are the real requirement (R10–R12).
 *
 * ONE Promise.all, four reads, no N+1. The balance is recomputed here on every
 * request from the two `_sum` aggregates — it is never stored (R2), and expenses
 * are never read (R3). Amounts cross to the Client islands as exact decimal
 * STRINGS via `.toString()` — never `.toNumber()`.
 */
export default async function FinancesPage() {
  const user = await requireUser();

  const [summary, sales, withdrawals, prints] = await Promise.all([
    getBalanceSummary(),
    listSales(),
    listWithdrawals(),
    listPrints(),
  ]);

  const isAdmin = user.role === "ADMIN";

  const printOptions = prints.map((print) => ({
    id: print.id,
    name: print.name,
  }));

  const saleRows: SaleRowView[] = sales.map((sale) => ({
    id: sale.id,
    amount: sale.amount.toString(),
    date: sale.date.toISOString(),
    printName: sale.print.name,
    buyer: sale.buyer,
    notes: sale.notes,
  }));

  const withdrawalRows: WithdrawalRowView[] = withdrawals.map((w) => ({
    id: w.id,
    amount: w.amount.toString(),
    date: w.date.toISOString(),
    reason: w.reason,
    recordedByName: w.recordedBy.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Finances</h1>

      <BalanceCard
        summary={{
          salesTotal: summary.salesTotal,
          withdrawalsTotal: summary.withdrawalsTotal,
          balance: summary.balance,
          isNegative: summary.isNegative,
        }}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Sales</h2>
          {/* Any authenticated user may record a sale (R10). */}
          <SaleFormDialog prints={printOptions} />
        </div>
        <SalesTable rows={saleRows} canDelete={isAdmin} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Withdrawals</h2>
          {/* Admin-only control (R11) — hiding is UX; the action enforces it. */}
          {isAdmin ? <WithdrawalFormDialog /> : null}
        </div>
        <WithdrawalsTable rows={withdrawalRows} canDelete={isAdmin} />
      </section>
    </div>
  );
}
