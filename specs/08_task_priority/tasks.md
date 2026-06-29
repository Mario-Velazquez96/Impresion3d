# Tasks — 08_task_priority

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.
> Builds on 03_task_board_core; touches only the seams listed in `design.md`.

## Implementation

- [x] Add the `Priority` enum (`LOW MEDIUM HIGH`) and `Task.priority Priority @default(MEDIUM)` (plus `@@index([priority])`) to `prisma/schema.prisma`; migration `20260628120000_task_priority` (hand-written to match Prisma output — `--create-only` could not reach the DB to diff; the leader applies it); `prisma generate` regenerated the client types (existing rows backfill to `MEDIUM` via the default) (R1)
- [x] In `lib/validation/task.ts`, add `PRIORITIES` + `prioritySchema` + `Priority` type; add `priority` to `createTaskSchema` (defaults absent/""/null to MEDIUM, inherited by `updateTaskSchema`); add an optional `priority` to `taskFiltersSchema` (R2, R3, R5, R6)
- [x] In `lib/services/tasks.ts`, add `priority` to `TaskWithSubtasks` and the `listTasks` `select`; add `priority` to `buildTaskWhere` (AND-composed, omitted when absent); write `priority` in `createTask`/`updateTask` (R2, R3, R4, R5)
- [x] In `actions/tasks.ts`, add `priority: formData.get("priority")` to the `safeParse` inputs of `createTaskAction` and `updateTaskAction`; `requireUser()` still runs first (no other change) (R2, R3, R6, R7)
- [x] In `app/(app)/board/page.tsx`, parse `?priority=` into the filters object and map `priority` into each `TaskCardView` (R4, R5)
- [x] Add `PRIORITY_LABELS` (Low/Medium/High) to `components/board/board-types.ts` (R4, R5)
- [x] In `components/board/TaskFormDialog.tsx`, add a `priority` `<select>` (Low/Medium/High) defaulting to `MEDIUM` on create and prefilled on edit; extend `EditTask` with `priority` (R2, R3)
- [x] In `components/board/TaskCard.tsx`, add `priority` to `TaskCardView`, render the colored+labelled priority badge (HIGH destructive / MEDIUM amber / LOW muted, dark-theme tokens, label text not color-only), and pass `priority` to the edit `TaskFormDialog` (R4)
- [x] In `components/board/TaskFilters.tsx`, add the Priority dropdown (All priorities + each level) wired to `setParam("priority", …)` and include `priority` in `hasFilters` (R5)

## Tests

- [x] Vitest (schema): `createTaskSchema` accepts LOW/MEDIUM/HIGH, defaults to `MEDIUM` when `priority` is absent, and rejects an invalid value (e.g. `"URGENT"`) with a validation error (R2, R6)
- [x] Vitest (service): `buildTaskWhere` includes `priority` when present, omits it when absent, and composes it (AND) with owner/category/state filters (R5)
- [x] Component: `TaskFormDialog` submits the chosen priority (FormData carries the selected value; create defaults to MEDIUM, edit prefills) (R2, R3)
- [x] Component: `TaskCard` renders the correct badge label + tone for each of LOW/MEDIUM/HIGH (R4)
- [x] Component: `TaskFilters` priority dropdown updates the URL (`?priority=HIGH`), and "All priorities" clears the param (R5)
- [x] E2E (Playwright): create a task with priority High → its card shows the High badge (R1, R2, R4)
- [x] E2E (Playwright): filtering the board by priority narrows the visible cards and is reflected in the `?priority=` URL param (R5)
- [x] E2E/integration: an invalid/absent priority path — absent defaults to MEDIUM (action + schema tests); rejection branch covered by the schema/action invalid-priority tests (R2, R6)
- [x] `typecheck`, `lint`, `test` (with coverage) pass; coverage target met. Build intentionally skipped to protect the running dev server (shared `.next`).

## Verification

- Migration applies to dev/staging; existing tasks read back as `MEDIUM` (R1).
- Create without choosing priority → MEDIUM; choose High/Low → that badge (R2, R4).
- Edit changes priority; badge updates on reload (R3, R4).
- Board priority filter narrows results, composes with owner/category/state, and
  is mirrored in `?priority=`; "All priorities" clears it (R5).
- Invalid priority rejected with no write (R6); unauthenticated mutation rejected (R7).
- Card ordering unchanged (no auto-sort by priority).

## Coverage target

- `lib/validation/task.ts` and `lib/services/tasks.ts` priority branches
  **branch-complete** (consistent with the repo's services/schema target).
- Every requirement R1–R7 traced to at least one test task above.
