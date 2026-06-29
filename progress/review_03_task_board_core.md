# Review — 03_task_board_core

**Verdict: APPROVE.** The feature may be marked done.

Reviewer: reviewer subagent. Date: 2026-06-22. Read-only review; no code modified.

Credential-free pipeline (typecheck, lint, test+coverage, build) reproduced green.
DB-apply / Playwright E2E / RLS-denial stages are legitimately credential-gated
[no .env.local]; their migration SQL, RLS SQL, and spec FILES were verified to
exist and be correct, and the gated stages are documented with correct human
follow-up commands in progress/impl_03_task_board_core.md.

## R1-R10 traceability (requirement -> test -> pass/fail)

| Req | Requirement | Covering test(s) | Result |
|-----|------------|------------------|--------|
| R1 | Task model (title, description?, categoryId->TaskCategory, state default BACKLOG, assigneeId?->User, dueDate?, position) | task.test.ts createTaskSchema/taskStateSchema; tasks.test.ts createTask; schema+migration verified | PASS |
| R2 | Subtask model (taskId cascade, title, done default false, position) | tasks.test.ts addSubtask + deleteTask; cascade FK verified in migration SQL | PASS |
| R3 | RLS enabled, authenticated-only, anon sees no rows | e2e/tasks-rls.spec.ts; RLS migration verified | PASS (E2E gated) |
| R4 | create: validate, end-of-column position, insert, revalidate | tasks.test.ts createTask (pos 0 / max+1); tasks action test createTaskAction | PASS |
| R5 | edit: validate + update + revalidate | tasks action test updateTaskAction; TaskFormDialog.test.tsx | PASS |
| R6 | subtask toggle persists done | tasks.test.ts toggleSubtask; tasks action test toggleSubtaskAction; SubtaskList.test.tsx | PASS |
| R7 | active filters render only matching tasks; reflected in URL | tasks.test.ts buildTaskWhere (5 compositions) + listTasks; TaskFilters.test.tsx; task.test.ts taskFiltersSchema | PASS |
| R8 | six columns in fixed order, position-ordered | BoardColumns.test.tsx; TaskFormDialog.test.tsx (six state options) | PASS |
| R9 | mutation without auth -> reject, write nothing | tasks action test rejects-unauthenticated (no service call/revalidate) for every action; e2e/tasks-rls.spec.ts | PASS |
| R10 | bad category/assignee -> validation error | task.test.ts (blank categoryId / invalid state); tasks action test (P2003 -> validation error, no revalidate); TaskFormDialog.test.tsx | PASS |

Every requirement maps to at least one real, behaviour-asserting test.

## Task completeness (specs/03_task_board_core/tasks.md)

All 10 items checked [x] and genuinely done (spot-checked against code): enum +
models + migration; RLS migration; Zod schemas; tasks service; tasks actions;
board page + loading/error + 6 columns; board components; Vitest + component
tests; RLS denial spec; pipeline verified (reproduced green here).

---

## Targeted verifications

**Schema (R1, R2).** Task: categoryId->TaskCategory onDelete:Restrict,
assigneeId?->User onDelete:SetNull, state default BACKLOG, integer position,
indexes [state,position], [categoryId], [assigneeId] -- all present. Subtask:
taskId->Task onDelete:Cascade, done default false, integer position, index
[taskId,position]. Migration 20260622100000_tasks_and_subtasks matches the
schema exactly (enum, both tables, all four indexes, all three FKs with correct
ON DELETE actions).

**RLS (R3, R9).** 20260622100100_tasks_and_subtasks_rls ENABLEs + FORCEs RLS on
both tables and grants SELECT/INSERT/UPDATE/DELETE to authenticated (USING/WITH
CHECK true) -- matching the CONFIRMED design choice (any authenticated user, no
per-row ownership). e2e/tasks-rls.spec.ts asserts anon SELECT returns 0 rows and
anon INSERT writes nothing on both tables, and a signed-in read is allowed. Every
action calls ensureUser() (wrapping requireUser()) FIRST and returns before any
parse/DB/revalidate on rejection -- verified per action and unit-tested.

