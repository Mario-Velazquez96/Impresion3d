"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createCatalog,
  deleteCatalog,
  updateCatalog,
  type CatalogActionResult,
} from "@/actions/catalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogKey } from "@/lib/validation/catalog";

export type CatalogRowView = { id: string; name: string; hex?: string };

/**
 * One catalog's rows + add/edit dialog + delete (R4, R6, R8). The Colors table
 * (hasHex) shows a color swatch and a hex input. Add/edit submit to the generic
 * create/update actions; delete submits to deleteCatalog, which blocks in-use
 * values and returns a friendly message we render inline (R6). Fully keyboard
 * operable: native <dialog>, real buttons, labelled inputs.
 */
export function CatalogTable({
  catalog,
  label,
  hasHex,
  rows,
}: {
  catalog: CatalogKey;
  label: string;
  hasHex: boolean;
  rows: CatalogRowView[];
}) {
  const singular = label.replace(/s$/, "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{label}</h2>
        <AddRowDialog catalog={catalog} singular={singular} hasHex={hasHex} />
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            {hasHex ? <th className="w-16 py-2 pr-4 font-medium">Swatch</th> : null}
            <th className="py-2 pr-4 font-medium">Name</th>
            {hasHex ? <th className="py-2 pr-4 font-medium">Hex</th> : null}
            <th className="py-2 pr-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                className="py-3 text-muted-foreground"
                colSpan={hasHex ? 4 : 2}
              >
                No values yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <CatalogRow
                key={row.id}
                catalog={catalog}
                singular={singular}
                hasHex={hasHex}
                row={row}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CatalogRow({
  catalog,
  singular,
  hasHex,
  row,
}: {
  catalog: CatalogKey;
  singular: string;
  hasHex: boolean;
  row: CatalogRowView;
}) {
  const [deleteState, deleteAction, deletePending] = useActionState<
    CatalogActionResult | null,
    FormData
  >(async (_prev, formData) => deleteCatalog(_prev, formData), null);

  return (
    <tr className="border-b align-middle">
      {hasHex ? (
        <td className="py-2 pr-4">
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 rounded border"
            style={{ backgroundColor: row.hex }}
          />
        </td>
      ) : null}
      <td className="py-2 pr-4">{row.name}</td>
      {hasHex ? (
        <td className="py-2 pr-4 font-mono text-xs">{row.hex}</td>
      ) : null}
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <EditRowDialog
            catalog={catalog}
            singular={singular}
            hasHex={hasHex}
            row={row}
          />
          <form action={deleteAction}>
            <input type="hidden" name="catalog" value={catalog} />
            <input type="hidden" name="id" value={row.id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={deletePending}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </Button>
          </form>
        </div>
        {deleteState && !deleteState.ok ? (
          <span role="alert" className="mt-1 block text-xs text-destructive">
            {deleteState.error}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function AddRowDialog({
  catalog,
  singular,
  hasHex,
}: {
  catalog: CatalogKey;
  singular: string;
  hasHex: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    CatalogActionResult | null,
    FormData
  >(async (_prev, formData) => createCatalog(_prev, formData), null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state]);

  return (
    <>
      <Button type="button" onClick={() => dialogRef.current?.showModal()}>
        Add {singular.toLowerCase()}
      </Button>
      <CatalogDialog
        dialogRef={dialogRef}
        formRef={formRef}
        title={`Add ${singular.toLowerCase()}`}
        catalog={catalog}
        hasHex={hasHex}
        formAction={formAction}
        pending={pending}
        state={state}
        submitLabel="Add"
      />
    </>
  );
}

function EditRowDialog({
  catalog,
  singular,
  hasHex,
  row,
}: {
  catalog: CatalogKey;
  singular: string;
  hasHex: boolean;
  row: CatalogRowView;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    CatalogActionResult | null,
    FormData
  >(async (_prev, formData) => updateCatalog(_prev, formData), null);

  useEffect(() => {
    if (state?.ok) {
      dialogRef.current?.close();
    }
  }, [state]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Edit
      </Button>
      <CatalogDialog
        dialogRef={dialogRef}
        formRef={formRef}
        title={`Edit ${singular.toLowerCase()}`}
        catalog={catalog}
        hasHex={hasHex}
        id={row.id}
        defaultName={row.name}
        defaultHex={row.hex}
        formAction={formAction}
        pending={pending}
        state={state}
        submitLabel="Save"
      />
    </>
  );
}

function CatalogDialog({
  dialogRef,
  formRef,
  title,
  catalog,
  hasHex,
  id,
  defaultName,
  defaultHex,
  formAction,
  pending,
  state,
  submitLabel,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  formRef: React.RefObject<HTMLFormElement | null>;
  title: string;
  catalog: CatalogKey;
  hasHex: boolean;
  id?: string;
  defaultName?: string;
  defaultHex?: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: CatalogActionResult | null;
  submitLabel: string;
}) {
  const nameId = `${catalog}-${id ?? "new"}-name`;
  const hexId = `${catalog}-${id ?? "new"}-hex`;
  const nameError = state && !state.ok
    ? state.fieldErrors?.find((e) => e.field === "name")?.message
    : undefined;
  const hexError = state && !state.ok
    ? state.fieldErrors?.find((e) => e.field === "hex")?.message
    : undefined;

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/40"
    >
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="catalog" value={catalog} />
        {id ? <input type="hidden" name="id" value={id} /> : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor={nameId}>Name</Label>
          <Input id={nameId} name="name" defaultValue={defaultName} required />
          {nameError ? (
            <span role="alert" className="text-xs text-destructive">
              {nameError}
            </span>
          ) : null}
        </div>

        {hasHex ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={hexId}>Hex (#RRGGBB)</Label>
            <div className="flex items-center gap-2">
              <Input
                id={hexId}
                name="hex"
                defaultValue={defaultHex ?? "#000000"}
                pattern="#[0-9a-fA-F]{6}"
                className="font-mono"
                required
              />
            </div>
            {hexError ? (
              <span role="alert" className="text-xs text-destructive">
                {hexError}
              </span>
            ) : null}
          </div>
        ) : null}

        {state && !state.ok && !nameError && !hexError ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
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
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
