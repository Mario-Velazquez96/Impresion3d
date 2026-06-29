import { DeleteExpenseButton } from "@/components/expenses/DeleteExpenseButton";
import {
  ExpenseFormDialog,
  type EditExpense,
  type SupplyTypeOption,
} from "@/components/expenses/ExpenseFormDialog";
import { formatCurrency } from "@/lib/format";

/**
 * The expenses list (Server Component, R6). Rows are pre-ordered by date
 * descending by the service. Each row shows the formatted cost (central
 * formatCurrency), date, supply type, the purchase link when present, and
 * edit/delete controls. Delete is only rendered for Admin viewers (R7) — the
 * action also enforces requireAdmin as the real guard.
 */

export type ExpenseRowView = {
  id: string;
  cost: string; // exact decimal string from Prisma.Decimal.toString()
  reason: string;
  date: string; // ISO string
  purchaseUrl: string | null;
  supplyTypeId: string;
  supplyTypeName: string;
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : dateFormatter.format(parsed);
}

export function ExpensesTable({
  rows,
  supplyTypes,
  canDelete,
}: {
  rows: ExpenseRowView[];
  supplyTypes: SupplyTypeOption[];
  canDelete: boolean;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4 font-medium">Cost</th>
          <th className="py-2 pr-4 font-medium">Reason</th>
          <th className="py-2 pr-4 font-medium">Date</th>
          <th className="py-2 pr-4 font-medium">Supply type</th>
          <th className="py-2 pr-4 font-medium">Link</th>
          <th className="py-2 pr-4 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="py-3 text-muted-foreground" colSpan={6}>
              No expenses recorded yet.
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const editExpense: EditExpense = {
              id: row.id,
              cost: row.cost,
              reason: row.reason,
              date: row.date,
              purchaseUrl: row.purchaseUrl,
              supplyTypeId: row.supplyTypeId,
            };
            return (
              <tr key={row.id} className="border-b align-middle">
                <td className="py-2 pr-4 font-medium tabular-nums">
                  {formatCurrency(row.cost)}
                </td>
                <td className="py-2 pr-4">{row.reason}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {formatDate(row.date)}
                </td>
                <td className="py-2 pr-4">{row.supplyTypeName}</td>
                <td className="py-2 pr-4">
                  {row.purchaseUrl ? (
                    <a
                      href={row.purchaseUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2"
                    >
                      Link
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <ExpenseFormDialog
                      mode="edit"
                      supplyTypes={supplyTypes}
                      expense={editExpense}
                    />
                    {canDelete ? <DeleteExpenseButton id={row.id} /> : null}
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
