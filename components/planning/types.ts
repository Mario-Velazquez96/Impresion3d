/**
 * Shared view types for the planning Client islands (07_weekly_planning). Declared
 * here (not imported from the server-only service) so the client bundle never pulls
 * the `server-only` runtime guard. The Weekday union / WEEKDAYS tuple come from the
 * client-safe pure core so they never drift from the matcher.
 */

import { WEEKDAYS, type Weekday } from "@/lib/planning-core";

export { WEEKDAYS };
export type { Weekday };

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export type ColorView = { id: string; name: string; hex: string };

export type PrintView = {
  id: string;
  name: string;
  colors: ColorView[];
};

export type ItemView = {
  id: string;
  printId: string;
  printName: string;
  dayOfWeek: Weekday;
  position: number;
  colors: ColorView[];
};
