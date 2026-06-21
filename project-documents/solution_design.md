# Solution Design — Tower Layers (3D Printing Management Portal)

> **Status: APPROVED — derived from `client_requirement.md` v1.1 (2026-06-20).**
> This is the approved architecture: *how* we build it. The `leader` follows
> this plan to sequence features. Keep it aligned with `docs/architecture.md`.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + Storage, hosted) ·
Prisma · Tailwind + shadcn/ui · dnd-kit · Vercel · TypeScript · pnpm.

---

## 1. Context

Tower Layers is an **internal** web portal for a 3D-printing business run by two
partners. It centralizes four operational areas — Kanban task management, supply
expense tracking, a searchable print inventory, and a humidity-aware weekly
planner — plus the manageable catalogs (colors, print types, supply types, task
categories) that feed them.

Technical framing:

- **Audience & scale:** 2 users at launch, **≤5 within 12 months**, all
  authenticated. Desktop-first; responsive is desirable, not required for MVP.
- **The defining constraint:** the business is in a high-humidity city, so
  filament must be **dried the day before** it is used. The user picks which
  **colors** will be dried for the week; the system filters the inventory to the
  prints producible with those colors, and those prints are scheduled per day.
  This drives the planning + color-filtering feature (brief §1.2, §4.4).
- **Scalability mandate (brief §1, §5):** a modular foundation so future features
  (quotes, expense reports/totals, filament-stock linking, mobile) bolt on
  **without redesigning the foundation**. We achieve this with a clean layered
  architecture (routes → server actions → services → Prisma) and **manageable
  catalogs** instead of hardcoded enums for business taxonomies.
- **Source of truth:** the Git repo. Schema lives in Prisma migrations; RLS and
  Storage policies live in version-controlled SQL migrations — never
  dashboard-only edits. Development/verification target the **dev/staging**
  Supabase project; never production (per `docs/architecture.md`).

**Decisions locked in for this design:**

- **Print time & filament grams are structured integers** (`printTimeMinutes`,
  `filamentGrams`) — enables sorting/filtering and the future reporting/planning
  math (resolves brief §7.2).
- **Employee role = operational default**: create/update tasks, record expenses,
  view inventory & planning; **no** user or catalog management (resolves brief
  §7.1). Both launch users are Admins, but the role is modeled from day one to
  avoid rework (brief §3 note).

## 2. Requirement → Design mapping

| Requirement (from brief) | Design element |
|---|---|
| Users & roles, Admin/Employee, RBAC (§3, §5) | Supabase Auth (`@supabase/ssr`) + `User.role` enum; `middleware.ts` session refresh; server-layer authorization in every action; RLS as defense-in-depth; admin user management UI (`01_auth_and_user_management`) |
| Kanban board, draggable columns, subtasks (§4.1) | `Task` + `Subtask` models with `state` enum + `position` rank; `app/(app)/board`; static render + filters (`03_task_board_core`); dnd-kit client island for move/reorder (`04_task_board_dnd`) |
| Filter tasks by owner/category/state (§4.1) | Server-side query params → Prisma `where`; filter controls in board UI (`03_task_board_core`) |
| Expense recording: cost, reason, date, link, supply type (§4.2) | `Expense` model + `SupplyType` catalog; `app/(app)/expenses` list + form (`05_expense_tracking`). `date`/`supplyTypeId` kept structured so future reports/totals need no remodel |
| Print inventory: name, colors[], time, grams, photo, doc link, type (§4.3) | `Print` model + `PrintColor` M2M + `PrintType` catalog; Supabase Storage for photos; `app/(app)/inventory` (`06_print_inventory`) |
| Weekly planning + color filtering, full/partial match (§4.4) | `WeekPlan` / `WeekPlanColor` / `WeekPlanItem`; color-match service (full + partial w/ missing colors); `app/(app)/planning` (`07_weekly_planning`) |
| Color catalog with hex swatch (§4.5) | `Color` model (`name` unique + `hex`); seeded with the 6 initial colors; admin CRUD (`02_catalog_management`) |
| Manageable catalogs (§4.6) | `TaskCategory`, `PrintType`, `SupplyType`, `Color` as tables (not enums) + admin CRUD UI (`02_catalog_management`) |
| Scalability / modular foundation (§1, §5) | Layered architecture (`docs/architecture.md`); catalogs as data; feature-sliced SDD sequencing (§9) |
| Image storage (§5) | Supabase Storage bucket `print-photos` + access policies; signed URLs (`06_print_inventory`) |
| Out of scope (§2.2, §6) | Quotes, expense reports/totals, filament-stock linking, public catalog, offline, native mobile — **not** built; data model left extensible for them |

