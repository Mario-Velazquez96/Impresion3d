"use client";

import { useActionState } from "react";

import { deleteSaleAction, type SaleActionResult } from "@/actions/sales";
import { Button } from "@/components/ui/button";

/**
 * Delete control for one sale row (Client island). Submits to the Admin-only
 * deleteSale action (R10); only rendered for Admin viewers — the table gates on
 * the viewer role, but THAT IS UX ONLY: the action's requireAdmin() is the real
 * guard. A rejection (e.g. authorization) renders inline.
 */
export function DeleteSaleButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<
    SaleActionResult | null,
    FormData
  >(async (_prev, formData) => deleteSaleAction(_prev, formData), null);

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
