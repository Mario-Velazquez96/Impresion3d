"use client";

import { useActionState, useEffect, useRef } from "react";

import { createSaleAction, type SaleActionResult } from "@/actions/sales";
import type { PrintOptionView } from "@/components/finances/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Record-a-sale dialog (Client island, R8, R10, R14). Renders a trigger button and
 * a native <dialog> form that submits to createSaleAction.
 *
 * Available to EVERY authenticated user — recording revenue is not an Admin-only
 * act (R10); the action's requireUser() is the gate.
 *
 * The print <select> is REQUIRED (R8): a sale always references an inventory
 * print. `required` here is UX; Zod (`printId` non-empty) and the DB FK are the
 * real enforcement, and their field errors render inline — including the friendly
 * "That print no longer exists" mapped from a P2003.
 *
 * Editing a sale is deliberately out of scope: rows are append-and-delete only.
 */

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function SaleFormDialog({ prints }: { prints: PrintOptionView[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    SaleActionResult | null,
    FormData
  >(async (_prev, formData) => createSaleAction(_prev, formData), null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state]);

  const fieldError = (field: string) =>
    state && !state.ok
      ? state.fieldErrors?.find((e) => e.field === field)?.message
      : undefined;
  const formError =
    state && !state.ok && (!state.fieldErrors || state.fieldErrors.length === 0)
      ? state.error
      : undefined;

  return (
    <>
      <Button type="button" onClick={() => dialogRef.current?.showModal()}>
        Record sale
      </Button>

      <dialog
        ref={dialogRef}
        aria-label="Record sale"
        className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/40"
      >
        <h2 className="mb-4 text-lg font-semibold">Record sale</h2>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sale-amount">Amount</Label>
            <Input
              id="sale-amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
            {fieldError("amount") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("amount")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sale-date">Date</Label>
            <Input id="sale-date" name="date" type="date" required />
            {fieldError("date") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("date")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sale-print">Print</Label>
            <select
              id="sale-print"
              name="printId"
              defaultValue=""
              required
              className={selectClass}
            >
              <option value="" disabled>
                Select a print
              </option>
              {prints.map((print) => (
                <option key={print.id} value={print.id}>
                  {print.name}
                </option>
              ))}
            </select>
            {fieldError("printId") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("printId")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sale-buyer">Buyer (optional)</Label>
            <Input id="sale-buyer" name="buyer" />
            {fieldError("buyer") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("buyer")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sale-notes">Notes (optional)</Label>
            <Input id="sale-notes" name="notes" />
            {fieldError("notes") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("notes")}
              </span>
            ) : null}
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
