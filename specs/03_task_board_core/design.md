# Design — 03_task_board_core

**Source:** `solution_design.md` §3, §4 (routes), §5 (actions); `client_requirement.md` §4.1

## Approach

Schema + server actions + **Server-Component** board. The page fetches tasks
(filtered) on the server and renders columns; the create/edit dialog and subtask
checkboxes are small Client islands that call server actions. No dnd here — the
board is fully functional via the form's `state` field. This deliberate
Server/Client split lets `04` add the dnd client island without rewriting the page.

## Schema & RLS

```prisma
enum TaskState { BACKLOG TODO IN_PROGRESS PENDING BLOCKER DONE }
model Task {
  id String @id @default(cuid())
  title String
  description String?
  category TaskCategory @relation(fields:[categoryId], references:[id], onDelete: Restrict)
  categoryId String
  state TaskState @default(BACKLOG)
  assignee User? @relation("AssignedTasks", fields:[assigneeId], references:[id], onDelete: SetNull)
  assigneeId String?
  dueDate DateTime?
  position Int
  subtasks Subtask[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([state, position]) @@index([categoryId]) @@index([assigneeId])
}
model Subtask {
  id String @id @default(cuid())
  task Task @relation(fields:[taskId], references:[id], onDelete: Cascade)
  taskId String
  title String
  done Boolean @default(false)
  position Int
  @@index([taskId, position])
}
```

Migration `tasks_and_subtasks`. RLS SQL migration: enable on both; SELECT/INSERT/
UPDATE/DELETE allowed to any authenticated user (`auth.role() = 'authenticated'`).
Internal tool — both roles operate on all tasks (no per-row ownership scoping);
app-layer authz only requires a signed-in user.

## File layout & boundaries

```
app/(app)/board/page.tsx        # Server: parse searchParams → services.listTasks(filters) → <BoardColumns>
  loading.tsx · error.tsx
components/board/
  BoardColumns.tsx (server)     # renders 6 <BoardColumn> in TaskState order
  BoardColumn.tsx (server)      # column header + list of <TaskCard>
  TaskCard.tsx (server)         # title, badges (category/assignee/due), subtask progress
  TaskFilters.tsx (client)      # owner/category/state selects → push searchParams
  TaskFormDialog.tsx (client)   # create/edit; calls actions
  SubtaskList.tsx (client)      # checkboxes → toggleSubtask action
lib/services/tasks.ts           # listTasks(filters), createTask, updateTask, deleteTask, addSubtask, toggleSubtask, removeSubtask
lib/validation/task.ts          # createTaskSchema, updateTaskSchema, subtaskSchema, toggleSchema
actions/tasks.ts                # "use server": wraps services with requireUser + zod + revalidate
```

- `listTasks(filters)`: Prisma `where` built from optional `assigneeId`,
  `categoryId`, `state`; `include` subtasks; order by `position`. Single query per
  load, grouped into columns in memory (no N+1).
- `createTask`: compute `position = (max position in target state) + 1`.
- Filters live in the URL (`?owner=&category=&state=`); `TaskFilters` updates them
  via `router.push`, page re-fetches server-side (R7).

## Auth & security

- Every action begins with `requireUser()` (R9). Per-request Supabase client.
- Category/assignee existence enforced by FK + Zod refine (R10).

## Validation

- `createTaskSchema` { title: min 1, description?: string, categoryId: id,
  state: TaskState, assigneeId?: id, dueDate?: date }.
- `updateTaskSchema` = create + `id`. `subtaskSchema` { taskId, title }.
  `toggleSchema` { subtaskId, done: boolean }.

## Test approach

- **Vitest:** `listTasks` filter composition, `createTask` end-of-column position,
  schemas (incl. bad category/assignee → error).
- **Component:** TaskFormDialog submit; SubtaskList toggle calls action;
  TaskFilters updates URL.
- **E2E:** create task in a column; edit to change column; add + check subtask;
  filter by owner/category/state.
- **RLS denial test:** unauthenticated read/write returns nothing / rejected (R3, R9).
- Coverage target: services + schemas branch-complete; the 4 E2E flows green.

## Open items / discrepancies

- Auto-archive of old `DONE` tasks — deferred to future.
