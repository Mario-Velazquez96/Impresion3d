import "server-only";

import { db } from "@/lib/db";
import { registerCatalogReference } from "@/lib/services/catalogs";
import type {
  CreateTaskInput,
  Priority,
  ReorderTaskInput,
  SubtaskInput,
  TaskFilters,
  TaskState,
  ToggleInput,
  UpdateTaskInput,
} from "@/lib/validation/task";

/**
 * Business logic for the task board (03_task_board_core). Authorization happens
 * in the caller (actions/tasks.ts via requireUser) — these functions assume the
 * actor is already resolved and authorized. Prisma bypasses RLS, so the server
 * layer is the real guard (task RLS is defense-in-depth).
 *
 * Internal tool: any signed-in user reads/writes all tasks (no per-row ownership
 * scoping).
 */

// 03 is the first feature to reference a catalog with onDelete: Restrict. Register
// a TaskCategory reference counter so the catalog delete-guard (R6 of 02) reports
// a category as in-use while any task points at it, before the DB FK Restrict
// would block the delete.
registerCatalogReference("taskCategory", (id) =>
  db.task.count({ where: { categoryId: id } }),
);

// A subtask as returned to the board (no Date serialization concerns at this
// layer — the page maps to view models).
export type SubtaskRecord = {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
};

// A task with its ordered subtasks, as returned by listTasks.
export type TaskWithSubtasks = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  state: TaskState;
  priority: Priority;
  assigneeId: string | null;
  dueDate: Date | null;
  position: number;
  subtasks: SubtaskRecord[];
};

/**
 * Build the Prisma `where` from optional filters (R7). Each absent filter is
 * omitted so the clause only constrains the dimensions actually present. Exported
 * for direct unit testing of filter composition.
 */
export function buildTaskWhere(filters: TaskFilters) {
  const where: {
    assigneeId?: string;
    categoryId?: string;
    state?: TaskState;
    priority?: Priority;
  } = {};
  if (filters.assigneeId) where.assigneeId = filters.assigneeId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.state) where.state = filters.state;
  if (filters.priority) where.priority = filters.priority;
  return where;
}

/**
 * All tasks matching the filters, each with its subtasks ordered by position
 * (R7, R8). A single query (no N+1) ordered by position; the page groups the flat
 * list into columns in memory.
 */
export async function listTasks(
  filters: TaskFilters = {},
): Promise<TaskWithSubtasks[]> {
  return db.task.findMany({
    where: buildTaskWhere(filters),
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      categoryId: true,
      state: true,
      priority: true,
      assigneeId: true,
      dueDate: true,
      position: true,
      subtasks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          taskId: true,
          title: true,
          done: true,
          position: true,
        },
      },
    },
  });
}

/**
 * The next position at the end of a state column: (max existing position in that
 * state) + 1, or 0 when the column is empty (R4).
 */
async function nextPositionInState(state: TaskState): Promise<number> {
  const last = await db.task.findFirst({
    where: { state },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last ? last.position + 1 : 0;
}

/**
 * Insert a task at the end of its target state column (R4). Caller must have
 * Zod-validated `input` and authorized via requireUser. A bad categoryId/
 * assigneeId surfaces as Prisma P2003, which the action maps to a validation
 * error (R10) — no partial write.
 */
export async function createTask(input: CreateTaskInput) {
  const position = await nextPositionInState(input.state);
  return db.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      categoryId: input.categoryId,
      state: input.state,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      position,
    },
  });
}

/**
 * Update a task's fields (R5). Does not reposition: when the state changes the
 * card simply appears in the new column on reload at its existing position;
 * explicit drag/reorder arrives in 04. Same P2003 contract as createTask (R10).
 */
export async function updateTask(input: UpdateTaskInput) {
  return db.task.update({
    where: { id: input.id },
    data: {
      title: input.title,
      description: input.description ?? null,
      categoryId: input.categoryId,
      state: input.state,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
    },
  });
}

/** Delete a task; its subtasks cascade (R2). */
export async function deleteTask(id: string) {
  return db.task.delete({ where: { id } });
}

/**
 * Append a subtask to the end of a task's checklist (R6). Same P2003 contract for
 * a bad taskId.
 */
