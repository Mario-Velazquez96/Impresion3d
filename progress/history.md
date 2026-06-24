# Session history (append-only)

---

## 00_project_setup — DONE (2026-06-21)

**Feature:** Project bootstrap & toolchain foundation. Spec approved by human; implemented and reviewer-APPROVED.

**Delivered:** Next.js App Router + TS `strict` (root-level `app/`, `@/*` alias); Tailwind + shadcn/ui (Button, `cn()`); Prisma datasource (pooled `DATABASE_URL` + `directUrl`=`DIRECT_URL`) + server-only `lib/db.ts` singleton; `@supabase/ssr` browser + server clients (per-request, publishable key) + `middleware.ts` session refresh (pass-through when env absent); dnd-kit installed; Vitest + Playwright with smoke tests; ESLint + Prettier; pnpm scripts; `.env.example` (5 keys, no secrets), `.env.local` gitignored.

**Requirements:** R1–R8 all satisfied and traced to tests/pipeline checks.

**Verification:** Pipeline green (typecheck, lint, Vitest 8/8, build with static `/` + bundled middleware; prisma generate; Playwright E2E 1 passed against a manually started server). Reproduced independently by the leader and the reviewer via `corepack pnpm` (bare `pnpm` not on this machine's PATH).

**Outstanding (release-time):** Vercel preview deploy not performed from the sandbox — track as an acceptance item to validate at release. `init.sh e2e`'s auto-spawned webServer needs `pnpm` on PATH (environment-only; not a code defect).

**Reports:** `progress/impl_00_project_setup.md`, `progress/review_00_project_setup.md`.

---

## 01_auth_and_user_management — DONE (2026-06-21)

**Feature:** Authentication, roles, and admin user management. Spec approved by human (gate decision: invite via admin-entered temporary password, not invite email); implemented and reviewer-APPROVED.

**Delivered:** `Role` enum + `User` model (id = auth.users.id) + migration; raw-SQL RLS migration on `public."User"` (self-read, admin read-all, admin-only role UPDATE, no client INSERT/DELETE, non-recursive `SECURITY DEFINER is_admin()`); `lib/auth.ts` (`getCurrentUser`/`requireUser`/`requireAdmin` on `getUser()`); `lib/services/users.ts` (`listUsers`, `ensureUserRow` first-user-is-admin, `inviteUser` via Supabase Admin API `createUser` with secret key + `email_confirm`, `setUserRole`); `(auth)/login` form; `(app)` route guard + sign-out; `admin/*` requireAdmin (custom 403); admin users page (`UsersTable` + invite dialog, native HTML to avoid unapproved Radix deps); Zod schemas. No new runtime deps.

**Requirements:** R1–R10 (+R8a temp-password validation) all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 62 tests/9 files (100% branch coverage on auth + service + validation + admin components), build OK; secret key confined to `server-only` service (verified absent from `.next/static`). Reviewer independently reproduced.

**Outstanding (credential-gated, human follow-up with dev/staging Supabase — never production):** apply the two migrations (`corepack pnpm prisma migrate dev`); run Playwright E2E auth flows + RLS-denial spec (`corepack pnpm test:e2e`) after setting `.env.local` and the E2E test-account vars; live Admin-API invite exercised by the gated E2E invite test.

**Reports:** `progress/impl_01_auth_and_user_management.md`, `progress/review_01_auth_and_user_management.md`.

---

## 02_catalog_management — DONE (2026-06-22)

**Feature:** Manageable catalogs (Color, PrintType, SupplyType, TaskCategory) as tables, Admin-only CRUD with RLS, idempotent seed, delete-guard. Spec approved by human (delete strategy = hard `Restrict` + in-use pre-check); implemented and reviewer-APPROVED.

**Delivered:** Four catalog models (`name @unique`; Color adds `hex`) + migration; raw-SQL RLS per table (authenticated SELECT, admin-only writes via shared `is_admin()`); idempotent `prisma/seed.ts` (6 colors+hex, 4 task categories, 3 print types, upsert keyed on name); Zod `colorSchema` (hex regex) + `nameOnlySchema`; generic `lib/services/catalogs.ts` (CRUD + forward-pluggable `isCatalogValueInUse` registry for future FKs); `actions/catalogs.ts` (requireAdmin first, P2002→field error, delete-guard with P2003 backstop); `admin/catalogs` page + native-ARIA `CatalogTabs` + `CatalogTable` with color swatch. No new runtime deps.

**Requirements:** R1–R8 all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 121 tests/15 files (catalog services + schemas ~100% coverage), build OK. Reviewer independently reproduced; all four implementer deviations (admin route under `app/admin/`, native ARIA tabs, `node prisma/seed.ts` via `PRISMA_SEED_RUN`, Prisma 6 seed-config deprecation) judged acceptable.

**Outstanding (credential-gated, dev/staging Supabase only — never production):** apply migrations (`corepack pnpm prisma migrate deploy`), run seed (`corepack pnpm prisma db seed`), run Playwright E2E (`e2e/catalogs.spec.ts`) + RLS-denial (`e2e/catalogs-rls.spec.ts`) after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_02_catalog_management.md`, `progress/review_02_catalog_management.md`.

---

## 03_task_board_core — DONE (2026-06-22)

**Feature:** Kanban task domain + statically rendered board (no dnd). Spec approved by human (RLS = any authenticated user reads/writes all tasks, no per-row ownership); implemented and reviewer-APPROVED.

**Delivered:** `TaskState` enum + `Task` (categoryId→TaskCategory Restrict, assigneeId?→User SetNull, state default BACKLOG, integer position, indexes) + `Subtask` (taskId Cascade, done, position) models + migration; raw-SQL RLS (both tables, all verbs to authenticated); Zod `createTaskSchema`/`updateTaskSchema`/`subtaskSchema`/`toggleSchema`; `lib/services/tasks.ts` (listTasks w/ filter composition + no N+1, createTask end-of-column position, update/delete, subtask add/toggle/remove) — also registers a `taskCategory` reference counter with the 02 catalog delete-guard (first consumer of that hook); `actions/tasks.ts` (requireUser first, Zod, P2003 bad-FK → friendly error with no write, revalidate /board); Server-Component board (`/board` page + loading/error, BoardColumns/BoardColumn/TaskCard) with client islands TaskFilters (URL params)/TaskFormDialog/SubtaskList — Server/Client boundary kept clean so 04 can add a dnd island without a rewrite. No new runtime deps.

**Requirements:** R1–R10 all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 207 tests/23 files (services + schemas ~100% coverage), build OK (`/board` dynamic, clean boundaries). Reviewer independently reproduced.

**Outstanding (credential-gated, dev/staging Supabase only — never production):** apply migrations (`corepack pnpm prisma migrate dev`), run Playwright board E2E (`e2e/board.spec.ts`) + unauthenticated RLS-denial (`e2e/tasks-rls.spec.ts`) after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_03_task_board_core.md`, `progress/review_03_task_board_core.md`.

---

## 04_task_board_dnd — DONE (2026-06-22)

**Feature:** dnd-kit drag-and-drop on the Kanban board. Human directed "continue with the next feature" (gate approval); implemented and reviewer-APPROVED. No schema changes (reuses `Task.position`/`state`).

**Delivered:** `reorderTaskSchema`; `lib/services/tasks.ts` `reorderTask` (transactional state change + contiguous `0..n-1` renumber of source/dest columns via pure `renumberColumnWithInsert`, idempotent, clamped, no drift — 100% branch coverage); `actions/tasks.ts` `reorderTaskAction` (requireUser → Zod → service → revalidate /board, typed-payload signature); `KanbanBoard` client island (DndContext, Pointer + Keyboard sensors, per-column SortableContext, DragOverlay, ARIA announcements) + `KanbanColumn` (droppable) + `SortableTaskCard`; optimistic splice with snapshot rollback + error toast on failure via a new dependency-free `components/ui/toast.tsx`; `board/page.tsx` swapped to render `<KanbanBoard>` (server fetch unchanged, Server/Client boundary preserved). No new runtime deps; no new env vars.

**Requirements:** R1–R8 all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 245 tests/26 files (ordering core 100% branch; rollback/auth/a11y covered), build OK. Reviewer independently reproduced; deviations (local toast, jsdom pure-function dnd testing with ~75% island line coverage meeting the spec's stated target, typed-payload action, retained off-path 03 BoardColumns) judged acceptable.

**Outstanding (credential-gated, dev/staging Supabase only — never production):** run Playwright persistence E2E (`e2e/board-dnd.spec.ts`: cross-column + within-column reload persistence) via `corepack pnpm test:e2e` after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_04_task_board_dnd.md`, `progress/review_04_task_board_dnd.md`.

---

---

## 05_expense_tracking — DONE (2026-06-22)

**Feature:** Supply expense recording (CRUD + list). Proceeded under the human's standing "continue" approval; implemented and reviewer-APPROVED. Gate defaults: delete = Admin-only (app layer); currency = MXN via a centralized `Intl.NumberFormat('es-MX')` formatter.

**Delivered:** `Expense` model (`cost Decimal(10,2)`, reason, date, purchaseUrl?, supplyType `onDelete: Restrict`, indexes on date + supplyTypeId) + migration; raw-SQL RLS (authenticated read/write); Zod `createExpenseSchema`/`updateExpenseSchema` (positive 2-dp cost, optional valid URL, required supplyType); `lib/services/expenses.ts` (listExpenses date-desc single query; create/update/delete; cost via `new Prisma.Decimal` — no float; registers a `supplyType` reference counter with the 02 catalog delete-guard); `actions/expenses.ts` (requireUser create/edit, requireAdmin delete, revalidate); Server-Component `/expenses` page + ExpensesTable (formatted, link when present) + ExpenseFormDialog + DeleteExpenseButton client islands + loading/error + nav link; `lib/format.ts` centralized `formatCurrency`. No new deps/env vars.

**Requirements:** R1–R9 all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 296/296 tests/32 files (service + schema branches; Decimal 2-dp round-trip incl. float-trap and trailing-zero preservation asserted), build OK. Reviewer independently reproduced.

**Outstanding (credential-gated, dev/staging Supabase only — never production):** apply migrations (`corepack pnpm prisma migrate dev`), run Playwright E2E (`e2e/expenses.spec.ts`) + RLS-denial (`e2e/expenses-rls.spec.ts`) via `corepack pnpm test:e2e` after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_05_expense_tracking.md`, `progress/review_05_expense_tracking.md`.

---

---

## 06_print_inventory — DONE (2026-06-22)

**Feature:** Print inventory with photos (private Supabase Storage) and colors. Proceeded under the human's standing "continue" approval; implemented across two runs (first hit a session limit; second fixed a typecheck error + two broken action tests and added the missing component/E2E specs) and reviewer-APPROVED. Gate defaults: signed-URL TTL 3600s; uploads max 5MB png/jpeg/webp; no thumbnails; delete Admin-only.

**Delivered:** `Print` + `PrintColor` (composite PK; printType Restrict, color Restrict, print Cascade) models + migration; raw-SQL RLS (authenticated read/write); version-controlled private `print-photos` bucket + `storage.objects` policies migration; `lib/storage.ts` (server-only upload/replace/remove + createSignedUrl TTL 3600, unguessable keys, never public URLs); Zod `createPrintSchema`/`updatePrintSchema` + `photoConstraints` (≥1 color, int fields, size+mime guard); `lib/services/prints.ts` (filtered single-query list, get, create, atomic color-set replace via $transaction deleteMany+createMany, delete, signPhoto; registers `printType` + `color` reference counters with the 02 catalog delete-guard); `actions/prints.ts` (requireUser create/edit, requireAdmin delete, validate fields+file BEFORE any upload/DB write, delete removes Storage object); Server-Component `/inventory` grid + `[printId]` detail with render-time signed URLs + swatches; client islands InventoryFilters/PrintFormDialog/ColorMultiSelect; nav link. No new deps; no `.env.example` changes (bucket name is a code constant).

**Requirements:** R1–R11 all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 367 tests/38 files (services + schema + storage-helper branches ~100%), build OK. Reviewer independently reproduced and confirmed the two test fixes preserved their assertions.

**Outstanding (credential-gated, dev/staging Supabase only — never production):** apply the three migrations incl. the bucket/policies (`corepack pnpm prisma migrate dev`); run Playwright E2E + RLS/bucket-denial (`e2e/inventory.spec.ts`, `e2e/inventory-rls.spec.ts`) via `corepack pnpm test:e2e` after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_06_print_inventory.md`, `progress/review_06_print_inventory.md`.

---

---

## 07_weekly_planning — DONE (2026-06-22)

**Feature:** Weekly planner with color-match filtering (the portal's central tool). Proceeded under the human's standing "continue" approval; implemented and reviewer-APPROVED. Gate defaults: Monday week-start (snap-to-Monday); Select-based day assignment (optional dnd deferred); any authenticated user edits the shared plan; "dry the day before" derived at render, never stored.

**Delivered:** `Weekday` enum + `WeekPlan` (weekStartDate unique, createdBy Restrict) + `WeekPlanColor` (cascade from plan, color Restrict, composite PK) + `WeekPlanItem` (cascade from plan, print Restrict, dayOfWeek, position, index) models + the `Print.weekItems` back-relation 06 deferred; migration + raw-SQL RLS (all three tables, authenticated read/write); the PURE color-match core `lib/planning-core.ts` (`fullMatches`/`partialMatches` with missing-colors + `dryingSchedule` day−1 incl. MON→prior-Sunday edge) at 100% branch coverage with the spec's worked example asserted; `lib/services/planning.ts` (getOrCreateWeekPlan snap-to-Monday, setWeekColors atomic color-set replace, assign/move/remove); Zod schemas; `actions/planning.ts` (requireUser-first, revalidate /planning); Server-Component `/planning` page (server-side matching) + client islands WeekPlanner/ColorPicker/MatchModeToggle/FilteredInventory/WeekGrid/DayColumn/Swatch (re-derive on toggle, no refetch) + nav link. No new deps/env vars.

**Requirements:** R1–R11 all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 423 tests/42 files (planning-core 100% branch — the spec's hard target; service/validation/actions 100%), build OK. Reviewer independently reproduced.

**Outstanding (credential-gated, dev/staging Supabase only — never production):** apply migrations (`corepack pnpm prisma migrate dev`); run Playwright E2E (`e2e/planning.spec.ts`) + RLS-denial (`e2e/planning-rls.spec.ts`) via `corepack pnpm test:e2e` after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_07_weekly_planning.md`, `progress/review_07_weekly_planning.md`.

---
