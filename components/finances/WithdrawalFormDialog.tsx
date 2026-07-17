"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createWithdrawalAction,
  type WithdrawalActionResult,
} from "@/actions/withdrawals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Record-a-withdrawal dialog (Client island, R11, R14, R15). Amount, date, and a
 * REQUIRED reason — a withdrawal with no stated reason is not auditable.
 *
 * THERE IS DELIBERATELY NO "recorded by" FIELD (R15). Who took the money out is
 * assigned SERVER-SIDE from the authenticated actor in createWithdrawalAction
 * (`user.id` from requireAdmin()); it is never client input, so the audit trail
 * cannot be forged.
 *
 * The page renders this only for Admin viewers — that is UX. The requirement is
 * `createWithdrawalAction`'s requireAdmin() gate (R11), which runs before any
 * validation or DB work; if a non-admin somehow submits, "Not authorized" comes
 * back and surfaces below as an alert.
 */
export function WithdrawalFormDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    WithdrawalActionResult | null,
    FormData
  >(async (_prev, formData) => createWithdrawalAction(_prev, formData), null);

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
      <Button
        type="button"
        variant="outline"
        onClick={() => dialogRef.current?.showModal()}
      >
        Record withdrawal
      </Button>

      <dialog
        ref={dialogRef}
        aria-label="Record withdrawal"
        className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/40"
      >
        <h2 className="mb-4 text-lg font-semibold">Record withdrawal</h2>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="withdrawal-amount">Amount</Label>
            <Input
              id="withdrawal-amount"
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
            <Label htmlFor="withdrawal-date">Date</Label>
            <Input id="withdrawal-date" name="date" type="date" required />
            {fieldError("date") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("date")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="withdrawal-reason">Reason</Label>
            <Input id="withdrawal-reason" name="reason" required />
            {fieldError("reason") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("reason")}
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
