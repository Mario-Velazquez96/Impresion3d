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
