import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { registerCatalogReference } from "@/lib/services/catalogs";

// Re-export the PURE CORE (matching + drying) so server callers can import it from
// the service, while the same logic stays client-importable from lib/planning-core.
export {
  WEEKDAYS,
  fullMatches,
  partialMatches,
  previousDay,
  dryingSchedule,
  PREVIOUS_WEEK,
} from "@/lib/planning-core";
export type {
  Weekday,
  MatchablePrint,
  PartialMatch,
  SchedulableItem,
  DryingDay,
  DryingSchedule,
} from "@/lib/planning-core";

import type { Weekday } from "@/lib/planning-core";

/**
 * Business logic for weekly planning (07_weekly_planning).
 *
 * The HEART of the feature is a set of PURE, framework-agnostic functions —
 * `fullMatches`, `partialMatches`, `dryingSchedule` — that operate over plain
 * in-memory data (no Prisma, no React) so they are directly unit-testable to 100%
 * branch coverage. The DB functions below (`getOrCreateWeekPlan`, `setWeekColors`,
 * `assignPrintToDay`, `moveWeekItem`, `removeWeekItem`) wrap Prisma; authorization
 * happens in the caller (actions/planning.ts via requireUser) — Prisma bypasses
 * RLS so the server layer is the real guard (planning RLS is defense-in-depth).
 *
 * Internal tool: any signed-in user reads/writes the shared plan (no per-row
 * ownership scoping).
 */

// 07 references TWO restrict FKs that can block a delete — Color (WeekPlanColor)
// and Print (WeekPlanItem). Register a delete-guard counter for each so the
// catalog/inventory delete path reports the value as in-use while any week plan
// points at it (mirrors how 06 registered printType + color).
registerCatalogReference("color", (id) =>
  db.weekPlanColor.count({ where: { colorId: id } }),
);

// ─────────────────────────────────────────────────────────────────────────────
// DB layer — week plan persistence (R3, R7, R8).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snap any date to 00:00 UTC of the Monday of its week (R3). MON starts the week.
 * Uses UTC so the stored `weekStartDate` is timezone-stable (the @unique key must
 * not drift by host timezone). Returns a new Date; the input is not mutated.
 */
export function snapToMonday(date: Date): Date {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay: 0=Sun..6=Sat. Days since Monday = (day + 6) % 7.
  const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  return utc;
}

/** A color available for a week, with the hex needed to render its swatch (R11). */
export type WeekColorView = { id: string; name: string; hex: string };

/** A planned print on a day, with its colors (for the grid + drying derivation). */
export type WeekItemView = {
  id: string;
  printId: string;
  printName: string;
  dayOfWeek: Weekday;
  position: number;
  colors: WeekColorView[];
};

/** A loaded week plan: its id, snapped Monday, available colors, and items. */
export type WeekPlanView = {
  id: string;
  weekStartDate: Date;
  colors: WeekColorView[];
  items: WeekItemView[];
};

const weekPlanSelect = {
  id: true,
  weekStartDate: true,
  colors: {
    select: { color: { select: { id: true, name: true, hex: true } } },
    orderBy: { color: { name: "asc" } },
  },
  items: {
    select: {
      id: true,
      printId: true,
      dayOfWeek: true,
      position: true,
      print: {
        select: {
          name: true,
          colors: {
            select: { color: { select: { id: true, name: true, hex: true } } },
            orderBy: { color: { name: "asc" } },
          },
        },
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { position: "asc" }],
  },
} satisfies Prisma.WeekPlanSelect;

type WeekPlanRow = {
  id: string;
  weekStartDate: Date;
  colors: { color: { id: string; name: string; hex: string } }[];
  items: {
    id: string;
    printId: string;
    dayOfWeek: Weekday;
    position: number;
    print: {
      name: string;
      colors: { color: { id: string; name: string; hex: string } }[];
    };
  }[];
};

function toWeekPlanView(row: WeekPlanRow): WeekPlanView {
  return {
    id: row.id,
    weekStartDate: row.weekStartDate,
    colors: row.colors.map((c) => c.color),
    items: row.items.map((item) => ({
      id: item.id,
      printId: item.printId,
      printName: item.print.name,
      dayOfWeek: item.dayOfWeek,
      position: item.position,
      colors: item.print.colors.map((c) => c.color),
    })),
  };
}

/**
 * Load the week plan for the Monday of `weekStartDate`, creating it if absent (R3).
 * The date is snapped to Monday first, so any day in the week resolves to the same
 * plan. `createdById` is the authenticated user resolved by the caller.
 */
export async function getOrCreateWeekPlan(
  weekStartDate: Date,
  createdById: string,
): Promise<WeekPlanView> {
  const monday = snapToMonday(weekStartDate);

  const existing = await db.weekPlan.findUnique({
    where: { weekStartDate: monday },
    select: weekPlanSelect,
  });
  if (existing) return toWeekPlanView(existing);

  const created = await db.weekPlan.create({
    data: { weekStartDate: monday, createdById },
    select: weekPlanSelect,
  });
  return toWeekPlanView(created);
}

/**
 * Persist the week's available colors (R3): upsert the WeekPlan for the snapped
 * Monday, then REPLACE its WeekPlanColor set (deleteMany + createMany) atomically
 * in a single $transaction so the set is never observed half-swapped. `createdById`
 * is only used on first create.
 */
export async function setWeekColors(
  weekStartDate: Date,
  colorIds: string[],
  createdById: string,
): Promise<void> {
  const monday = snapToMonday(weekStartDate);

  await db.$transaction(async (tx) => {
    const plan = await tx.weekPlan.upsert({
      where: { weekStartDate: monday },
      create: { weekStartDate: monday, createdById },
      update: {},
      select: { id: true },
    });

    await tx.weekPlanColor.deleteMany({ where: { weekPlanId: plan.id } });
    await tx.weekPlanColor.createMany({
      data: colorIds.map((colorId) => ({ weekPlanId: plan.id, colorId })),
    });
  });
}

/**
 * Assign a print to a day at the END of that day's order (R7). The new item's
 * position is one past the current max position for the (weekPlan, day) column, so
 * it appends. The plan is resolved/created for the snapped Monday first.
 */
export async function assignPrintToDay(
  weekStartDate: Date,
  printId: string,
  dayOfWeek: Weekday,
  createdById: string,
): Promise<{ id: string }> {
  const monday = snapToMonday(weekStartDate);

  return db.$transaction(async (tx) => {
    const plan = await tx.weekPlan.upsert({
      where: { weekStartDate: monday },
      create: { weekStartDate: monday, createdById },
      update: {},
      select: { id: true },
    });

    const last = await tx.weekPlanItem.findFirst({
      where: { weekPlanId: plan.id, dayOfWeek },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = last ? last.position + 1 : 0;

    return tx.weekPlanItem.create({
      data: { weekPlanId: plan.id, printId, dayOfWeek, position },
      select: { id: true },
    });
  });
}

/**
 * Move a planned item to a new day/position (R8). Sets the item's `dayOfWeek` and
 * `position` directly to the requested target; the planner re-derives the rendered
 * order from `position` so an explicit integer rank is sufficient for the Select
 * fallback (dnd reordering is a deferred enhancement).
 */
export async function moveWeekItem(
  itemId: string,
  dayOfWeek: Weekday,
  toIndex: number,
): Promise<void> {
  await db.weekPlanItem.update({
    where: { id: itemId },
    data: { dayOfWeek, position: toIndex },
  });
}

/** Remove a planned item (R8). */
export async function removeWeekItem(itemId: string): Promise<void> {
  await db.weekPlanItem.delete({ where: { id: itemId } });
}
