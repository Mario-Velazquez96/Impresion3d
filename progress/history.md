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

---

## 07_weekly_planning — AMENDMENT (2026-06-23): picker sources full Color catalog

**Change:** Product-owner decision during live staging testing — the Planning page's "colors to dry this week" picker now lists ALL catalog colors (`db.color.findMany`, name asc), not only colors used by existing prints. Spec updated by spec_author; implemented and reviewer-APPROVED.

**Scope:** One app-code file — `app/(app)/planning/page.tsx` (load full catalog for the picker; removed the colors-used-by-prints derivation). Match core (`lib/planning-core.ts`), `setWeekColors` atomic replace, grid, and drying panel UNCHANGED. `components/planning/__tests__/WeekPlanner.test.tsx` strengthened to assert the picker lists all catalog colors incl. one unused by any print.

**Verification:** typecheck/lint green; Vitest 424 tests/42 files; `lib/planning-core.ts` still 100% branch; build OK. Reviewer independently reproduced.

**Reports:** `progress/impl_07_picker_all_colors.md`, `progress/review_07_picker_all_colors.md`.

---

## 08_task_priority — DONE (2026-06-28)

**Feature:** Task priority (LOW/MEDIUM/HIGH, default MEDIUM). New feature requested during live staging testing; spec authored by spec_author, product decisions gathered from the human (3 levels; colored badge + board priority filter; NO within-column auto-sort), implemented and reviewer-APPROVED.

**Delivered:** `Priority` enum + `Task.priority @default(MEDIUM)` + `@@index([priority])`; migration `20260628120000_task_priority` (CREATE TYPE + add column NOT NULL DEFAULT 'MEDIUM' backfilling existing rows + index) — APPLIED to staging via `prisma migrate deploy`; `prioritySchema` + `priority` on create/update + filter schemas (invalid rejected, absent→MEDIUM); `buildTaskWhere`/`listTasks`/`createTask`/`updateTask` carry priority (single query, ordering unchanged — no priority sort); `actions/tasks.ts` passes priority through; board page parses `?priority=`; `TaskFilters` priority dropdown (URL param, AND-composes with owner/category/state, clearable); `TaskFormDialog` priority select (default Medium / prefilled on edit); `TaskCard` labelled colored badge (HIGH destructive, MEDIUM amber, LOW muted — dark-theme, not color-only). No new deps/routes/env.

**Requirements:** R1–R7 all satisfied and traced to tests.

**Verification:** Credential-free pipeline green — typecheck 0 errors, lint 0, Vitest 450 tests/43 files (services 100%, validation ~99%). Build intentionally skipped during dev (running dev server shares `.next`); a real build runs on deploy. Reviewer independently reproduced typecheck/lint/test.

**Reports:** `progress/impl_08_task_priority.md`, `progress/review_08_task_priority.md`.

---

## 09_price_calculator — DONE (2026-07-16)

**Feature:** Stateless print price calculator. Requested during live use; product decisions gathered from the human (prefill-from-print OR manual; filament priced per kilogram; cost only — no margin). spec_author → implement → reviewer-APPROVED.

