import type { Metadata } from "next";

import { WeekPlanner } from "@/components/planning/WeekPlanner";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listPrints } from "@/lib/services/prints";
import {
  getOrCreateWeekPlan,
  snapToMonday,
} from "@/lib/services/planning";

export const metadata: Metadata = {
  title: "Planning — Tower Layers",
};

/**
 * Weekly planning (Server Component, R3–R9, R11). The (app) layout redirects
 * unauthenticated requests; requireUser() here is a second server-layer guard
 * before any data read. Resolves the current week's Monday, loads/creates its
 * WeekPlan, loads every print (with its colorIds) for the matcher, and hands fully
 * serializable data to <WeekPlanner>. The color matching is re-derived CLIENT-side
 * from this data when the user toggles colors/mode (no refetch); the initial
 * available set is the plan's persisted colors.
 *
 * `week` (an ISO yyyy-mm-dd search param) lets the user view a specific week; it is
 * snapped to its Monday. Absent ⇒ the current week.
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const params = await searchParams;
  const weekParam = Array.isArray(params.week) ? params.week[0] : params.week;
  const requested = weekParam ? new Date(weekParam) : new Date();
  const base = Number.isNaN(requested.getTime()) ? new Date() : requested;
  const monday = snapToMonday(base);

  const [plan, prints, allColors] = await Promise.all([
    getOrCreateWeekPlan(monday, user.id),
    listPrints(),
    // The picker's selectable list is the FULL Color catalog, ordered by name, so
    // every catalog color is selectable for the week even if no print uses it yet.
    // This is independent of the prints loaded for matching (R3, R11).
    db.color.findMany({
      select: { id: true, name: true, hex: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Flatten prints to the matchable shape the client island needs (id, name,
  // colors with hex). The matcher uses colorIds; the UI renders swatches from hex.
  const printViews = prints.map((print) => ({
    id: print.id,
    name: print.name,
    colors: print.colors,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Weekly planning</h1>
        <p className="text-sm text-muted-foreground">
          Week of {monday.toISOString().slice(0, 10)} (Mon)
        </p>
      </div>

      <WeekPlanner
        weekStartDate={monday.toISOString().slice(0, 10)}
        allColors={allColors}
        initialAvailableColorIds={plan.colors.map((c) => c.id)}
        prints={printViews}
        items={plan.items}
      />
    </div>
  );
}
