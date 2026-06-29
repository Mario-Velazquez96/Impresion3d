"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  assignPrintToDay,
  moveWeekItem,
  removeWeekItem,
  setWeekColors,
} from "@/lib/services/planning";
import {
  assignItemSchema,
  moveItemSchema,
  removeItemSchema,
  setWeekColorsSchema,
} from "@/lib/validation/planning";

/**
 * Server actions for weekly planning (07_weekly_planning). EVERY mutation resolves
 * + authorizes the actor FIRST (requireUser) before any validation or DB work, so a
 * rejected caller writes nothing (R10). Then it Zod-validates the input, calls the
 * service, and revalidates `/planning`. Internal tool: any authenticated user edits
 * the shared plan (no per-row ownership).
 */

const PLANNING_PATH = "/planning";

export type FieldError = { field: string; message: string };
export type PlanningActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: FieldError[] };

/** True when a thrown error is Prisma's foreign-key violation (P2003). */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2003"
  );
}

/** Resolve the authenticated user, returning a typed rejection instead of throwing. */
async function ensureUser(): Promise<{ id: string } | PlanningActionResult> {
  try {
    const user = await requireUser();
    return { id: user.id };
  } catch {
    return { ok: false, error: "Not authenticated" };
  }
}

/** Map a Zod error to a PlanningActionResult with a top message + per-field errors. */
function zodFailure(
  issues: { path: (string | number)[]; message: string }[],
): PlanningActionResult {
  return {
    ok: false,
    error: issues[0]?.message ?? "Invalid input",
    fieldErrors: issues.map((i) => ({
      field: String(i.path[0] ?? "form"),
      message: i.message,
    })),
  };
}

/** Friendly rejection for an FK pointing at a non-existent color / print. */
function badReferenceFailure(): PlanningActionResult {
  return { ok: false, error: "That color or print no longer exists" };
}

/** Collect repeated `colorIds` FormData entries into a string array. */
function readColorIds(formData: FormData): string[] {
  return formData
    .getAll("colorIds")
    .filter((v): v is string => typeof v === "string");
}

/** Set the week's available colors (R3, R10). */
export async function setWeekColorsAction(
  _prevState: PlanningActionResult | null,
  formData: FormData,
): Promise<PlanningActionResult> {
  const auth = await ensureUser();
  if ("ok" in auth) return auth;

  const parsed = setWeekColorsSchema.safeParse({
    weekStartDate: formData.get("weekStartDate"),
    colorIds: readColorIds(formData),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await setWeekColors(
      parsed.data.weekStartDate,
      parsed.data.colorIds,
      auth.id,
    );
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to save colors" };
  }

  revalidatePath(PLANNING_PATH);
  return { ok: true };
}

/** Assign a print to a day (R7, R10). */
export async function assignItemAction(
  _prevState: PlanningActionResult | null,
  formData: FormData,
): Promise<PlanningActionResult> {
  const auth = await ensureUser();
  if ("ok" in auth) return auth;

  const parsed = assignItemSchema.safeParse({
    weekStartDate: formData.get("weekStartDate"),
    printId: formData.get("printId"),
    dayOfWeek: formData.get("dayOfWeek"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await assignPrintToDay(
      parsed.data.weekStartDate,
      parsed.data.printId,
      parsed.data.dayOfWeek,
      auth.id,
    );
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to assign print" };
  }

  revalidatePath(PLANNING_PATH);
  return { ok: true };
}

/** Move a planned item to a new day/position (R8, R10). */
export async function moveItemAction(
  _prevState: PlanningActionResult | null,
  formData: FormData,
): Promise<PlanningActionResult> {
  const auth = await ensureUser();
  if ("ok" in auth) return auth;

  const parsed = moveItemSchema.safeParse({
    itemId: formData.get("itemId"),
    dayOfWeek: formData.get("dayOfWeek"),
    toIndex: formData.get("toIndex"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await moveWeekItem(
      parsed.data.itemId,
      parsed.data.dayOfWeek,
      parsed.data.toIndex,
    );
  } catch {
    return { ok: false, error: "Failed to move print" };
  }

  revalidatePath(PLANNING_PATH);
  return { ok: true };
}

/** Remove a planned item (R8, R10). */
export async function removeItemAction(
  _prevState: PlanningActionResult | null,
  formData: FormData,
): Promise<PlanningActionResult> {
  const auth = await ensureUser();
  if ("ok" in auth) return auth;

  const parsed = removeItemSchema.safeParse({
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await removeWeekItem(parsed.data.itemId);
  } catch {
    return { ok: false, error: "Failed to remove print" };
  }

  revalidatePath(PLANNING_PATH);
  return { ok: true };
}
