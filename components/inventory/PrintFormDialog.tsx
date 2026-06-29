"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createPrintAction,
  updatePrintAction,
  type PrintActionResult,
} from "@/actions/prints";
import {
  ColorMultiSelect,
  type ColorOption,
} from "@/components/inventory/ColorMultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Create/edit print dialog (Client island). Renders a trigger button and a native
 * <dialog> form posting multipart FormData (fields + the photo File + repeated
 * colorIds) to createPrint (R5) or updatePrint (R6). The print-type <select> and
 * the ColorMultiSelect are fed from the catalogs. Field errors from the action
 * (name, integer fields, URL, photo constraints, ≥1 color — R10) render inline.
 * Fully keyboard operable: native <dialog>, labelled inputs, real buttons.
 */

export type PrintTypeOption = { id: string; name: string };

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export type EditPrint = {
  id: string;
  name: string;
  printTimeMinutes: number;
  filamentGrams: number;
  documentUrl: string | null;
  printTypeId: string;
  colorIds: string[];
};

export function PrintFormDialog({
  mode,
  printTypes,
  colors,
  print,
}: {
  mode: "create" | "edit";
  printTypes: PrintTypeOption[];
  colors: ColorOption[];
  print?: EditPrint;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const action = mode === "create" ? createPrintAction : updatePrintAction;
  const [state, formAction, pending] = useActionState<
    PrintActionResult | null,
    FormData
  >(async (_prev, formData) => action(_prev, formData), null);

  useEffect(() => {
    if (state?.ok) {
      if (mode === "create") formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state, mode]);

  const title = mode === "create" ? "New print" : "Edit print";
  const idPrefix = mode === "create" ? "new" : `edit-${print?.id ?? "x"}`;

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
          New print
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
        <form
          ref={formRef}
          action={formAction}
          encType="multipart/form-data"
          className="flex flex-col gap-4"
        >
          {mode === "edit" && print ? (
            <input type="hidden" name="id" value={print.id} />
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-name`}>Name</Label>
            <Input
              id={`${idPrefix}-name`}
              name="name"
              defaultValue={print?.name ?? ""}
              required
            />
            {fieldError("name") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("name")}
              </span>
            ) : null}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`${idPrefix}-time`}>Print time (min)</Label>
              <Input
                id={`${idPrefix}-time`}
                name="printTimeMinutes"
                type="number"
                min={0}
                step={1}
                defaultValue={print?.printTimeMinutes ?? ""}
                required
              />
              {fieldError("printTimeMinutes") ? (
                <span role="alert" className="text-xs text-destructive">
                  {fieldError("printTimeMinutes")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`${idPrefix}-grams`}>Filament (g)</Label>
              <Input
                id={`${idPrefix}-grams`}
                name="filamentGrams"
                type="number"
                min={0}
                step={1}
                defaultValue={print?.filamentGrams ?? ""}
                required
              />
              {fieldError("filamentGrams") ? (
                <span role="alert" className="text-xs text-destructive">
                  {fieldError("filamentGrams")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-printType`}>Print type</Label>
            <select
              id={`${idPrefix}-printType`}
              name="printTypeId"
              defaultValue={print?.printTypeId ?? ""}
              required
              className={selectClass}
            >
              <option value="" disabled>
                Select a print type
              </option>
              {printTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {fieldError("printTypeId") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("printTypeId")}
              </span>
            ) : null}
          </div>

          <ColorMultiSelect
            colors={colors}
            defaultSelectedIds={print?.colorIds ?? []}
            error={fieldError("colorIds")}
            idPrefix={idPrefix}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-photo`}>
              Photo {mode === "edit" ? "(replace, optional)" : "(optional)"}
            </Label>
            <input
              id={`${idPrefix}-photo`}
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm"
            />
            {fieldError("photo") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("photo")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-doc`}>Document link (optional)</Label>
            <Input
              id={`${idPrefix}-doc`}
              name="documentUrl"
              type="url"
              defaultValue={print?.documentUrl ?? ""}
              placeholder="https://…"
            />
            {fieldError("documentUrl") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("documentUrl")}
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
