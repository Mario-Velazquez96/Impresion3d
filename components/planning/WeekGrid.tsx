"use client";

import { useMemo } from "react";

import { DayColumn } from "@/components/planning/DayColumn";
import { SwatchList } from "@/components/planning/Swatch";
import {
  WEEKDAYS,
  type ColorView,
  type ItemView,
  type Weekday,
} from "@/components/planning/types";
import { dryingSchedule, PREVIOUS_WEEK } from "@/lib/planning-core";

/**
 * The week grid (Client island, R7–R9, R11). Renders the seven DayColumns (Mon–Sun)
 * with each day's assigned prints, the per-day "dry the day before" panel, and a
 * separate "previous week" panel for Monday's prep (its colors must be dried the
 * prior Sunday). The drying schedule is DERIVED here from the items via the pure
 * dryingSchedule helper — never stored — so move/remove instantly re-derive it.
 */
export function WeekGrid({
  items,
  colorsById,
}: {
  items: ItemView[];
  colorsById: Map<string, ColorView>;
}) {
  // Per-day items, ordered by position within the day.
  const itemsByDay = useMemo(() => {
    const map = new Map<Weekday, ItemView[]>();
    for (const day of WEEKDAYS) map.set(day, []);
    for (const item of items) map.get(item.dayOfWeek)!.push(item);
    for (const day of WEEKDAYS) {
      map.get(day)!.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [items]);

  // The drying schedule, derived from the items (R9). Map colorIds back to views.
  const schedule = useMemo(
    () =>
      dryingSchedule(
        items.map((item) => ({
          dayOfWeek: item.dayOfWeek,
          colorIds: item.colors.map((c) => c.id),
        })),
      ),
    [items],
  );

  const dryColorsFor = (colorIds: string[]): ColorView[] =>
    colorIds
      .map((id) => colorsById.get(id))
      .filter((c): c is ColorView => Boolean(c));

  const previousWeekColors = dryColorsFor(schedule[PREVIOUS_WEEK]);

  return (
    <div className="flex flex-col gap-4">
      {previousWeekColors.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed p-3">
          <span className="text-xs font-medium">
            Dry the previous Sunday (for Monday&apos;s prints)
          </span>
          <SwatchList colors={previousWeekColors} emptyLabel="Nothing to dry" />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {WEEKDAYS.map((day) => (
          <DayColumn
            key={day}
            day={day}
            items={itemsByDay.get(day) ?? []}
            dryColors={dryColorsFor(schedule[day])}
          />
        ))}
      </div>
    </div>
  );
}