## 3. Data model (Prisma)

Conventions: models `PascalCase` singular, fields `camelCase`, `cuid()` ids
(except `User.id` = Supabase auth UUID), `createdAt`/`updatedAt` on every model.
Catalog names are `@unique`. `position` integer ranks support dnd-kit reordering.
Catalogs are **referenced, not deleted-cascading** — deleting a catalog row in
use is restricted (`onDelete: Restrict`) so history stays intact.

```prisma
enum Role   { ADMIN EMPLOYEE }
enum TaskState { BACKLOG TODO IN_PROGRESS PENDING BLOCKER DONE }
enum Weekday { MON TUE WED THU FRI SAT SUN }

model User {
  id        String   @id            // = Supabase auth.users.id (UUID)
  email     String   @unique
  name      String
  role      Role     @default(EMPLOYEE)
  tasks     Task[]   @relation("AssignedTasks")
  weekPlans WeekPlan[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ---- Manageable catalogs (§4.6) ----
model TaskCategory { id String @id @default(cuid()) name String @unique tasks Task[]   createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model PrintType    { id String @id @default(cuid()) name String @unique prints Print[]  createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model SupplyType   { id String @id @default(cuid()) name String @unique expenses Expense[] createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model Color {
  id    String @id @default(cuid())
  name  String @unique
  hex   String                       // e.g. "#1E3A8A" for the swatch
  prints     PrintColor[]
  weekPlans  WeekPlanColor[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ---- Tasks (§4.1) ----
model Task {
  id          String     @id @default(cuid())
  title       String
  description String?
  category    TaskCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  categoryId  String
  state       TaskState  @default(BACKLOG)
  assignee    User?      @relation("AssignedTasks", fields: [assigneeId], references: [id], onDelete: SetNull)
  assigneeId  String?
  dueDate     DateTime?
  position    Int                     // rank within its state column (dnd-kit)
  subtasks    Subtask[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  @@index([state, position])
  @@index([categoryId]); @@index([assigneeId])
}
model Subtask {
  id        String  @id @default(cuid())
  task      Task    @relation(fields: [taskId], references: [id], onDelete: Cascade)
  taskId    String
  title     String
  done      Boolean @default(false)
  position  Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([taskId, position])
}

// ---- Expenses (§4.2) ----
model Expense {
  id          String   @id @default(cuid())
  cost        Decimal  @db.Decimal(10, 2)
  reason      String
  date        DateTime
  purchaseUrl String?
  supplyType  SupplyType @relation(fields: [supplyTypeId], references: [id], onDelete: Restrict)
  supplyTypeId String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([date]); @@index([supplyTypeId])   // ready for future per-month / per-type reports
}

// ---- Inventory (§4.3) ----
model Print {
  id              String   @id @default(cuid())
  name            String
  printTimeMinutes Int                       // structured (resolves §7.2)
  filamentGrams   Int
  photoPath       String?                    // Supabase Storage object key
  documentUrl     String?
  printType       PrintType @relation(fields: [printTypeId], references: [id], onDelete: Restrict)
  printTypeId     String
  colors          PrintColor[]               // colors used (no per-color grams, §4.3 note)
  weekItems       WeekPlanItem[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([printTypeId]); @@index([name])
}
model PrintColor {
  print   Print  @relation(fields: [printId], references: [id], onDelete: Cascade)
  printId String
  color   Color  @relation(fields: [colorId], references: [id], onDelete: Restrict)
  colorId String
  @@id([printId, colorId])
  @@index([colorId])
}

// ---- Weekly planning (§4.4) ----
model WeekPlan {
  id            String   @id @default(cuid())
  weekStartDate DateTime @unique             // Monday of the planned week (one plan per week)
  createdBy     User     @relation(fields: [createdById], references: [id], onDelete: Restrict)
  createdById   String
  colors        WeekPlanColor[]              // colors available/dried that week
  items         WeekPlanItem[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
model WeekPlanColor {
  weekPlan   WeekPlan @relation(fields: [weekPlanId], references: [id], onDelete: Cascade)
  weekPlanId String
  color      Color    @relation(fields: [colorId], references: [id], onDelete: Restrict)
  colorId    String
  @@id([weekPlanId, colorId])
}
model WeekPlanItem {
  id         String   @id @default(cuid())
  weekPlan   WeekPlan @relation(fields: [weekPlanId], references: [id], onDelete: Cascade)
  weekPlanId String
  print      Print    @relation(fields: [printId], references: [id], onDelete: Restrict)
  printId    String
  dayOfWeek  Weekday
  position   Int                             // rank within a day column
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([weekPlanId, dayOfWeek, position])
}
```

