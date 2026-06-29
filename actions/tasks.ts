"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  addSubtask,
  createTask,
  deleteTask,
  removeSubtask,
  reorderTask,
  toggleSubtask,
  updateTask,
} from "@/lib/services/tasks";
import {
  createTaskSchema,
  reorderTaskSchema,
  subtaskSchema,
  toggleSchema,
  updateTaskSchema,
} from "@/lib/validation/task";

/**
 * Server actions for the task board (03_task_board_core). Every mutation:
 *   1. requireUser() FIRST — an unauthenticated caller is rejected before any
 *      validation or DB work, so nothing is written (R9).
 *   2. Zod-validate the input (R4, R5, R6, R10).
 *   3. Call the service.
 *   4. revalidatePath('/board') on success (R4, R5, R6).
 * A bad categoryId/assigneeId/taskId surfaces as Prisma P2003 (FK violation),
 * which we map to a validation error with no partial write (R10).
 */

const BOARD_PATH = "/board";

export type FieldError = { field: string; message: string };
export type TaskActionResult =
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

/** Resolve the authenticated user, returning a typed rejection instead of throwing (R9). */
async function ensureUser(): Promise<TaskActionResult | null> {
  try {
    await requireUser();
    return null;
  } catch {
    return { ok: false, error: "Not authenticated" };
  }
}

/** Map a Zod error to a TaskActionResult with a top message + per-field errors. */
function zodFailure(
  issues: { path: (string | number)[]; message: string }[],
): TaskActionResult {
  return {
    ok: false,
    error: issues[0]?.message ?? "Invalid input",
    fieldErrors: issues.map((i) => ({
      field: String(i.path[0] ?? "form"),
      message: i.message,
    })),
  };
}

/** Friendly rejection for a FK that points at a non-existent row (R10). */
function badReferenceFailure(): TaskActionResult {
  return {
    ok: false,
    error: "Category or assignee no longer exists",
    fieldErrors: [
      { field: "categoryId", message: "Category or assignee no longer exists" },
    ],
  };
}

/** Create a task (R4, R9, R10). */
export async function createTaskAction(
  _prevState: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    state: formData.get("state"),
    priority: formData.get("priority"),
    assigneeId: formData.get("assigneeId"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await createTask(parsed.data);
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to create task" };
  }

  revalidatePath(BOARD_PATH);
  return { ok: true };
}

/** Update a task (R5, R9, R10). */
export async function updateTaskAction(
  _prevState: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = updateTaskSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    state: formData.get("state"),
    priority: formData.get("priority"),
    assigneeId: formData.get("assigneeId"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await updateTask(parsed.data);
  } catch (error) {
    if (isForeignKeyViolation(error)) return badReferenceFailure();
    return { ok: false, error: "Failed to update task" };
  }

  revalidatePath(BOARD_PATH);
  return { ok: true };
}

/** Delete a task and its subtasks (R9). */
export async function deleteTaskAction(
  _prevState: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Missing id" };
  }

  try {
    await deleteTask(id);
  } catch {
    return { ok: false, error: "Failed to delete task" };
  }

  revalidatePath(BOARD_PATH);
  return { ok: true };
}

/** Add a subtask (R6, R9, R10). */
export async function addSubtaskAction(
  _prevState: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = subtaskSchema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await addSubtask(parsed.data);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { ok: false, error: "That task no longer exists" };
    }
    return { ok: false, error: "Failed to add subtask" };
  }

  revalidatePath(BOARD_PATH);
  return { ok: true };
}

/** Toggle a subtask's done state (R6, R9). */
export async function toggleSubtaskAction(
  _prevState: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = toggleSchema.safeParse({
    subtaskId: formData.get("subtaskId"),
    done: formData.get("done") === "true",
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await toggleSubtask(parsed.data);
  } catch {
    return { ok: false, error: "Failed to update subtask" };
  }

  revalidatePath(BOARD_PATH);
  return { ok: true };
}

/**
 * Persist a drag-and-drop reorder (04: R1, R2, R5). Unlike the form actions this
 * takes the typed payload directly (the KanbanBoard island calls it with an
 * object, not FormData):
 *   1. requireUser() FIRST — an unauthenticated caller is rejected before any
 *      validation or DB work, so nothing is written (R5).
 *   2. Zod-validate { taskId, toState, toIndex }.
 *   3. Call the transactional reorderTask service (R3).
 *   4. revalidatePath('/board') so the server truth reconciles the optimistic UI.
 * A bad taskId surfaces as Prisma P2025 (record not found) → generic failure,
 * which the client maps to a rollback + toast (R4).
 */
export async function reorderTaskAction(
  input: unknown,
): Promise<TaskActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const parsed = reorderTaskSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    await reorderTask(parsed.data);
  } catch {
    return { ok: false, error: "Failed to reorder task" };
  }

  revalidatePath(BOARD_PATH);
  return { ok: true };
}

/** Remove a subtask (R9). */
export async function removeSubtaskAction(
  _prevState: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const subtaskId = formData.get("subtaskId");
  if (typeof subtaskId !== "string" || subtaskId.length === 0) {
    return { ok: false, error: "Missing subtask id" };
  }

  try {
    await removeSubtask(subtaskId);
  } catch {
    return { ok: false, error: "Failed to remove subtask" };
  }

  revalidatePath(BOARD_PATH);
  return { ok: true };
}