**Position logic (R4).** createTask -> nextPositionInState returns
last ? last.position+1 : 0. Unit-tested for both empty-column=0 and max+1.
updateTask does not reposition (tested: data has no position).

**Filters (R7).** buildTaskWhere composes assignee/category/state, omitting
absent dimensions; listTasks is a single findMany with subtasks included and
ordered by position (no N+1); BoardColumns groups the flat list in memory.
board/page.tsx reads owner/category/state from searchParams via taskFiltersSchema;
TaskFilters writes them via router.push. All covered.

**R10 bad-FK.** Defense-in-depth: Zod rejects blank/unknown ids/state before any
DB call; a genuine bad FK surfaces as Prisma P2003, mapped by the action to a
friendly validation error with NO revalidate and NO partial write. Service
propagates the error. Tested at schema, action, and UI levels.

**Server/Client boundary.** page.tsx, BoardColumns, BoardColumn, TaskCard are
Server Components passing only serializable props (dueDate -> ISO string).
Interactivity isolated to three Client islands (TaskFilters, TaskFormDialog,
SubtaskList). next build emits /board as a dynamic route with no boundary
violation. dnd-kit is NOT imported anywhere in feature-03 code (only in
package.json/lockfile from setup and in 04 specs/docs) -- dnd did not leak in
early; 04 can add a dnd island without rewriting the page.

**Catalog delete-guard wiring.** lib/services/tasks.ts calls
registerCatalogReference("taskCategory", (id) => db.task.count({where:{categoryId:id}}))
at import time -- the first real consumer of the 02 registry hook. The
"category in use" pre-check now returns true while any task points at a category.
Tested in tasks.test.ts "registerCatalogReference wiring".

**Conventions / security.** No any, no @ts-ignore, no console.log in feature
code. Prisma imported server-only via the lib/db singleton; lib/validation/task.ts
is client-importable (declares its own TASK_STATES, no server-only import). No
new env vars; .env.example already lists every variable the specs read
(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
E2E_EMPLOYEE_EMAIL/PASSWORD). No secrets committed. No
model/table/route/env/dependency beyond the spec -- no scope leak from 04 or
later.

**Migrations.** Two committed migrations; SQL hand-authored to match the Prisma
generator. Apply + prisma migrate status are credential-gated and documented with
correct human follow-up commands. Not a blocker per the gating rules.

---

## Pipeline reproduced (corepack pnpm; bare pnpm not on PATH)

| Stage | Command | Result |
|------|--------|--------|
| Prisma generate | corepack pnpm prisma generate | OK |
| Typecheck | corepack pnpm typecheck | PASS, 0 errors |
| Lint | corepack pnpm lint | PASS, 0 warnings/errors |
| Test + coverage | corepack pnpm test | PASS, 23 files / 207 tests |
| Build | corepack pnpm build | PASS, /board dynamic, no boundary violation |

Coverage on feature-03 modules: lib/services/tasks.ts 100%,
lib/validation/task.ts 98.59% (only line 67, the unreachable z.NEVER in the
dueDate refine), board components ~98% (TaskCard.tsx 100%). Meets the tasks.md
target (services/schemas branch-complete). Actions are excluded from the
coverage include (consistent with the existing catalog actions) but are fully
exercised by actions/__tests__/tasks.test.ts.

Credential-gated stages NOT run here (legitimately, no .env.local):
prisma migrate dev / prisma migrate status, ./init.sh e2e (board + RLS specs).
Documented with correct follow-up commands in the implementer report.

---

## Minor observations (non-blocking, not defects)

- The Owner filter offers an "Unassigned" option that writes owner=none, but
  taskFiltersSchema normalizes none to undefined, so it behaves identically to
  "All owners" (does not filter to unassigned tasks). R7 does not require an
  unassigned filter, so this is a cosmetic UX nit, not a requirement gap. Worth
  a follow-up if an explicit "Unassigned" filter is later desired.
