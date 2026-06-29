import { z } from "zod";

import { WEEKDAYS } from "@/lib/services/planning";

/**
 * Validation for weekly planning (07_weekly_planning). Client-importable (no
 * server-only imports) so the planner islands can reuse the same shapes/messages
 * the server actions enforce. WEEKDAYS is the same pure tuple the matcher uses, so
 * the Weekday enum never drifts between the service and the boundary.
 */

// A cuid foreign-key id. Non-empty string; existence is enforced by the DB FK (a
// bad colorId / printId raises Prisma P2003, which the action maps to an error).
const idSchema = z.string().trim().min(1);

// A date arriving as an ISO string (from the date input / form) or a Date. Coerces
// to a Date and rejects an unparseable value. The service snaps it to the Monday.
const dateSchema = z.coerce.date({
  errorMap: () => ({ message: "Enter a valid date" }),
});

// One of the seven weekdays (MON–SUN). z.enum over the shared WEEKDAYS tuple.
export const weekdaySchema = z.enum(WEEKDAYS);

/** Set the week's available colors (R3). Zero colors is allowed (clears the set). */
export const setWeekColorsSchema = z.object({
  weekStartDate: dateSchema,
  colorIds: z.array(idSchema),
});
export type SetWeekColorsInput = z.infer<typeof setWeekColorsSchema>;

/** Assign a print to a day (R7). */
export const assignItemSchema = z.object({
  weekStartDate: dateSchema,
  printId: idSchema,
  dayOfWeek: weekdaySchema,
});
export type AssignItemInput = z.infer<typeof assignItemSchema>;

/** Move a planned item to a new day/position (R8). toIndex is a non-negative rank. */
export const moveItemSchema = z.object({
  itemId: idSchema,
  dayOfWeek: weekdaySchema,
  toIndex: z.coerce.number().int().min(0, "Position cannot be negative"),
});
export type MoveItemInput = z.infer<typeof moveItemSchema>;

/** Remove a planned item (R8). */
export const removeItemSchema = z.object({
  itemId: idSchema,
});
export type RemoveItemInput = z.infer<typeof removeItemSchema>;
