# Requirements — 08_task_priority

**Feature:** Task priority — `Priority` enum + field, form select, card badge, board filter
**Source:** product-owner decision (2026-06-28)
**Depends on:** 03_task_board_core (Task model, CRUD actions, board, filters)

## Purpose

Give every board task a **priority** (LOW / MEDIUM / HIGH) so users can flag the
relative urgency of work. Priority is set on the create/edit task form, shown as
a colored badge on each card, and used as a board filter that composes with the
existing owner/category/state filters. This extends `03_task_board_core` without
altering its data flow: the board stays a Server Component, mutations remain the
same auth → Zod → service → revalidate actions, and drag-and-drop ordering from
03/04 is untouched.

## In scope

- A Prisma `Priority` enum (`LOW`, `MEDIUM`, `HIGH`) and a `priority` field on
  `Task` with **default `MEDIUM`**; a migration `task_priority`. Existing rows
  receive `MEDIUM` via the column default.
- `createTaskSchema` / `updateTaskSchema` gain `priority` (enum, defaulting to
  `MEDIUM` when absent); the create/edit actions persist it.
- `TaskFormDialog` gains a **priority `<select>`** (Low / Medium / High),
  defaulting to Medium on create and prefilled on edit.
- `TaskCard` renders a **colored priority badge** per level, dark-theme-friendly
  and accessible (label text present, not color-only).
- A board **priority filter** dropdown in `TaskFilters`, driven by a `priority`
  URL search param, composed into `buildTaskWhere` / `listTasks` AND-ed with the
  existing owner/category/state filters. An "All priorities" option clears it.

## Out of scope

- **Automatic sorting of cards by priority within a column.** The product owner
  chose filter-only; column ordering remains driven by `position` from 03/04.
- Drag-and-drop reordering behavior — unchanged from `04_task_board_dnd`.
- New RLS: the `priority` column is covered by the existing `Task` RLS from 03;
  no new policy is required.
- Per-priority counts, notifications, or analytics.

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall define a `Priority` enum with members
`LOW`, `MEDIUM`, `HIGH`, and a `priority` field on `Task` of type `Priority`
with a default of `MEDIUM`, such that existing rows receive `MEDIUM` via the
migration's column default.

**R2 (Event-driven):** When the create-task form is submitted, the system shall
validate `priority` with `createTaskSchema` (defaulting to `MEDIUM` when the
value is absent), persist it on the new task, and revalidate `/board`.

**R3 (Event-driven):** When the edit-task form is submitted, the system shall
validate and update the task's `priority` and revalidate `/board`.

**R4 (Ubiquitous):** The system shall render a colored priority badge on each
task card whose color and label correspond to the task's priority (HIGH =
destructive/red tone, MEDIUM = amber/neutral tone, LOW = muted/low-emphasis
tone), with the priority label text always present so it is not color-only.

**R5 (State-driven):** While the board has an active `priority` URL search param,
the system shall render only tasks whose `priority` matches it, composed (AND-ed)
with any active owner, category, and state filters; an absent/"all" value applies
no priority constraint.

**R6 (Unwanted behavior):** If a create/edit submits a `priority` value that is
not a member of `Priority`, then the system shall reject it with a validation
error and write nothing.

**R7 (Unwanted behavior):** If a create/edit/priority mutation is invoked without
an authenticated user, then the system shall reject it and write nothing (reuses
03 R9; no behavior change — re-asserted here because this feature adds a field to
those mutations).

## Acceptance

- A new task created without choosing a priority is stored as `MEDIUM`; choosing
  High/Low stores that value and the card shows the matching badge.
- Editing a task changes its priority and the badge updates on reload.
- Each card shows a visually distinct, labelled priority badge that reads on the
  dark theme.
- Selecting a priority in the board toolbar narrows the board to that priority,
  reflected in the `?priority=` URL param, and combines with owner/category/state
  filters; "All priorities" clears the param.
- An invalid priority value is rejected as a validation error with no write.
- Column card ordering is unchanged (no auto-sort by priority).
