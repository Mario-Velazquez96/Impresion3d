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
