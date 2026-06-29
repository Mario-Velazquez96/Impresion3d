import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { registerCatalogReference } from "@/lib/services/catalogs";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
} from "@/lib/validation/expense";

/**
 * Business logic for expense tracking (05_expense_tracking). Authorization
 * happens in the caller (actions/expenses.ts: requireUser for create/edit,
 * requireAdmin for delete) — these functions assume the actor is already resolved
 * and authorized. Prisma bypasses RLS, so the server layer is the real guard
 * (expense RLS is defense-in-depth).
 *
 * Internal tool: any signed-in user reads/writes all expenses (no per-row
 * ownership scoping); delete is Admin-only, enforced in the action layer.
 */

// 05 references the SupplyType catalog with onDelete: Restrict. Register a
// SupplyType reference counter so the catalog delete-guard (R6 of 02) reports a
// supply type as in-use while any expense points at it, before the DB FK Restrict
// would block the delete. Mirrors how 03 registered taskCategory.
registerCatalogReference("supplyType", (id) =>
  db.expense.count({ where: { supplyTypeId: id } }),
);

// An expense joined with its supply type, as returned by listExpenses. `cost` is
// a Prisma.Decimal — the page maps it to a string for display via formatCurrency,
// never to a JS float.
export type ExpenseWithSupplyType = {
  id: string;
  cost: Prisma.Decimal;
  reason: string;
  date: Date;
  purchaseUrl: string | null;
  supplyTypeId: string;
  supplyType: { id: string; name: string };
};

/**
 * All expenses ordered by date descending (R6), each including its supply type in
 * a single query (no N+1).
 */
export async function listExpenses(): Promise<ExpenseWithSupplyType[]> {
  return db.expense.findMany({
    orderBy: { date: "desc" },
    select: {
      id: true,
      cost: true,
      reason: true,
      date: true,
      purchaseUrl: true,
      supplyTypeId: true,
      supplyType: { select: { id: true, name: true } },
    },
  });
}

/**
 * Insert an expense (R3). Caller must have Zod-validated `input` and authorized
 * via requireUser. `cost` arrives as a validated string and is stored as a
 * Prisma.Decimal — it is NEVER parsed to a JS float, so the amount round-trips
 * with exact two-decimal precision. A bad supplyTypeId surfaces as Prisma P2003,
 * which the action maps to a validation error (no partial write).
 */
export async function createExpense(input: CreateExpenseInput) {
  return db.expense.create({
    data: {
      cost: new Prisma.Decimal(input.cost),
      reason: input.reason,
      date: input.date,
      purchaseUrl: input.purchaseUrl ?? null,
      supplyTypeId: input.supplyTypeId,
    },
  });
}

/**
 * Update an expense by id (R4). Same Decimal handling and P2003 contract as
 * createExpense.
 */
export async function updateExpense(input: UpdateExpenseInput) {
  return db.expense.update({
    where: { id: input.id },
    data: {
      cost: new Prisma.Decimal(input.cost),
      reason: input.reason,
      date: input.date,
      purchaseUrl: input.purchaseUrl ?? null,
      supplyTypeId: input.supplyTypeId,
    },
  });
}

/** Delete an expense by id (R5). Admin-only authorization is the caller's job. */
export async function deleteExpense(id: string) {
  return db.expense.delete({ where: { id } });
}