**Notes**

- **"Colors to dry the day before each print" (§4.4) is derived**, not stored: a
  print on day *D* needs its `PrintColor`s ready on day *D − 1*. Computed in the
  planning service / UI, so there is nothing to keep in sync.
- `Task.position` / `Subtask.position` / `WeekPlanItem.position` are integer ranks
  for dnd-kit ordering (§7).
- `Expense.cost` is `Decimal(10,2)` — money is never a float.
- Catalogs are tables (not Prisma enums) **except** `Role`, `TaskState`, `Weekday`,
  which are fixed by the brief and not user-manageable.

## 4. Routes & components (App Router)

```
app/
  (auth)/
    login/page.tsx               # Client island: email/password sign-in via browser Supabase client
  (app)/
    layout.tsx                   # Server: getUser() guard + nav shell; redirects to /login if no session
    page.tsx                     # Server: redirect to /board (default landing)
    board/
      page.tsx                   # Server: fetch tasks (+ filter params) → <KanbanBoard>
      loading.tsx · error.tsx
    expenses/
      page.tsx                   # Server: list expenses → table + <ExpenseFormDialog> (Client)
    inventory/
      page.tsx                   # Server: list/search prints → grid + <PrintFormDialog> (Client)
      [printId]/page.tsx         # Server: print detail (signed photo URL)
    planning/
      page.tsx                   # Server: load/Create week plan → <WeekPlanner> (Client)
    admin/
      layout.tsx                 # Server: require role ADMIN (else 403)
      users/page.tsx             # Admin: list + invite/role-edit users
      catalogs/page.tsx          # Admin: tabbed CRUD for colors / print-types / supply-types / task-categories
components/
  board/  KanbanBoard.tsx (client) · BoardColumn.tsx · TaskCard.tsx · TaskFilters.tsx · SubtaskList.tsx
  planning/ WeekPlanner.tsx (client) · ColorPicker.tsx · MatchModeToggle.tsx · DayColumn.tsx
  inventory/ PrintForm.tsx (client) · PrintCard.tsx · ColorMultiSelect.tsx
  expenses/ ExpenseForm.tsx (client)
  catalogs/ CatalogTable.tsx (client)
  ui/                            # shadcn/ui primitives (generated)
lib/
  db.ts                          # Prisma singleton (server-only)
  supabase/server.ts · client.ts # @supabase/ssr clients (per-request)
  auth.ts                        # getCurrentUser(), requireUser(), requireAdmin() helpers
  services/                      # tasks, expenses, inventory, planning, catalogs, users
  validation/                    # Zod schemas per boundary
  utils.ts                       # cn() + helpers
middleware.ts                    # Supabase session refresh on every request
```

- **Server Components by default**; `"use client"` only for the dnd board,
  forms/dialogs, color picker, catalog tables (state/handlers).
- Each async route segment gets `loading.tsx` (Suspense) and `error.tsx`.
- `page.tsx`/`layout.tsx` stay thin — fetch + delegate to components/services.

## 5. Mutations (Server Actions / route handlers)

All mutations are **Server Actions** (`"use server"`). There are no public HTTP
endpoints in the MVP (a Route Handler is added only if/when external callers
appear). Every action follows the same pipeline:

```
trigger → resolve auth user (server Supabase client, getUser())
        → zod.parse(input)
        → authorize (role + ownership where relevant)
        → call lib/services/* (Prisma)
        → revalidatePath(affected route)   → return typed Result
```

