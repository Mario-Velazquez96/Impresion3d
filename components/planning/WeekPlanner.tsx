"use client";

import { useMemo, useState } from "react";

import { ColorPicker } from "@/components/planning/ColorPicker";
import {
  FilteredInventory,
  type InventoryEntry,
} from "@/components/planning/FilteredInventory";
import {
  MatchModeToggle,
  type MatchMode,
} from "@/components/planning/MatchModeToggle";
import { WeekGrid } from "@/components/planning/WeekGrid";
import type {
  ColorView,
  ItemView,
  PrintView,
} from "@/components/planning/types";
import { fullMatches, partialMatches } from "@/lib/planning-core";

/**
 * The planning workspace (top-level Client island, R3–R9, R11). Owns the two pieces
 * of interactive state — the week's available-color set and the match mode — and
 * composes the picker, mode toggle, filtered inventory, and week grid. The matcher
 * runs CLIENT-side over the data already sent by the server, so toggling colors or
 * mode re-derives the inventory with NO refetch. Persisted writes (save colors,
 * assign/move/remove) go through server actions inside the child islands, which
 * revalidate `/planning` to refresh the authoritative items.
 */
export function WeekPlanner({
  weekStartDate,
  allColors,
  initialAvailableColorIds,
  prints,
  items,
}: {
  weekStartDate: string;
  allColors: ColorView[];
  initialAvailableColorIds: string[];
  prints: PrintView[];
  items: ItemView[];
}) {
  const [availableIds, setAvailableIds] = useState<Set<string>>(
    () => new Set(initialAvailableColorIds),
  );
  const [mode, setMode] = useState<MatchMode>("full");

  function toggleColor(id: string, checked: boolean) {
    setAvailableIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Color lookup for swatch rendering of ids (matcher works in ids, UI in views).
  const colorsById = useMemo(() => {
    const map = new Map<string, ColorView>();
    for (const color of allColors) map.set(color.id, color);
    for (const item of items) {
      for (const color of item.colors) {
        if (!map.has(color.id)) map.set(color.id, color);
      }
    }
    return map;
  }, [allColors, items]);

  // The matchable shape (id + colorIds) the pure core consumes.
  const matchable = useMemo(
    () => prints.map((p) => ({ id: p.id, colorIds: p.colors.map((c) => c.id) })),
    [prints],
  );
  const printsById = useMemo(() => {
    const map = new Map<string, PrintView>();
    for (const print of prints) map.set(print.id, print);
    return map;
  }, [prints]);

  // Re-derive the inventory whenever the available set or mode changes (R4–R6).
  const entries: InventoryEntry[] = useMemo(() => {
    if (mode === "full") {
      return fullMatches(matchable, availableIds).map((m) => ({
        print: printsById.get(m.id)!,
        missingColors: [],
      }));
    }
    return partialMatches(matchable, availableIds).map((m) => ({
      print: printsById.get(m.print.id)!,
      missingColors: m.missingColorIds
        .map((id) => colorsById.get(id))
        .filter((c): c is ColorView => Boolean(c)),
    }));
  }, [mode, matchable, availableIds, printsById, colorsById]);

  return (
    <div className="flex flex-col gap-6">
      <ColorPicker
        weekStartDate={weekStartDate}
        allColors={allColors}
        selectedIds={availableIds}
        onToggle={toggleColor}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Producible prints</h2>
          <MatchModeToggle mode={mode} onChange={setMode} />
        </div>
        <FilteredInventory
          weekStartDate={weekStartDate}
          mode={mode}
          entries={entries}
          hasColors={availableIds.size > 0}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Week grid</h2>
        <WeekGrid items={items} colorsById={colorsById} />
      </div>
    </div>
  );
}
