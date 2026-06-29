"use client";

import { useActionState } from "react";

import {
  setWeekColorsAction,
  type PlanningActionResult,
} from "@/actions/planning";
import type { ColorView } from "@/components/planning/types";

/**
 * The week's color picker (Client island, R3, R11). A swatch multi-select: toggling
 * a color updates the parent's available-color set immediately (so the filtered
 * inventory re-derives with no refetch) AND the picker persists the full set to the
 * server via setWeekColors on Save. Selection state is OWNED by the parent
 * (WeekPlanner) — this is a controlled component — so the matcher and the picker
 * never disagree.
 */
export function ColorPicker({
  weekStartDate,
  allColors,
  selectedIds,
  onToggle,
}: {
  weekStartDate: string;
  allColors: ColorView[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<
    PlanningActionResult | null,
    FormData
  >(async (_prev, formData) => setWeekColorsAction(_prev, formData), null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Colors to dry this week</h2>
        <span className="text-xs text-muted-foreground">
          {selectedIds.size} selected
        </span>
      </div>

      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <div className="flex flex-wrap gap-2">
        {allColors.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No colors in the catalog yet. Add prints with colors first.
          </span>
        ) : (
          allColors.map((color) => {
            const inputId = `week-color-${color.id}`;
            const checked = selectedIds.has(color.id);
            return (
              <label
                key={color.id}
                htmlFor={inputId}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  name="colorIds"
                  value={color.id}
                  checked={checked}
                  onChange={(e) => onToggle(color.id, e.target.checked)}
                  className="size-3.5"
                />
                <span
                  aria-hidden="true"
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: color.hex }}
                />
                {color.name}
              </label>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save colors"}
        </button>
        {state?.ok ? (
          <span role="status" className="text-xs text-muted-foreground">
            Saved.
          </span>
        ) : null}
        {state && !state.ok ? (
          <span role="alert" className="text-xs text-destructive">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