| Action | Auth | Notes |
|---|---|---|
| `createTask` / `updateTask` / `deleteTask` | Admin or Employee | category/assignee validated against catalogs |
| `reorderTask` | Admin or Employee | **optimistic**; persists `state` + `position`; idempotent |
| `toggleSubtask` / `addSubtask` / `removeSubtask` | Admin or Employee | |
| `createExpense` / `updateExpense` / `deleteExpense` | create/edit: both; delete: Admin | `cost` parsed as Decimal |
| `createPrint` / `updatePrint` / `deletePrint` | Admin or Employee create/edit; delete: Admin | photo upload to Storage; set `PrintColor`s |
| `setWeekColors` / `assignPrintToDay` / `moveWeekItem` / `removeWeekItem` | Admin or Employee | planning; `moveWeekItem` optimistic |
| catalog CRUD (`color`, `printType`, `supplyType`, `taskCategory`) | **Admin only** | `requireAdmin()`; unique-name guard |
| user CRUD (`inviteUser`, `setUserRole`) | **Admin only** | wraps Supabase Admin API |

Zod schemas live in `lib/validation/` and double as form types. Errors are
returned as typed, user-safe results — never raw stack traces.

## 6. Auth, Storage & security

- **Supabase Auth via `@supabase/ssr`**, two clients: `createBrowserClient`
  (Client Components) and `createServerClient` (Server Components / actions).
  **Clients are created per request, never at module scope** — on Vercel Fluid
  compute a module-scope client can leak one user's session into another's. This
  is a hard security rule, not style.
