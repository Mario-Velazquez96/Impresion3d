import type { BalanceView } from "@/components/finances/types";
import { formatCurrency } from "@/lib/format";

/**
 * The balance headline (Server Component — no interactivity, so no "use client").
 *
 * The figure is DERIVED server-side (`getBalanceSummary()` → the two `_sum`
 * aggregates → `lib/finances-core.ts` in integer cents) and arrives here as an
 * exact string. `formatCurrency` is the SINGLE rounding/formatting step in the
 * whole money path (R7) — there is no arithmetic in this component.
 *
 * THE LABEL IS A REQUIREMENT (R4), not decoration: the figure is sales minus
 * withdrawals and does NOT include expenses, so it must never be misread as a
 * bank balance. It is rendered as real, readable text (not a title/tooltip) so it
 * is both visible and assertable, and it has its own test.
 *
 * A NEGATIVE balance is a true, displayable state (R6): it renders AS-IS with its
 * sign and exact magnitude (e.g. -$150.50) — never clamped to zero, hidden, or
 * shown as an absolute value — with a destructive style AND an accessible textual
 * marker, since colour/sign alone is not an accessible signal.
 */
export function BalanceCard({ summary }: { summary: BalanceView }) {
  return (
    <section
      aria-label="Account balance"
      className="flex flex-col gap-3 rounded-lg border bg-card p-6 text-card-foreground"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-muted-foreground">Balance</h2>
        <p
          data-testid="balance-figure"
          className={`text-4xl font-bold tabular-nums ${
            summary.isNegative ? "text-destructive" : ""
          }`}
        >
          {formatCurrency(summary.balance)}
        </p>
        {summary.isNegative ? (
          <p className="text-sm font-medium text-destructive">
            Negative balance
          </p>
        ) : null}
        {/* R4: the figure is NOT a bank balance — expenses are excluded by design. */}
        <p className="text-sm text-muted-foreground">
          Sales minus withdrawals — does not include expenses
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t pt-3 text-sm">
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Sales</dt>
          <dd data-testid="sales-total" className="font-medium tabular-nums">
            {formatCurrency(summary.salesTotal)}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Withdrawals</dt>
          <dd
            data-testid="withdrawals-total"
            className="font-medium tabular-nums"
          >
            {formatCurrency(summary.withdrawalsTotal)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
