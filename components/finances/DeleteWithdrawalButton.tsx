"use client";

import { useActionState } from "react";

import {
  deleteWithdrawalAction,
  type WithdrawalActionResult,
} from "@/actions/withdrawals";
import { Button } from "@/components/ui/button";

/**
 * Delete control for one withdrawal row (Client island). Submits to the
 * Admin-only deleteWithdrawal action (R12); only rendered for Admin viewers —
 * hiding is UX, the action's requireAdmin() is the real guard. A rejection
 * renders inline.
 */
export function DeleteWithdrawalButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<
    WithdrawalActionResult | null,
    FormData
  >(async (_prev, formData) => deleteWithdrawalAction(_prev, formData), null);

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