- **Session refresh in `middleware.ts`** (Server Components can't write cookies).
- **Authorize with `supabase.auth.getUser()`** (validates the token against the
  auth server) — never trust an unverified cookie session for authz decisions.
- **Prisma bypasses RLS** (elevated DB creds), so **server-layer authorization is
  the real guard** for every Prisma read/write (`lib/auth.ts` helpers:
  `requireUser`, `requireAdmin`). **RLS is still enabled on every table** as
  defense-in-depth, added via version-controlled SQL migrations.
- **Role matrix:**

  | Capability | Admin | Employee |
  |---|---|---|
  | Manage users | ✅ | ❌ |
  | Manage catalogs (colors, types, categories) | ✅ | ❌ |
  | Tasks: create/update/move/subtasks | ✅ | ✅ |
  | Expenses: create/edit | ✅ | ✅ |
  | Expenses: delete | ✅ | ❌ |
  | Inventory: create/edit | ✅ | ✅ |
  | Inventory: delete | ✅ | ❌ |
  | View inventory & planning | ✅ | ✅ |
  | Weekly planning: edit | ✅ | ✅ |

- **Storage:** bucket `print-photos` (private). Upload via server action after
  authz; reads use **signed URLs** generated server-side. Bucket access policies
  are defined in SQL alongside the bucket.
- **Secrets:** only `NEXT_PUBLIC_*` reach the browser; the Supabase secret key and
  DB URLs are server-only. Keys documented in `.env.example`, never committed.

## 7. Drag & drop design (dnd-kit)

Two surfaces, same pattern.

- **Kanban board (`04_task_board_dnd`):** `DndContext` with **PointerSensor +
  KeyboardSensor** and `DragOverlay`; columns are droppables (the 6 `TaskState`s),
  cards are `useSortable`. `verticalListSortingStrategy` within a column.
- **Week planner day assignment (`07_weekly_planning`):** optional dnd to move a
  print between days; **fallback is a day `<Select>`** so the feature is usable
  without drag. Same sensors/a11y.
- **Ordering:** integer `position` ranks. On drop, recompute the affected
  column's positions and persist via the server action. To avoid float drift we
  **normalize positions on write** (renumber the touched column 0..n).
- **Optimistic + rollback:** update local state on drop immediately; call the
  server action; **if it fails, roll back to the pre-drag snapshot** and surface a
  toast. The action is idempotent (re-running yields the same final order).
- **Accessibility:** keyboard drag (space to pick up, arrows to move, space to
  drop) and `DndContext` ARIA announcements are acceptance criteria, not extras.

## 8. Environment & deployment

`.env.example` (all real values in gitignored `.env.local`):

```
DATABASE_URL=            # pooled, pgBouncer port 6543 — app runtime
DIRECT_URL=              # direct, port 5432 — prisma migrate
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_… (browser-safe)
SUPABASE_SECRET_KEY=     # sb_secret_… — server-only, bypasses RLS
```

- **Vercel** hosts the app; env vars set **per environment** (Preview vs
  Production). Every PR gets a **preview deploy** for smoke validation.
- **Migrations** run against **dev/staging** only during development; production
  migration is a deliberate release step, never an ad-hoc dashboard edit.
- One Supabase project = dev/staging for all development and verification.

## 9. Feature breakdown & sequencing

Foundation-first, each independently implementable given only its `depends_on`
(per `docs/specs.md` + the slicing guide). All `sdd: true`.

| # | Feature | Summary | depends_on |
|---|---|---|---|
| 0 | `00_project_setup` | Bootstrap Next.js/TS, pnpm, Tailwind+shadcn, Prisma↔Supabase, `@supabase/ssr` + middleware, dnd-kit, Vitest+Playwright, lint, `.env.example`, Vercel. | — |
| 1 | `01_auth_and_user_management` | `User`/`Role` model + RLS, auth (login, middleware, route guard, `lib/auth.ts`), admin user CRUD. | 00 |
| 2 | `02_catalog_management` | `Color`(+hex), `PrintType`, `SupplyType`, `TaskCategory` models + RLS + seed (6 colors, initial categories/types) + admin CRUD UI. | 01 |
| 3 | `03_task_board_core` | `Task`/`Subtask` + RLS, CRUD server actions, static Kanban render, filters (owner/category/state), subtask check-off. | 02 |
| 4 | `04_task_board_dnd` | dnd-kit move-between-columns + reorder, `position` persistence, optimistic + rollback, keyboard a11y. | 03 |
| 5 | `05_expense_tracking` | `Expense` + RLS, CRUD server actions, list + create/edit form. | 02 |
| 6 | `06_print_inventory` | `Print` + `PrintColor` M2M + RLS, Storage bucket + policies, CRUD with photo upload, search/filter. | 02 |
| 7 | `07_weekly_planning` | `WeekPlan`/`WeekPlanColor`/`WeekPlanItem` + RLS, color-match service (full + partial w/ missing), color picker, filtered inventory, day assignment, dry-day indicator. | 06 |

Written to `feature_list.json` with these `depends_on` and `status: "spec_ready"`.

## 10. Risks & open items

| # | Risk / item | Decision |
|---|---|---|
| 1 | Exact Employee permissions (brief §7.1) | **Resolved:** operational default (role matrix §6); re-confirm at `01` approval. |
| 2 | Print time/grams free-text vs structured (brief §7.2) | **Resolved:** structured `Int` (minutes, grams). |
| 3 | Money representation | `Decimal(10,2)`, single currency assumed (no multi-currency in MVP). |
| 4 | Concurrent week edits | One `WeekPlan` per `weekStartDate` (unique). ≤5 users → low contention; last-write-wins acceptable for MVP. |
| 5 | "Dry the day before" storage | **Derived** (print colors + day−1), not stored; revisit only if it must be overridable. |
| 6 | Storage read access | Private bucket + **signed URLs**; decide TTL in `06`. |
| 7 | Catalog rows in use | `onDelete: Restrict`; UI blocks deleting a catalog value referenced by a record (offer rename instead). |
| 8 | Future quotes/reports/stock (brief §6) | Out of scope; data model kept extensible (structured `date`/`supplyType`, no destructive coupling). |

## 11. Verification strategy

- **Vitest (unit):** color-match service (full match, partial match + missing
  colors, empty selections), Zod schemas, `lib/auth.ts` authorization helpers,
  `position` re-rank logic.
- **Component tests (RTL):** Kanban reorder optimistic update **and rollback**,
  task filters, planner color filter toggle (full/partial), catalog delete-guard.
- **Playwright (E2E):** login → land on board; create task → move across columns
  (incl. keyboard drag); record an expense; add a print with a photo; plan a week
  (pick colors → filtered inventory → assign to days).
- **RLS denial test:** a request without/with the wrong identity cannot read or
  write another scope's rows (per `docs/specs.md` traceability contract).
- **Per feature:** `tasks.md` states a coverage / "what proves done" target; every
  `R<n>` traces to ≥1 test. `init.sh` (typecheck, lint, test, build) green and a
  successful Vercel preview deploy before any feature is `done`.
