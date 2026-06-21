# Tasks — 03_task_board_core

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Add `TaskState` enum, `Task`, `Subtask` models; `prisma migrate dev --name tasks_and_subtasks` (R1, R2)
- [ ] Write RLS SQL migration enabling RLS on `Task`/`Subtask` (authenticated-only) (R3)
- [ ] Add Zod `createTaskSchema`, `updateTaskSchema`, `subtaskSchema`, `toggleSchema` (R4, R5, R6, R10)
- [ ] Implement `lib/services/tasks.ts` (listTasks w/ filters, create w/ end position, update, delete, subtask add/toggle/remove) (R4–R8)
- [ ] Implement `actions/tasks.ts` wrapping services with `requireUser` + zod + `revalidatePath('/board')` (R4–R6, R9)
- [ ] Build `board/page.tsx` server fetch from searchParams → `<BoardColumns>` (6 columns, fixed order) (R7, R8)
- [ ] Build `TaskCard`, `TaskFilters` (URL params), `TaskFormDialog`, `SubtaskList` (R4–R7)
- [ ] Write tests: Vitest (filter composition, position calc, schemas, bad FK); component (form submit, subtask toggle, filter URL); E2E (create/edit/move-via-state, subtasks, filters) (all R)
- [ ] Write the RLS denial test: unauthenticated cannot read/write tasks/subtasks (R3, R9)
- [ ] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- E2E: create in column → ordered; edit state → moves column on reload (R4/R5/R8); add+check subtask (R6); filter owner/category/state reflected in URL (R7).
- Unit: end-of-column position (R4); filter `where` (R7); bad category/assignee rejected (R10).
- RLS test: unauthenticated denied (R3, R9).
- Target: services/schemas branches covered; all green via `init.sh`.
