"use client";

import { DeleteWithdrawalButton } from "@/components/finances/DeleteWithdrawalButton";
import type { WithdrawalRowView } from "@/components/finances/types";
import { formatCurrency } from "@/lib/format";

/**
 * The withdrawals ledger list (Client island, R17). Rows are pre-ordered by date
 * DESCENDING by the service (a single query with the recording user joined — no
 * N+1). Each row shows WHO recorded the withdrawal (R15) — the audit trail of who
 * took money out, assigned server-side from the session.
 *
 * `canDelete` gates the delete control for Admin viewers — UX ONLY. The real gate
 * is `deleteWithdrawalAction`'s requireAdmin() (R12).
 */

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : dateFormatter.format(parsed);
}

export function WithdrawalsTable({
  rows,
  canDelete,
}: {
  rows: WithdrawalRowView[];
  canDelete: boolean;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Withdrawals, most recent first</caption>
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4 font-medium">Amount</th>
          <th className="py-2 pr-4 font-medium">Date</th>
          <th className="py-2 pr-4 font-medium">Reason</th>
          <th className="py-2 pr-4 font-medium">Recorded by</th>
          <th className="py-2 pr-4 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="py-3 text-muted-foreground" colSpan={5}>
              No withdrawals recorded yet.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-b align-middle">
              <td className="py-2 pr-4 font-medium tabular-nums">
                {formatCurrency(row.amount)}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {formatDate(row.date)}
              </td>
              <td className="py-2 pr-4">{row.reason}</td>
              <td className="py-2 pr-4">{row.recordedByName}</td>
              <td className="py-2 pr-4">
                {canDelete ? <DeleteWithdrawalButton id={row.id} /> : null}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
