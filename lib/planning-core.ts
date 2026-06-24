/**
 * The PURE CORE of weekly planning (07_weekly_planning) — color matching + the
 * drying schedule (R4, R5, R6, R9). Framework-agnostic: no Prisma, no React, no
 * `server-only`, so it is importable BOTH by the server service
 * (lib/services/planning.ts) AND by the client islands (re-deriving on toggle with
 * no refetch), and is directly unit-testable to 100% branch coverage.
 */

/** The seven weekdays in order. MON starts the week. */
export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Minimal print shape the matcher needs: an id plus the colorIds it uses. */
export type MatchablePrint = {
  id: string;
  colorIds: string[];
};

/** A partial-match result: the print plus the colors it is still missing (R5). */
export type PartialMatch<T extends MatchablePrint> = {
  print: T;
  missingColorIds: string[];
};

/**
 * Prints whose ENTIRE color set is available AND which use ≥1 color (R4). A print
 * with no colors is never a full match (it produces nothing to dry). An empty
 * `availableIds` ⇒ no prints (R6): the `length > 0` guard plus `every()` over an
 * empty set is false for any real color.
 */
export function fullMatches<T extends MatchablePrint>(
  prints: T[],
  availableIds: Set<string>,
): T[] {
  return prints.filter(
    (print) =>
      print.colorIds.length > 0 &&
      print.colorIds.every((id) => availableIds.has(id)),
  );
}

/**
 * Prints sharing ≥1 color with the available set but NOT a full match (R5). Each
 * result carries `missingColorIds` = the print's colors not in the available set.
 * An empty `availableIds` ⇒ no prints share any color ⇒ empty (R6).
 */
export function partialMatches<T extends MatchablePrint>(
  prints: T[],
  availableIds: Set<string>,
): PartialMatch<T>[] {
  const results: PartialMatch<T>[] = [];
  for (const print of prints) {
    if (print.colorIds.length === 0) continue;
    const sharesOne = print.colorIds.some((id) => availableIds.has(id));
    if (!sharesOne) continue;
    const isFull = print.colorIds.every((id) => availableIds.has(id));
    if (isFull) continue;
    results.push({
      print,
      missingColorIds: print.colorIds.filter((id) => !availableIds.has(id)),
    });
  }
  return results;
}

/** Minimal item shape the drying schedule needs: a day plus the print's colorIds. */
export type SchedulableItem = {
  dayOfWeek: Weekday;
  colorIds: string[];
};

/**
 * Per-day "colors to dry" output (R9). MON's prep maps to the prior week and is
 * surfaced under the PREVIOUS_WEEK marker.
 */
export const PREVIOUS_WEEK = "PREVIOUS_WEEK" as const;
export type DryingDay = Weekday | typeof PREVIOUS_WEEK;
export type DryingSchedule = Record<DryingDay, string[]>;

/** The day BEFORE `day`; MON's prep belongs to the previous week's Sunday slot. */
export function previousDay(day: Weekday): DryingDay {
  const index = WEEKDAYS.indexOf(day);
  return index === 0 ? PREVIOUS_WEEK : WEEKDAYS[index - 1];
}

/**
 * Map each planned item to "dry its colors the day before" (R9). Pure: keys every
 * drying slot (the seven weekdays + PREVIOUS_WEEK), unions the colorIds of every
 * item whose day is D into slot D−1, and returns each slot's colorIds deduplicated
 * and sorted (stable output for rendering/testing).
 */
export function dryingSchedule(items: SchedulableItem[]): DryingSchedule {
  const sets: Record<DryingDay, Set<string>> = {
    PREVIOUS_WEEK: new Set(),
    MON: new Set(),
    TUE: new Set(),
    WED: new Set(),
    THU: new Set(),
    FRI: new Set(),
    SAT: new Set(),
    SUN: new Set(),
  };

  for (const item of items) {
    const slot = previousDay(item.dayOfWeek);
    for (const colorId of item.colorIds) {
      sets[slot].add(colorId);
    }
  }

  const schedule = {} as DryingSchedule;
  for (const slot of Object.keys(sets) as DryingDay[]) {
    schedule[slot] = Array.from(sets[slot]).sort();
  }
  return schedule;
}