**Delivered:** `lib/pricing-core.ts` — a PURE, client-and-server-safe core (`powerCost = rate × minutes/60`; row `cost = grams × pricePerKg/1000`; filamentTotal = sum; total = power + filament; `sanitizeAmount` clamps blank/non-finite/negative → 0, never NaN; `roundMoney` rounds once at the display edge) at **100% branch coverage**; `/calculator` Server Component in the `(app)` group (requireUser, not admin-gated) doing READ-only reference queries (Color catalog + prints) in one Promise.all; `PriceCalculator` + `FilamentRow` client islands deriving the breakdown live during render (no action/fetch/effect); optional "load from a print" prefill (fills printTimeMinutes, one row per color with grams BLANK, surfaces the print's TOTAL filamentGrams as a hint — no invented per-color split) with full manual entry supported; add/remove rows with stable keys; color swatches (reuses `components/planning/Swatch.tsx`); breakdown + total via `formatCurrency` (MXN); `Calculator` link added to the shared MainNav OUTSIDE the admin block (visible to all authenticated users).

**No-persistence contract (the defining constraint) — independently verified:** no model/field/enum/migration/RLS; no server action or `"use server"`; no API route; no env var; no new dependency; no localStorage/cookie/URL state. Only READ queries.

**Requirements:** R1–R11 all satisfied and traced to tests.

**Verification:** typecheck 0 errors, lint clean, Vitest **500 tests / 45 files**, `lib/pricing-core.ts` **100% statements/branch/functions/lines** (spec's hard target met), worked example verified exactly ($2.50/h × 90min + 30g@$450/kg + 20g@$500/kg = $27.25). Build intentionally skipped during dev (running dev server shares `.next`); validated by the real build on deploy. Reviewer independently reproduced.

**Reports:** `progress/impl_09_price_calculator.md`, `progress/review_09_price_calculator.md`.

---

## 10_sales_and_balance — DONE (2026-07-16)

**Feature:** Sales ledger + withdrawals + a DERIVED account balance on `/finances`. spec_author → implement → reviewer-APPROVED. Gate decisions: expenses deliberately EXCLUDED from the balance; parallel print-reference registry approved instead of widening `CatalogKey`.

**Delivered:** `Sale` (`amount Decimal(10,2)`, date, required `printId` FK `onDelete: Restrict`, optional buyer + notes) + `Withdrawal` (`amount Decimal(10,2)`, date, required reason, `recordedById` → User Restrict) models + `Print.sales` / `User.withdrawals` back-relations; migrations `20260716120000_sales_and_withdrawals` + `20260716120100_sales_and_withdrawals_rls` (RLS **ENABLE + FORCE** with four `TO authenticated` policies on both tables) — **both APPLIED to staging** (`prisma migrate status` → "Database schema is up to date", 16 migrations); `lib/finances-core.ts` — the PURE core (**zero imports**) doing integer-cent arithmetic (`toCents`/`fromCents`/`sumAmountCents`/`sanitizeAmountCents`/`computeBalance`) at **100% branch coverage**; `lib/services/finances.ts` (`server-only`, two `_sum` aggregates in one `Promise.all` per read, date-desc lists with relations in one query, registers a print reference counter); `lib/services/print-references.ts` — the approved **parallel** registry mirroring the 02 catalog hook, plus an additive `isPrintInUse` pre-check + P2003 backstop in `actions/prints.ts` (`CatalogKey`, `schemaForCatalog`, `delegateFor` and the Admin catalogs UI untouched); `lib/validation/finance.ts`; `actions/sales.ts` + `actions/withdrawals.ts`; Server-Component `/finances` page + `BalanceCard` + client islands SalesTable/WithdrawalsTable/SaleFormDialog/WithdrawalFormDialog/DeleteSaleButton/DeleteWithdrawalButton; `Finances` nav link outside the admin block. No new deps/env vars.

**The three invariants:** (1) **Balance is DERIVED, never stored** — no balance/total/cache column exists in the schema or either migration; re-derived from `sum(sales) − sum(withdrawals)` on every read. (2) **Expenses are DELIBERATELY excluded** — a documented product decision, not a bug: the service never references `db.expense` (asserted by a test that fails if `aggregate`/`findMany`/`count` is touched), restated in the schema comment, the migration header, the service/core headers, and rendered on the page as "Sales minus withdrawals — does not include expenses". (3) **No JS float in the money path** — `Decimal(10,2)` → Postgres `_sum` → `.toString()` → integer cents → `formatCurrency` once at the display edge; proved by a service test whose Decimal stub throws from `toNumber()`.

**Authorization:** any authenticated user records a sale (`requireUser`); **ADMIN-only** for sale deletes and for recording AND deleting withdrawals (`requireAdmin` first, before Zod — "rejects BEFORE validation" asserted). `Withdrawal.recordedById` is **server-assigned** from `requireAdmin()`'s actor and absent from the schema — a `recordedById` planted in the FormData is provably ignored (client cannot spoof it).

**Requirements:** R1–R17 all satisfied and traced to tests.

**Verification:** typecheck 0 errors, lint 0 errors (4 pre-existing unrelated warnings), Vitest **57 test files / 761 tests**, 0 failures; `lib/finances-core.ts` **100% statements/branch/functions/lines** (spec's hard target met), services + validation 100%, `components/finances/` 96.33% lines. Worked example verified exactly (sales 1350.25 − withdrawals 850.25 = **500.00**; the $2,000 expense changes nothing). Build intentionally skipped during dev (running dev server shares `.next`); the Vercel preview is the build target. Reviewer independently reproduced.

**Outstanding (credential-gated, dev/staging only — never production):** run Playwright E2E (`e2e/finances.spec.ts`) + RLS-denial (`e2e/finances-rls.spec.ts`) after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_10_sales_and_balance.md`, `progress/review_10_sales_and_balance.md`.

---

## 11_image_prep — DONE (2026-07-17)

**Feature:** Client-side HueForge image prep tool — adjust → posterize (median cut in a Web Worker) → palette cleanup → snap to the Color catalog → download PNG. New feature requested during live use; product decisions gathered (stateless like the calculator; median cut for deterministic flat bands; redmean color distance; Floyd–Steinberg off by default). spec_author → implement → reviewer-APPROVED. Depends on 02 (Color catalog read) + 01 (`requireUser`, the `(app)` guard).

**Delivered:** `lib/image-prep-core.ts` — a PURE, client-and-server-safe core (no DOM/Prisma/React/`server-only`, no new dependency) at **100% branch coverage**: hex↔RGB, RGB→HSL, Rec. 601 luminance, redmean `colorDistance`; brightness→contrast→gamma LUT + saturation + percentile auto-levels + 256-bin histogram; **deterministic median-cut** quantization (longest-axis median split weighted by count, defined tie-breaks, no randomness); `nearestIndex`; flat + **Floyd–Steinberg** mapping; `coveragePercent`/`classifyPalette` (neutrals light→dark, colors by hue); `mergeEntries`/`mergeSimilar`/`mergeTiny`; `snapToCatalog` (nearest catalog hex, same-target dedupe, empty-catalog no-op); `indexedToPixels`; `fitWithin`/`downloadFileName`/`formatByteSize`. A **stateless Web Worker** (`image-prep.worker.ts`, logic-free dispatcher, coverage-excluded per the spec's one authorized vitest edit) + `useImagePrepWorker` hook (lazy worker, Promise-per-id, busy flag, terminate on unmount) + typed `worker-messages` protocol. `/image-prep` Server Component in the `(app)` group (`requireUser`, **not** admin-gated) doing ONE read-only `db.color.findMany`; the `ImagePrep` client island owning a `Stage` union (`empty → loaded → adjusted → quantized`) so upstream changes structurally discard downstream results (R16); panels ImageDropzone/AdjustPanel/HistogramChart (SVG)/PosterizePanel/PalettePanel/BeforeAfterPreview; DOM decode glue (`decode.ts`: white-flatten + fitWithin downscale). `Image prep` link added to the shared MainNav OUTSIDE the admin block (visible to all authenticated users).

**No-persistence contract (the defining constraint) — independently verified:** no model/field/enum/migration/RLS change; no server action or `"use server"`; no API route; no Supabase Storage read/write; no env var; no new dependency; no localStorage/cookie/URL state. `prisma/schema.prisma` and `prisma/migrations/` untouched. The image enters via the dropzone and leaves only via the client-side Download anchor; reload = a fresh, empty tool. Only server interaction is the page's Color-catalog read.

**Requirements:** R1–R19 all satisfied and traced to tests.

**Verification:** typecheck 0 errors, lint 0 errors (fixed the one hook warning; 4 pre-existing unrelated warnings remain), Vitest **847 tests / 61 files** (was 761/57 → +86 tests / +4 files), 0 failures; `lib/image-prep-core.ts` **100% statements/branch/functions/lines** (spec's hard target met); other changed modules ≥ 90% lines. Hand-computed 2×2 Floyd–Steinberg case asserted exactly. Build intentionally skipped during dev (running dev server shares `.next`); the Vercel preview is the build target. Reviewer independently reproduced.

**Deviations (minor, reviewer-accepted):** exported `mapToPalette` in addition to `quantize` (the tasks.md hand-computed FS test against a fixed black/white palette is impossible through median cut alone; `quantize` is now its trivial composition); file validation + decode call live in `ImageDropzone` (single `role="alert"` source, prior state untouched on failure); the two IndexedImage (de)serialize helpers live in `worker-messages.ts` (shared by worker + island to prevent wire-shape drift).

**Outstanding (credential-gated, dev/staging only — never production):** run Playwright E2E (`e2e/image-prep.spec.ts`: signed-out redirect + nav link + upload→apply→posterize→snap→download exercising the REAL worker + canvas decode) after setting `.env.local` + E2E account vars. Fixture `e2e/fixtures/image-prep-sample.png` (64×64 four-block) committed.

**Reports:** `progress/impl_11_image_prep.md`, `progress/review_11_image_prep.md`.

---

## 12_flatten — DONE (2026-07-19)

**Feature:** Region-by-region manual **Flatten** stage for `/image-prep` — hover a mask, W/S to resize, click to collect regions, collapse them to one color; plus whole-image cleanup. Requested during live use with reference screenshots. spec_author → human-approved (all three phases) → implemented and reviewed **phase by phase**, each phase committed and deployed separately: **Phase A** (`9cdc5a9`, flood/brush select + flatten + undo), **Phase B** (`42f75bf`, smooth mode + catch strays + recolor every match), **Phase C** (`383bd7e`, presets + despeckle + zoom/pan/expand). Three reviewer-APPROVED gates. Depends on `11_image_prep`.

**Delivered:** `lib/flatten-core.ts` — a second PURE core (no DOM/Prisma/React, no new dependency) at **100% branch coverage**, sibling to `image-prep-core.ts` rather than an extension of it (justified in design.md): `floodMask` (FIFO 4-connected BFS, fixed neighbor order, seed always included — **iterative, no recursion blowup**), `smoothMask` (gradient-tuned wider matching), `brushMask`, `addStrayIslands` (small + near islands only, bounded by `STRAY_MAX_ISLAND_PX`/`STRAY_MARGIN_PX`), mask algebra (`union`/`subtract`/`contains`/`outline`/`pixelCount`), `maskStats` (count desc, first-row-major-appearance tie-break) driving the suggested fill + runner-ups, `parseHexInput` (never throws), `applyFillToMask`, `recolorExact` (image-wide exact-match swap), `removeSmallRegions` (despeckle/presets — majority border color sampled from the **INPUT** so overlapping recolors never interfere, smallest-area-first, borderless whole-image no-op), and view math (`clampView`/`zoomAt`/`panBy`). New worker actions (`mask`, `flatten`/`fill`/`recolor`/`removeSmall`) on the existing stateless worker — still a logic-free dispatcher. Components `FlattenStartCard` / `FlattenWorkspace` / `FlattenCanvas` / `FlattenControls` / `FlattenFillPanel`, plus `canvas-paint.ts` (the `paint()` helper extracted verbatim from `BeforeAfterPreview`, jsdom guards intact, now shared).

**Stage integration:** a `FlattenStage` joins the existing `Stage` union carrying a **resume snapshot**, so entering/exiting Flatten preserves the palette AND its R20 undo history; the R16 invariant (upstream changes discard downstream results) still holds. Flatten has its **own** undo scope (Z / Ctrl+Z, cap `MAX_FLATTEN_HISTORY` 12) covering every mutation — flatten, recolor, presets, despeckle — plus Reset all back to the stage-entry image and an "N regions flattened" counter.

**Hover responsiveness:** mask previews post to the worker with **one request in flight**; stale responses are discarded and re-issued via seed-identity refresh, so dragging the cursor never floods the worker. Brush masks are computed synchronously (cheap enough).

**Click geometry under zoom/pan (the main correctness risk):** `FlattenCanvas` renders a `translate/scale` transform inside a clipping viewport, and `resolvePixel` reads the base canvas's own `getBoundingClientRect()` — which already reflects the CSS transform — feeding the **existing, already-unit-tested** `mapClickToPixel` from feature 11. So picking stays pixel-accurate at any zoom/pan with no new geometry math. Pinned by a test that genuinely fails if the scale division is dropped.

**No-persistence contract (same as 11) — independently verified:** `prisma/` untouched, no server action, no API route, no Storage code, no env var, no new dependency, no vitest/next/playwright config change; `lib/image-prep-core.ts` diff empty. R28 spot-checked via `git status` at the close-out gate.

**Requirements:** R1–R28 all satisfied and traced to real behavioral tests (final reviewer produced the full R→test map).

**Verification:** typecheck 0 errors, lint 0 errors (the same 4 pre-existing unrelated `WeekPlanner.test.tsx` warnings), Vitest **989 tests / 65 files** (was 847/61 at the end of 11 → +142 tests / +4 files), 0 failures; `lib/flatten-core.ts` **100% statements/branch/functions/lines**; all changed modules ≥ 80% lines (`FlattenCanvas` 95.5%, `FlattenWorkspace` 94.6%, most others 100%). Build intentionally skipped during dev (running dev server shares `.next`); Vercel is the build target. Reviewer independently reproduced at each of the three gates.

**Deviations (minor, reviewer-accepted):** view state (`view`/`expanded`) lives in `FlattenCanvas` rather than `FlattenWorkspace` — zoom/pan need the live DOM viewport box for focal-point zoom and pan clamping, so it is owned where the measurements happen (it still resets on stage entry because the two remount together); Space-to-pan is likewise handled in the canvas (the workspace keyboard map W/S/Enter/Esc/Z is untouched, different keys, no conflict); `clampView` uses the stricter "content covers the viewport" clamp, which satisfies both "cannot be dragged fully out" and "zoom 1 forces origin" from one formula with no special-case branch.

**Known flake (pre-existing, not Phase-C code):** one feature-11 palette test ("reverts the last palette action via Ctrl+Z", already carrying pre-existing `act(...)` warnings) flaked once under full-suite ordering and passed on isolated and repeat full runs.

**Outstanding (credential-gated, dev/staging only — never production):** run Playwright E2E (`e2e/flatten.spec.ts`: enter flatten → flood select → flatten → undo → Despeckle → exit) after setting `.env.local` + E2E account vars.

**Reports:** `progress/impl_12_flatten.md`, `progress/review_12_flatten_phaseA.md`, `progress/review_12_flatten_phaseB.md`, `progress/review_12_flatten_phaseC.md`.

---

## 13_crop — DONE (2026-07-21)

**Feature:** Crop-to-print-size stage for `/image-prep`. Requested after the user described leaving the app to crop in **Canva** so a generated 3:4 image would match an exact physical print size (their example **71.7 × 94 mm**) before HueForge. Feasibility discussed first, then spec_author → human-approved → implement → reviewer-APPROVED. Depends on `11_image_prep` + `12_flatten`.

**The framing that shaped it:** a millimetre target is really two requirements — (1) an exact **aspect ratio**, which needs no DPI, and (2) an absolute pixel size, which would need a px/mm choice. For HueForge only (1) matters, because HueForge maps the image onto the physical footprint and resamples itself. The user chose **option A: ratio-only** — crop to the exact ratio, KEEP maximum available pixels, **no resampling**. Option B (explicit px/mm resampling) is deliberately out of scope.

**Delivered:** `lib/crop-core.ts` — a third PURE core (no DOM/Prisma/React, no new dependency) at **100% branch coverage**: mm→aspect ratio, `clampRectToImage`, ratio-locked move/resize-from-handle, `refitRect`, Fit/Fill/Reset, px/mm computation and the R11 caution/warning grading (**tied to a 0.4 mm nozzle**, so the warning means something physical rather than an arbitrary DPI number), `CROP_PRESETS` + `DEFAULT_PRINT_SIZE` (71.7 × 94 — the user's size), and a `WORKING_CAP_PX` re-export so the panel and the core pin the same 2048 rather than the UI hard-coding it. Components `CropStartCard` / `CropWorkspace` / `CropCanvas` / `CropSizePanel`. **No worker action** — a crop is one buffer slice, so shipping it to the worker would cost more than it saves (justified in design.md).

**Shared canvas view hook (the notable refactor):** the crop and flatten canvases both need pointer→pixel geometry, `paint`, ResizeObserver content measurement, and zoom/pan, so that logic was extracted into `components/image-prep/use-canvas-view.ts` and both canvases now use it. This touched **working, shipped** flatten code, so it was gated explicitly: the extraction is **verbatim**, and `components/image-prep/__tests__/FlattenWorkspace.test.tsx` + `lib/__tests__/flatten-core.test.ts` are **unmodified** — the reviewer verified empty `git diff`s on both and ran them green (92/92), including the two tall-image pan-bounds regression tests from the bug fixed in `64a482c` and the R24 click-to-pixel-under-zoom tests. Content is still measured untransformed (`offsetWidth`/`offsetHeight` + ResizeObserver) feeding `clampView`, so the fix survives.

**Upstream-commit semantics:** Apply crop builds a **fresh `loaded` stage**, so downstream quantized/flatten results are discarded structurally per the R16 invariant — a crop cannot leave a stale palette or flatten result behind. Cancel/Revert restores from the retained `uploaded` buffer without resurrecting stale state.

**No-persistence contract (same as 11 and 12):** no Prisma/schema/migration/Storage/server-action/API-route/env/dependency change. **Persisted user-defined presets are deliberately OUT of scope** — they would require localStorage or the DB and break this contract; presets are built-in constants only. Making user presets persistent would be a deliberate contract change needing the human, not a bug.

**Requirements:** R1–R22 all satisfied and traced to genuine behavioral tests.

**Verification:** typecheck 0 errors, lint 0 errors, Vitest **1094 tests / 67 files** (was 996/65 → +98 tests / +2 files), 0 failures; `lib/crop-core.ts` **100% branch**; changed modules ≥ 83% lines. Build intentionally skipped during dev (running dev server shares `.next`); Vercel is the build target. Reviewer independently reproduced.

**Decisions/deviations (minor, reviewer-accepted):** `clampRectToImage` on a degenerate image lets **image bounds win over the `MIN_CROP_PX` usability floor** (each side floored at 1px) so the rect is never empty nor out of bounds; `refitRect` clamps the SIZE first and then centres (sizing after positioning let the clamp drift the centre — pinned by a regression test); `moveRect` reads the ratio off the rect so a nudge can never drift the size; Reset restores `DEFAULT_PRINT_SIZE` rather than a captured entry size.

**Outstanding (credential-gated, dev/staging only — never production):** run Playwright E2E (`e2e/crop.spec.ts`) after setting `.env.local` + E2E account vars. The E2E backlog now spans 11, 12, and 13 and is the one real gap between "tested" and "verified in a real browser".

**Reports:** `progress/impl_13_crop.md`, `progress/review_13_crop.md`.

---
