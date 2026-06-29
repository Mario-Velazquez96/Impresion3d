/**
 * Shared, serializable view-model types for the board (03_task_board_core).
 * Kept in a plain (non-"use client", non-server-only) module so both Server and
 * Client board components can import them without crossing a runtime boundary.
 */

// A TaskCategory option for the filter/form selects.
export type CategoryOption = { id: string; name: string };

// A User option (assignee) for the filter/form selects.
export type UserOption = { id: string; name: string };

// Human-readable labels for each TaskState column header.
export const TASK_STATE_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  PENDING: "Pending",
  BLOCKER: "Blocker",
  DONE: "Done",
};

// Human-readable labels for each Priority value (08_task_priority). Used by the
// form/filter selects and the TaskCard badge so the priority is never color-only.
export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};
