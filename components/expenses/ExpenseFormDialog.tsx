"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createExpenseAction,
  updateExpenseAction,
  type ExpenseActionResult,
} from "@/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Create/edit expense dialog (Client island). Renders a trigger button and a
 * native <dialog> form that submits to createExpense (R3) or updateExpense (R4).
 * The supply-type <select> is fed from the SupplyType catalog. Fully keyboard
 * operable: native <dialog>, labelled inputs, real buttons. Field errors from the
 * action (invalid cost R8, bad URL R9, bad supply-type FK) render inline.
 */

export type SupplyTypeOption = { id: string; name: string };

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export type EditExpense = {
  id: string;
  cost: string; // exact decimal string, e.g. "12.50"
  reason: string;
  date: string; // ISO string
  purchaseUrl: string | null;
  supplyTypeId: string;
};

export function ExpenseFormDialog({
  mode,
  supplyTypes,
  expense,
}: {
  mode: "create" | "edit";
  supplyTypes: SupplyTypeOption[];
  expense?: EditExpense;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const action = mode === "create" ? createExpenseAction : updateExpenseAction;
  const [state, formAction, pending] = useActionState<
    ExpenseActionResult | null,
    FormData
  >(async (_prev, formData) => action(_prev, formData), null);

  useEffect(() => {
    if (state?.ok) {
      if (mode === "create") formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state, mode]);

  const title = mode === "create" ? "New expense" : "Edit expense";
  const idPrefix = mode === "create" ? "new" : `edit-${expense?.id ?? "x"}`;
  const dateValue = expense?.date ? expense.date.slice(0, 10) : "";

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
      {mode === "create" ? (
        <Button type="button" onClick={() => dialogRef.current?.showModal()}>
          New expense
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dialogRef.current?.showModal()}
        >
          Edit
        </Button>
      )}

      <dialog
        ref={dialogRef}
        aria-label={title}
        className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/40"
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          {mode === "edit" && expense ? (
            <input type="hidden" name="id" value={expense.id} />
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-cost`}>Cost</Label>
            <Input
              id={`${idPrefix}-cost`}
              name="cost"
              type="text"
              inputMode="decimal"
              defaultValue={expense?.cost ?? ""}
              placeholder="0.00"
              required
            />
            {fieldError("cost") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("cost")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-reason`}>Reason</Label>
            <Input
              id={`${idPrefix}-reason`}
              name="reason"
              defaultValue={expense?.reason ?? ""}
              required
            />
            {fieldError("reason") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("reason")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-date`}>Date</Label>
            <Input
              id={`${idPrefix}-date`}
              name="date"
              type="date"
              defaultValue={dateValue}
              required
            />
            {fieldError("date") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("date")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-supplyType`}>Supply type</Label>
            <select
              id={`${idPrefix}-supplyType`}
              name="supplyTypeId"
              defaultValue={expense?.supplyTypeId ?? ""}
              required
              className={selectClass}
            >
              <option value="" disabled>
                Select a supply type
              </option>
              {supplyTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {fieldError("supplyTypeId") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("supplyTypeId")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-url`}>Purchase link (optional)</Label>
            <Input
              id={`${idPrefix}-url`}
              name="purchaseUrl"
              type="url"
              defaultValue={expense?.purchaseUrl ?? ""}
              placeholder="https://…"
            />
            {fieldError("purchaseUrl") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("purchaseUrl")}
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
              {pending ? "Saving…" : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
