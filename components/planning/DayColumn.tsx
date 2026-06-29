"use client";

import { useActionState } from "react";

import {
  moveItemAction,
  removeItemAction,
  type PlanningActionResult,
} from "@/actions/planning";
import { SwatchList } from "@/components/planning/Swatch";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  type ColorView,
  type ItemView,
  type Weekday,
} from "@/components/planning/types";

/**
 * One day's column in the week grid (Client island, R8, R9, R11). Lists the day's
 * planned prints (each with a move <Select> to change day — the required fallback —
 * and a Remove button) and the day's "dry the day before" panel: the colors that
 * must be dried TODAY so the prints planned for TOMORROW are ready (derived,
 * never stored).
 */
export function DayColumn({
  day,
  items,
  dryColors,
}: {
  day: Weekday;
  items: ItemView[];
  dryColors: ColorView[];
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">{WEEKDAY_LABELS[day]}</h3>

      <ul className="flex flex-col gap-2">
        {items.length === 0 ? (
          <li className="text-xs text-muted-foreground">No prints planned.</li>
        ) : (
          items.map((item) => <PlannedItem key={item.id} item={item} />)
        )}
      </ul>

      <div className="mt-2 flex flex-col gap-1 border-t pt-2">
        <span className="text-xs font-medium">Dry the day before</span>
        <SwatchList colors={dryColors} emptyLabel="Nothing to dry" />
      </div>
    </section>
  );
}

/** A single planned print: its colors, a move Select, and a Remove button. */
function PlannedItem({ item }: { item: ItemView }) {
  const [moveState, moveAction, movePending] = useActionState<
    PlanningActionResult | null,
    FormData
  >(async (_prev, formData) => moveItemAction(_prev, formData), null);
  const [removeState, removeAction, removePending] = useActionState<
    PlanningActionResult | null,
    FormData
  >(async (_prev, formData) => removeItemAction(_prev, formData), null);

  return (
    <li className="flex flex-col gap-1.5 rounded-md border p-2">
      <span className="text-sm font-medium">{item.printName}</span>
      <SwatchList colors={item.colors} />

      <div className="flex items-center gap-1.5">
        <form action={moveAction} className="flex flex-1 items-center gap-1">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="toIndex" value="0" />
          <label htmlFor={`move-${item.id}`} className="sr-only">
            Move {item.printName} to a day
          </label>
          <select
            id={`move-${item.id}`}
            name="dayOfWeek"
            defaultValue={item.dayOfWeek}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            disabled={movePending}
            className="h-7 flex-1 rounded-md border border-input bg-background px-1.5 text-xs"
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {WEEKDAY_LABELS[day]}
              </option>
            ))}
          </select>
        </form>

        <form action={removeAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <button
            type="submit"
            disabled={removePending}
            className="h-7 rounded-md border px-2 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
            aria-label={`Remove ${item.printName}`}
          >
            {removePending ? "…" : "Remove"}
          </button>
        </form>
      </div>

      {moveState && !moveState.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {moveState.error}
        </span>
      ) : null}
      {removeState && !removeState.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {removeState.error}
        </span>
      ) : null}
    </li>
  );
}