export async function addSubtask(input: SubtaskInput) {
  const last = await db.subtask.findFirst({
    where: { taskId: input.taskId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = last ? last.position + 1 : 0;
  return db.subtask.create({
    data: { taskId: input.taskId, title: input.title, done: false, position },
  });
}

/** Persist a subtask's done value (R6). */
export async function toggleSubtask(input: ToggleInput) {
  return db.subtask.update({
    where: { id: input.subtaskId },
    data: { done: input.done },
  });
}

/** Remove a subtask. */
export async function removeSubtask(subtaskId: string) {
  return db.subtask.delete({ where: { id: subtaskId } });
}

// --- 04_task_board_dnd: drag reorder ---------------------------------------

/** A task id paired with its current position, as read for a renumber. */
export type OrderedTaskRef = { id: string; position: number };

/** The final position a single task should be written to after a renumber. */
export type PositionAssignment = { id: string; position: number };

/**
 * Pure ordering core for `reorderTask` (R3). Given the destination column's
 * current members (ordered by position), the moved task id, and the requested
 * drop index, return contiguous `0..n-1` assignments with the moved task placed
 * at the clamped index.
 *
 * Properties (covered by unit tests):
 * - Output positions are always contiguous `0..n-1` (no gaps/drift).
 * - `toIndex` is clamped to `[0, n-1]` so an out-of-range index is valid.
 * - Idempotent: re-running with the moved task already at the resulting index
 *   yields the same order.
 *
 * `destExisting` must already exclude the moved task when it is arriving from a
 * different column; when reordering within a column it may still contain the
 * moved task — it is filtered out here before re-insertion, so both callers are
 * handled uniformly.
 */
export function renumberColumnWithInsert(
  destExisting: OrderedTaskRef[],
  movedId: string,
  toIndex: number,
): PositionAssignment[] {
  const without = destExisting
    .filter((t) => t.id !== movedId)
    .sort((a, b) => a.position - b.position)
    .map((t) => t.id);

  const clamped = Math.max(0, Math.min(toIndex, without.length));
  const ordered = [
    ...without.slice(0, clamped),
    movedId,
    ...without.slice(clamped),
  ];

  return ordered.map((id, index) => ({ id, position: index }));
}

/**
 * Renumber a list of tasks (a source column losing a member) to contiguous
 * `0..n-1` by current order, excluding the moved task. Pure; used for the source
 * column on a cross-column move.
 */
export function renumberColumn(
  existing: OrderedTaskRef[],
  excludeId: string,
): PositionAssignment[] {
  return existing
    .filter((t) => t.id !== excludeId)
    .sort((a, b) => a.position - b.position)
    .map((t, index) => ({ id: t.id, position: index }));
}

/**
 * Persist a drag reorder (R1, R2, R3). In a single transaction:
 *   1. Read the moved task to learn its source state.
 *   2. Set its `state = toState`.
 *   3. Renumber the destination column to contiguous positions with the moved
 *      task inserted at the clamped `toIndex`.
 *   4. If the move crossed columns, also renumber the (now smaller) source
 *      column to contiguous positions.
 * Positions never drift or gap, and replaying the same target is idempotent.
 * Authorization is the caller's job (actions/tasks.ts via requireUser, R5).
 * A bad taskId surfaces as Prisma P2025 (record not found) from the initial read.
 */
export async function reorderTask(input: ReorderTaskInput): Promise<void> {
  const { taskId, toState, toIndex } = input;

  await db.$transaction(async (tx) => {
    const moved = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { id: true, state: true },
    });
    const fromState = moved.state as TaskState;

    // Move the task into the destination column first so the destination read
    // below includes it (within-column reorders) and the source read excludes it.
    if (fromState !== toState) {
      await tx.task.update({
        where: { id: taskId },
        data: { state: toState },
      });
    }

    const destExisting = await tx.task.findMany({
      where: { state: toState },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    const destAssignments = renumberColumnWithInsert(
      destExisting,
      taskId,
      toIndex,
    );
    for (const { id, position } of destAssignments) {
      await tx.task.update({ where: { id }, data: { position } });
    }

    if (fromState !== toState) {
      const sourceExisting = await tx.task.findMany({
        where: { state: fromState },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      const sourceAssignments = renumberColumn(sourceExisting, taskId);
      for (const { id, position } of sourceAssignments) {
        await tx.task.update({ where: { id }, data: { position } });
      }
    }
  });
}
