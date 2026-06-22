import { z } from "zod";

/**
 * Validation for the task board (03_task_board_core). This module is
 * client-importable (no server-only imports) so the board form/filters can reuse
 * the same shapes and error messages the server actions enforce.
 */

// Mirrors the Prisma `TaskState` enum. Declared here (rather than imported from
// @prisma/client) so this module stays importable from client components and the
// browser bundle without pulling in the server-only Prisma client. The array is
// also the canonical column render order for the board (R8).
export const TASK_STATES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "PENDING",
  "BLOCKER",
  "DONE",
] as const;

export const taskStateSchema = z.enum(TASK_STATES);
export type TaskState = z.infer<typeof taskStateSchema>;

// A cuid foreign-key id. Non-empty string; existence is enforced by the DB FK
// (a bad category/assignee raises Prisma P2003, which the action maps to a
// validation error — R10).
const idSchema = z.string().trim().min(1);

// Optional id that also accepts "" / "none" from a <select> and normalizes those
// (and a missing FormData value, which arrives as null) to undefined
// (unassigned). Used for the optional assignee filter/field.
const optionalAssigneeSchema = z
  .union([z.literal(""), z.literal("none"), z.null(), idSchema])
  .optional()
  .transform((value) =>
    value === "" || value === "none" || value === null ? undefined : value,
  );

// Optional due date from a date input. Accepts an ISO/`yyyy-mm-dd` string or a
// Date; "", null, and a missing value normalize to undefined. Rejects
// unparseable strings.
const optionalDueDateSchema = z
  .union([z.literal(""), z.null(), z.string(), z.date()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === "" || value === null) return undefined;
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid date",
      });
      return z.NEVER;
    }
    return parsed;
  });

// Optional free-text field from a form (textarea). "", null, and a missing value
// normalize to undefined; otherwise trimmed.
const optionalTextSchema = z
  .union([z.literal(""), z.null(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  });

// Create a task (R4). title is required; description/assignee/dueDate optional;
// categoryId + state required. assignee/category existence is enforced by the FK
// (R10).
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalTextSchema,
  categoryId: idSchema,
  state: taskStateSchema,
  assigneeId: optionalAssigneeSchema,
  dueDate: optionalDueDateSchema,
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// Update a task (R5): the create shape plus the target task id.
export const updateTaskSchema = createTaskSchema.extend({
  id: idSchema,
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// Add a subtask to a task (R6).
export const subtaskSchema = z.object({
  taskId: idSchema,
  title: z.string().trim().min(1, "Title is required"),
});
export type SubtaskInput = z.infer<typeof subtaskSchema>;

// Toggle a subtask's done state (R6).
export const toggleSchema = z.object({
  subtaskId: idSchema,
  done: z.boolean(),
});
export type ToggleInput = z.infer<typeof toggleSchema>;

// Filters parsed from the board's URL search params (R7). Each is optional;
// blank/"none" normalizes to undefined so an absent param means "no filter".
export const taskFiltersSchema = z.object({
  assigneeId: optionalAssigneeSchema,
  categoryId: z
    .union([z.literal(""), idSchema])
    .optional()
    .transform((value) => (value ? value : undefined)),
  state: z
    .union([z.literal(""), taskStateSchema])
    .optional()
    .transform((value) => (value ? (value as TaskState) : undefined)),
});
export type TaskFilters = z.infer<typeof taskFiltersSchema>;
