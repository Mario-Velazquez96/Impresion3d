"use client";

import { useActionState } from "react";

import {
  deletePrintAction,
  type PrintActionResult,
} from "@/actions/prints";
import { Button } from "@/components/ui/button";

/**
 * Delete control for one print (Client island). Submits to the Admin-only
 * deletePrint action (R7, R9); only rendered for Admin viewers (the server gates on
 * the viewer role). A rejection (e.g. authorization) renders inline.
 */
export function DeletePrintButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<
    PrintActionResult | null,
    FormData
  >(async (_prev, formData) => deletePrintAction(_prev, formData), null);

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
