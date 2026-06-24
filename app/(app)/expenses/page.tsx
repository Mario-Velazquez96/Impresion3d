import type { Metadata } from "next";

import {
  ExpensesTable,
  type ExpenseRowView,
} from "@/components/expenses/ExpensesTable";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { requireUser } from "@/lib/auth";
import { listCatalog } from "@/lib/services/catalogs";
import { listExpenses } from "@/lib/services/expenses";

export const metadata: Metadata = {
  title: "Expenses — Tower Layers",
};

/**
 * The expenses list (Server Component, R6). The (app) layout already redirects
 * unauthenticated requests; requireUser() here is a second server-layer guard
 * before any data read and also yields the viewer's role (Admins see the delete
 * control, R7). Fetches the date-descending expense list (single query, supply
 * type included) plus the SupplyType catalog for the form select. All
 * interactivity lives in small Client islands (the create/edit dialog, delete).
 */
export default async function ExpensesPage() {
  const user = await requireUser();

  const [expenses, supplyTypes] = await Promise.all([
    listExpenses(),
    listCatalog("supplyType"),
  ]);

  const supplyTypeOptions = supplyTypes.map((s) => ({ id: s.id, name: s.name }));

  const rows: ExpenseRowView[] = expenses.map((expense) => ({
    id: expense.id,
    cost: expense.cost.toString(),
    reason: expense.reason,
    date: expense.date.toISOString(),
    purchaseUrl: expense.purchaseUrl,
    supplyTypeId: expense.supplyTypeId,
    supplyTypeName: expense.supplyType.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <ExpenseFormDialog mode="create" supplyTypes={supplyTypeOptions} />
      </div>

      <ExpensesTable
        rows={rows}
        supplyTypes={supplyTypeOptions}
        canDelete={user.role === "ADMIN"}
      />
    </div>
  );
}
