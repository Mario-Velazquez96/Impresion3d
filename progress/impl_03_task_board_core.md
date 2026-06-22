# Implementation — 03_task_board_core

**Status:** Implementation complete. Credential-free pipeline (typecheck · lint ·
test · build) is green. DB-dependent stages (migration apply, Playwright E2E,
RLS-denial flow) are written but credential-gated — no `.env.local` is present, so
they were not run here. Awaiting reviewer approval; feature stays `in_progress`.

## Tasks completed (all 10 in `specs/03_task_board_core/tasks.md`, now `[x]`)

1. `TaskState` enum + `Task` + `Subtask` Prisma models (+ back-relations on `User`
   and `TaskCategory`); hand-written migration matching Prisma's generated SQL.
2. Raw-SQL RLS migration: ENABLE+FORCE RLS on `Task`/`Subtask`, all of
   SELECT/INSERT/UPDATE/DELETE allowed to any authenticated user.
3. Zod schemas in `lib/validation/task.ts`.
4. `lib/services/tasks.ts` (list/create/update/delete + subtask add/toggle/remove).
5. `actions/tasks.ts` server actions (requireUser → Zod → service → revalidate).
6. `app/(app)/board/page.tsx` Server Component + `loading.tsx` + `error.tsx`.
7. Board components: `BoardColumns`, `BoardColumn`, `TaskCard` (server);
   `TaskFilters`, `TaskFormDialog`, `SubtaskList` (client).
8. Vitest (schemas, service filter/position, action auth/FK) + component tests.
9. RLS / unauthenticated-denial Playwright spec.
10. Verified typecheck + lint + test + build; coverage target met.

## Requirement → how satisfied → covering test

- **R1** (`Task` model: title, description?, categoryId→TaskCategory, state
  default BACKLOG, assigneeId?→User, dueDate?, position) — `prisma/schema.prisma`
  `model Task` + migration `20260622100000_tasks_and_subtasks`.
  Covered by `lib/validation/__tests__/task.test.ts > taskStateSchema`,
  `createTaskSchema` and `lib/services/__tests__/tasks.test.ts > createTask`.
- **R2** (`Subtask` model: taskId cascade, title, done default false, position) —
  `model Subtask` + the migration's `ON DELETE CASCADE` FK. Cascade is a DB-level
  guarantee; the service `deleteTask` path is covered by
  `lib/services/__tests__/tasks.test.ts > deleteTask`, and subtask shape by
  `subtaskSchema`/`addSubtask` tests.
- **R3** (RLS enabled; only authenticated may read/write; unauthenticated returns
  no rows) — `prisma/migrations/20260622100100_tasks_and_subtasks_rls`. Covered by
  `e2e/tasks-rls.spec.ts > "RLS denies the unauthenticated path ... (R3, R9)"`
  (credential-gated) and the app-layer guard tests in
  `actions/__tests__/tasks.test.ts` ("rejects an unauthenticated caller").
