"use client";

import { useActionState } from "react";

import {
  deleteExpenseAction,
  type ExpenseActionResult,
} from "@/actions/expenses";
import { Button } from "@/components/ui/button";

/**
 * Delete control for one expense row (Client island). Submits to the Admin-only
 * deleteExpense action (R5, R7); only rendered for Admin viewers (the server table
 * gates on the viewer role). A rejection (e.g. authorization) renders inline.
 */
export function DeleteExpenseButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<
    ExpenseActionResult | null,
    FormData
  >(async (_prev, formData) => deleteExpenseAction(_prev, formData), null);

  return (
    <div className="flex flex-col items-start gap-1">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </form>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
