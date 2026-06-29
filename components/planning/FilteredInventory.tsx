"use client";

import { useActionState } from "react";

import {
  assignItemAction,
  type PlanningActionResult,
} from "@/actions/planning";
import { SwatchList } from "@/components/planning/Swatch";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  type ColorView,
  type PrintView,
} from "@/components/planning/types";
import type { MatchMode } from "@/components/planning/MatchModeToggle";

/**
 * The filtered inventory (Client island, R4–R6, R11). Renders the result of the
 * pure matcher: in full mode just the producible prints; in partial mode each print
 * plus "missing colors" swatch badges. Each card has a day <Select> + Assign button
 * (the required fallback — no dnd) that posts to assignItem. With no colors selected
 * both modes are empty, so an informative empty state shows (R6).
 */

export type InventoryEntry = {
  print: PrintView;
  missingColors: ColorView[];
};

export function FilteredInventory({
  weekStartDate,
  mode,
  entries,
  hasColors,
}: {
  weekStartDate: string;
  mode: MatchMode;
  entries: InventoryEntry[];
  hasColors: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {hasColors
          ? mode === "full"
            ? "No prints are fully producible with the selected colors."
            : "No prints share any color with the selected colors."
          : "Select the colors to dry this week to see producible prints."}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <li
          key={entry.print.id}
          className="flex flex-col gap-2 rounded-lg border p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{entry.print.name}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Colors</span>
            <SwatchList colors={entry.print.colors} />
          </div>

          {mode === "partial" && entry.missingColors.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-destructive">
                Missing colors
              </span>
              <SwatchList colors={entry.missingColors} />
            </div>
          ) : null}

          <AssignControl
            weekStartDate={weekStartDate}
            printId={entry.print.id}
          />
        </li>
      ))}
    </ul>
  );
}

/** Per-print day Select + Assign button (R7). */
function AssignControl({
  weekStartDate,
  printId,
}: {
  weekStartDate: string;
  printId: string;
}) {
  const [state, formAction, pending] = useActionState<
    PlanningActionResult | null,
    FormData
  >(async (_prev, formData) => assignItemAction(_prev, formData), null);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="weekStartDate" value={weekStartDate} />
      <input type="hidden" name="printId" value={printId} />
      <div className="flex items-center gap-2">
        <label htmlFor={`assign-${printId}`} className="sr-only">
          Assign to day
        </label>
        <select
          id={`assign-${printId}`}
          name="dayOfWeek"
          defaultValue={WEEKDAYS[0]}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        >
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {WEEKDAY_LABELS[day]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {pending ? "…" : "Assign"}
        </button>
      </div>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
