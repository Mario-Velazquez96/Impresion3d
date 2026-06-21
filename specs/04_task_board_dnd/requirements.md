# Requirements — 04_task_board_dnd

**Feature:** Drag-and-drop on the Kanban board
**Source:** `client_requirement.md` §4.1 (drag & drop); `solution_design.md` §7
**Depends on:** 03_task_board_core

## Purpose

Add dnd-kit interactivity to the existing board: drag tasks between state columns
and reorder within a column, persisting `state` + `position` durably and
idempotently, with optimistic UI and rollback on failure, and full keyboard
accessibility. No schema changes — `position` and `state` already exist.

## In scope

- A Client board island (`KanbanBoard`) wrapping the columns from `03` in a
  `DndContext` with Pointer + Keyboard sensors and a `DragOverlay`.
- A `reorderTask` server action that persists the new column + ordering.
- Optimistic local reordering with rollback + error toast on persist failure.
- Keyboard-operable drag and ARIA live announcements.

## Out of scope

- Multi-select / bulk drag (future). Realtime cross-client sync (future).
- Reordering subtasks via drag (kept as form ordering for MVP).

## Requirements (EARS)

**R1 (Event-driven):** When a task card is dropped into a different column, the
system shall update the UI immediately and persist the task's new `state` and
`position` via the `reorderTask` action.

**R2 (Event-driven):** When a task card is dropped at a new position within the
same column, the system shall update the UI immediately and persist the new
`position`.

**R3 (Ubiquitous):** The `reorderTask` action shall normalize the affected
column(s) to contiguous integer `position` values so repeated reorders do not
drift, and shall be idempotent (re-running with the same target yields the same
final order).

**R4 (Unwanted behavior):** If `reorderTask` fails, then the system shall restore
the pre-drag order in the UI and surface an error toast (no partial UI state).

**R5 (Unwanted behavior):** If `reorderTask` is invoked without an authenticated
user, then the system shall reject it and make no DB write.

**R6 (Ubiquitous):** The board shall be operable by keyboard: a card can be picked
up, moved across columns/positions, and dropped using the dnd-kit KeyboardSensor,
with ARIA live-region announcements for pick-up/move/drop.

**R7 (State-driven):** While a drag is in progress, the system shall render a
`DragOverlay` preview of the dragged card.

**R8 (Ubiquitous):** After a successful reorder and reload, the board shall show
the persisted order (durability), matching the optimistic state.

## Acceptance

- Dragging a card to another column changes its state and order; reload confirms.
- Reordering within a column persists; reload confirms.
- Simulated persist failure rolls the UI back and shows a toast.
- The entire flow is doable with keyboard only, with announcements.
- Positions stay contiguous after many reorders (no float/gap drift).

## Open items

- Concurrency: two users reordering the same column simultaneously — last-write
  normalizes the column; acceptable for ≤5 users (no locking in MVP).