- **R4** (create-task: validate with `createTaskSchema`, set end-of-column
  position, insert, revalidate `/board`) — `createTask` service +
  `createTaskAction`. Covered by
  `lib/services/__tests__/tasks.test.ts > createTask` (position 0 / max+1) and
  `actions/__tests__/tasks.test.ts > createTaskAction` ("creates and revalidates
  /board on success"). E2E: `e2e/board.spec.ts > "create a task in a chosen
  column ..."`.
- **R5** (edit-task: validate + update fields + revalidate) — `updateTask` +
  `updateTaskAction`. Covered by
  `actions/__tests__/tasks.test.ts > updateTaskAction` ("updates ... and
  revalidates") and `components/board/__tests__/TaskFormDialog.test.tsx`
  ("prefills fields and submits the id + new state"). E2E: same board spec
  asserts the card moves column on reload.
- **R6** (subtask checkbox toggled → persist `done`, reflect on reload) —
  `toggleSubtask` + `toggleSubtaskAction`; `SubtaskList` checkbox. Covered by
  `lib/services/__tests__/tasks.test.ts > toggleSubtask`,
  `actions/__tests__/tasks.test.ts > toggleSubtaskAction`, and
  `components/board/__tests__/SubtaskList.test.tsx` ("calls toggleSubtaskAction
  with ... new done value"). E2E: board spec "add and check off a subtask ...".
- **R7** (active filters → render only matching tasks; reflected in URL) —
  `buildTaskWhere` + `listTasks`; `TaskFilters` writes URL params; page parses
  them with `taskFiltersSchema`. Covered by
  `lib/services/__tests__/tasks.test.ts > buildTaskWhere` (all 5 compositions) and
  `> listTasks`, plus `components/board/__tests__/TaskFilters.test.tsx` (each
  select pushes the right URL; merge/clear). E2E: board spec "filtering ...
  reflected in the URL".
- **R8** (exactly six columns in fixed `TaskState` order, each ordered by
  position) — `BoardColumns` renders `TASK_STATES` in order; `listTasks` orders by
  position. Covered by `components/board/__tests__/BoardColumns.test.tsx` ("renders
  all six columns even when there are no tasks" / "renders columns in the fixed
  TaskState order") and `TaskFormDialog.test.tsx` ("renders all six state
  options").
- **R9** (mutation without an authenticated user → reject, write nothing) — every
  action calls `ensureUser()` (wrapping `requireUser()`) first. Covered by the
  "rejects an unauthenticated caller ... NO service call or revalidate" tests for
  every action in `actions/__tests__/tasks.test.ts`, plus the RLS anon-path spec.
- **R10** (create/edit referencing a non-existent category or assignee → reject
  with a validation error) — enforced two ways: Zod rejects empty/blank
  `categoryId` and unknown `state`; a real bad FK surfaces as Prisma **P2003**,
  which the actions map to a friendly validation error with **no revalidate / no
  partial write**. Covered by `lib/validation/__tests__/task.test.ts`
  (createTaskSchema "rejects a missing categoryId" / "invalid state") and
  `actions/__tests__/tasks.test.ts` ("maps a Prisma P2003 ... to a validation
  error, no revalidate"). UI path: `TaskFormDialog.test.tsx` ("shows a field
  error returned by the action").

## Pipeline results (per stage)

- `corepack pnpm prisma generate` — OK (client regenerated with Task/Subtask).
- `corepack pnpm typecheck` (`tsc --noEmit`) — PASS, 0 errors.
- `corepack pnpm lint` (`next lint`) — PASS, 0 warnings/errors.
- `corepack pnpm test` (`vitest run --coverage`) — PASS, 23 files / 207 tests.
  Coverage on changed modules: `lib/services/tasks.ts` 100%,
  `lib/validation/task.ts` 98.59% (line 67 is the unreachable `z.NEVER` return
  inside the dueDate refine), board components ~98% (TaskCard 100%). `actions/` is
  outside the coverage `include` (same as the existing catalog actions) but is
  exercised by `actions/__tests__/tasks.test.ts`.
- `corepack pnpm build` (`next build`) — PASS. `/board` compiles as a dynamic
  (server-rendered) route; no Server/Client boundary violations.
- `prettier --check` on all feature files — clean. (Repo-wide `format:check` still
  reports pre-existing, unrelated files; `format:check` is not part of `init.sh`.)

## Credential-gated stages (run these when `.env.local` exists; dev/staging only)

1. Apply the two migrations against dev/staging Supabase:
   `corepack pnpm prisma migrate dev` (applies
   `20260622100000_tasks_and_subtasks` and `20260622100100_tasks_and_subtasks_rls`).
   The SQL is hand-authored to match Prisma's generator; re-running
   `migrate dev` with the same schema should report no drift. If Prisma prefers to
   author the data migration itself, delete the `20260622100000` folder first and
   let `migrate dev --name tasks_and_subtasks` regenerate it, then keep the RLS
   migration as-is.
2. Confirm sync: `corepack pnpm prisma migrate status`.
3. Board E2E: `corepack pnpm test:e2e` (or `./init.sh e2e`) with
   `E2E_EMPLOYEE_EMAIL`/`E2E_EMPLOYEE_PASSWORD` set and at least one seeded
   `TaskCategory` — runs `e2e/board.spec.ts` (create-in-column, edit-to-move,
   subtask add+check, filter URL).
4. RLS-denial flow: same `test:e2e` run executes `e2e/tasks-rls.spec.ts`
   (anonymous SELECT/INSERT denied; signed-in employee read allowed) — needs
   `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

No new env vars were introduced; `.env.example` already lists every variable these
specs read.

## Files created / changed

**Schema & migrations**
- `prisma/schema.prisma` — added `TaskState` enum, `Task`, `Subtask`; added
  `assignedTasks` to `User` and `tasks` to `TaskCategory`.
- `prisma/migrations/20260622100000_tasks_and_subtasks/migration.sql` (new).
- `prisma/migrations/20260622100100_tasks_and_subtasks_rls/migration.sql` (new).

**Validation / services / actions**
- `lib/validation/task.ts` (new).
- `lib/services/tasks.ts` (new) — also registers the `taskCategory` reference
  counter with the 02 catalog delete-guard.
- `actions/tasks.ts` (new).

**UI**
- `app/(app)/board/page.tsx` (replaced placeholder), `loading.tsx` (new),
  `error.tsx` (new).
- `components/board/board-types.ts`, `BoardColumns.tsx`, `BoardColumn.tsx`,
  `TaskCard.tsx`, `TaskFilters.tsx`, `TaskFormDialog.tsx`, `SubtaskList.tsx` (new).

**Tests**
- `lib/validation/__tests__/task.test.ts`,
  `lib/services/__tests__/tasks.test.ts`,
  `actions/__tests__/tasks.test.ts`,
  `components/board/__tests__/{TaskCard,BoardColumns,TaskFormDialog,SubtaskList,TaskFilters}.test.tsx`,
  `e2e/board.spec.ts`, `e2e/tasks-rls.spec.ts` (all new).

**Spec**
- `specs/03_task_board_core/tasks.md` — all items checked.

## Deviations & key design notes (for the reviewer / for 04)

- **Server/Client boundary (so 04 can add dnd without a rewrite).** `page.tsx`,
  `BoardColumns`, `BoardColumn`, `TaskCard` are Server Components that pass only
  serializable props (`dueDate` is sent as an ISO string, never a `Date`/function).
  Interactivity is isolated in three small Client islands: `TaskFilters`,
  `TaskFormDialog`, `SubtaskList`. 04 can wrap `BoardColumns`/`TaskCard` in a
  single dnd `DndContext` client island and add a reorder action without changing
  the column data flow or the page. `position` is already an explicit integer rank
  per state column (end-of-column on create); reorder/move is intentionally absent
  here (column placement comes only from the form's `state` field).
- **Bad-FK rejection (R10).** Implemented defense-in-depth: (a) Zod rejects
  blank/`""` ids and unknown enum states before any DB call; (b) a genuinely
  non-existent `categoryId`/`assigneeId`/`taskId` is caught at the DB as Prisma
  **P2003** and mapped by the action to a user-safe message
  ("Category or assignee no longer exists" / "That task no longer exists") with
  **no `revalidatePath`** and **no partial write**. The service does not swallow
  the error — it propagates so the action owns the mapping (matches the 02 catalog
  P2002/P2003 pattern).
- **Form null-handling.** Optional fields submitted by a `FormData` form arrive as
  `null` when omitted; the optional Zod schemas (`assigneeId`, `dueDate`,
  `description`) explicitly normalize `null`/`""`/`"none"` → `undefined`, so an
  omitted field is never a validation error.
- **Catalog delete-guard wiring.** 03 is the first feature to reference a catalog
  with `onDelete: Restrict`, so `lib/services/tasks.ts` registers a `taskCategory`
  reference counter (`db.task.count({ where: { categoryId } })`) with the 02
  catalog service. This makes the catalog "in use" pre-check return true while any
  task points at a category (friendly block before the FK Restrict would error).
  Covered by `lib/services/__tests__/tasks.test.ts > registerCatalogReference
  wiring`.
- **Migration authored by hand.** Because no `.env.local` is available in this
  environment, the two migration SQL files were written by hand to match Prisma's
  generated output (enum + tables + indexes + FKs, then the RLS DDL). They must be
  applied with `prisma migrate dev` against dev/staging before the E2E/RLS specs
  can run — see the credential-gated section.
- **RLS policy.** Per the confirmed design choice, `Task`/`Subtask` RLS allows all
  four verbs to any `authenticated` user (no per-row ownership). This differs from
  the catalog tables (where writes are admin-only) and from `User` — intentional,
  documented in the migration header.
