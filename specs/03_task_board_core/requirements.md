# Requirements — 03_task_board_core

**Feature:** Kanban tasks — data, CRUD, static board, filters, subtasks
**Source:** `client_requirement.md` §4.1; `solution_design.md` §3, §5, §9
**Depends on:** 02_catalog_management

## Purpose

Deliver the task domain and a **statically rendered** Kanban board: `Task` +
`Subtask` models, CRUD server actions, the six-column board, owner/category/state
filtering, and subtask check-off. Drag-and-drop is intentionally deferred to
`04_task_board_dnd`; here, column placement is set via the task form.

## In scope

- `Task` (title, description, category, state enum, assignee, dueDate, position)
  and `Subtask` (title, done, position) models + migration + RLS.
- `TaskState` enum: `BACKLOG`, `TODO`, `IN_PROGRESS`, `PENDING`, `BLOCKER`, `DONE`.
- CRUD server actions for tasks and subtasks (create/update/delete, toggle).
- Board UI: six columns rendering cards, a create/edit task dialog, subtask list
  with checkboxes.
- Filters by owner (assignee), category, and state via URL search params.

## Out of scope

- Dragging cards between columns / reordering — `04_task_board_dnd`.
- Realtime updates from other clients (future).

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall define a `Task` model with `title`,
optional `description`, `categoryId` (→ `TaskCategory`), `state` (`TaskState`,
default `BACKLOG`), optional `assigneeId` (→ `User`), optional `dueDate`, and an
integer `position`.

**R2 (Ubiquitous):** The system shall define a `Subtask` model with `taskId`
(cascade delete), `title`, `done` (default false), and integer `position`.

**R3 (Ubiquitous):** The `Task` and `Subtask` tables shall have RLS enabled so
that only authenticated users may read or write; unauthenticated access returns no
rows.

**R4 (Event-driven):** When the create-task form is submitted, the system shall
validate it with `createTaskSchema`, set `position` to the end of the target
state column, insert the task, and revalidate `/board`.

**R5 (Event-driven):** When the edit-task form is submitted, the system shall
validate and update title/description/category/state/assignee/dueDate and
revalidate `/board`.

**R6 (Event-driven):** When a subtask checkbox is toggled, the system shall
persist its `done` value and reflect it on reload.

**R7 (State-driven):** While the board has active filter params (owner, category,
and/or state), the system shall render only tasks matching all active filters.

**R8 (Ubiquitous):** The board shall render exactly six columns in the fixed
`TaskState` order, each listing its tasks ordered by `position`.

**R9 (Unwanted behavior):** If any task/subtask mutation is invoked without an
authenticated user, then the system shall reject it and write nothing.

**R10 (Unwanted behavior):** If a create/edit references a non-existent category
or assignee, then the system shall reject it with a validation error.

## Acceptance

- A user creates a task in a chosen column; it appears in that column's order.
- Editing changes fields and (via the state field) moves the card to another
  column on reload.
- Subtasks can be added and checked off; state persists.
- Filtering by owner/category/state narrows the board correctly and is reflected
  in the URL (shareable/back-button friendly).
- Columns render in fixed order; board is keyboard-navigable.

## Open items

- Should `DONE` tasks be hidden/collapsed after N days? Out of scope for MVP;
  flag for future.
