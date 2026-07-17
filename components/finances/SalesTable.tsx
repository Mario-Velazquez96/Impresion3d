"use client";

import { DeleteSaleButton } from "@/components/finances/DeleteSaleButton";
import type { SaleRowView } from "@/components/finances/types";
import { formatCurrency } from "@/lib/format";

/**
 * The sales ledger list (Client island, R17). Rows are pre-ordered by date
 * DESCENDING by the service (a single query with the print joined — no N+1); this
 * component does not sort, filter, or do any money math. Amounts arrive as exact
 * decimal strings and are formatted at the display edge via `formatCurrency`.
 *
 * `canDelete` gates the delete control for Admin viewers — UX ONLY. The real gate
 * is `deleteSaleAction`'s requireAdmin() (R10).
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

export function SalesTable({
  rows,
  canDelete,
}: {
  rows: SaleRowView[];
  canDelete: boolean;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Sales, most recent first</caption>
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4 font-medium">Amount</th>
          <th className="py-2 pr-4 font-medium">Date</th>
          <th className="py-2 pr-4 font-medium">Print</th>
          <th className="py-2 pr-4 font-medium">Buyer</th>
          <th className="py-2 pr-4 font-medium">Notes</th>
          <th className="py-2 pr-4 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="py-3 text-muted-foreground" colSpan={6}>
              No sales recorded yet.
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
              <td className="py-2 pr-4">{row.printName}</td>
              <td className="py-2 pr-4">
                {row.buyer ?? <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2 pr-4">
                {row.notes ?? <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2 pr-4">
                {canDelete ? <DeleteSaleButton id={row.id} /> : null}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
