# Implementation report — 01_auth_and_user_management

**Feature:** Authentication, roles, and admin user management
**Status:** Implementation complete; credential-free pipeline green. Two stages
are credential-gated (live dev/staging Supabase) and were written but not
executed — see "Credential-gated stages" for the exact human follow-up.
**Implementer:** implementer subagent

---

## Tasks completed (all `[x]` in tasks.md)

1. `Role` enum + `User` model in `prisma/schema.prisma`; migration written.
2. RLS SQL migration on `public."User"`.
3. `lib/auth.ts`: `getCurrentUser`, `requireUser`, `requireAdmin` on `getUser()`.
4. `lib/services/users.ts.ensureUserRow` (first-user-is-admin).
5. `(auth)/login` form via browser client `signInWithPassword`.
6. `(app)/layout.tsx` guarded by `getCurrentUser()` → redirect `/login`; sign-out.
7. `admin/layout.tsx` guarded by `requireAdmin()` → 403 for non-admins.
8. `inviteUser` server action (requireAdmin → Zod → Admin API createUser → User row → revalidate).
9. `setUserRole` server action (requireAdmin → Zod → persist → revalidate).
10. `admin/users/page.tsx` + `<UsersTable>` + invite dialog (temp-password field).
11. Zod schemas `loginSchema`, `inviteUserSchema` (tempPassword min 6), `setRoleSchema`.
12. Tests: Vitest (auth helpers, services/ensureUserRow, schemas, actions),
    component (login error, role change, invite dialog), E2E specs, RLS spec.
13. RLS denial test (employee cannot read another row or update a role).
14. Verified typecheck + lint + test + build; coverage target met on changed modules.

---

## Requirement traceability (R1–R10)

| Req | How satisfied | Test(s) |
| --- | --- | --- |
| **R1** | `Role` enum + `User` model (`id` PK = auth.users.id, `email` unique, `name`, `role` default `EMPLOYEE`) in `prisma/schema.prisma`; migration `20260621192811_user_and_role` (verified identical to `prisma migrate diff` output). | Schema compiles (`prisma generate`); `migrate diff` parity check. Apply is credential-gated. |
| **R2** | RLS migration `20260621192812_user_rls`: `ENABLE`+`FORCE ROW LEVEL SECURITY`; SELECT `auth.uid()=id OR is_admin()`; UPDATE admin-only; no INSERT/DELETE policy (default-deny); `is_admin()` is `SECURITY DEFINER` to avoid recursion. | `e2e/rls.spec.ts` (credential-gated): employee self-read allowed, other-row read = 0 rows, other-row role update = 0 rows. |
| **R3** | `(app)/layout.tsx` calls `getCurrentUser()` and `redirect("/login")` when null; middleware refreshes session. | `lib/__tests__/auth.test.ts` (requireUser throws `UnauthenticatedError`); `e2e/auth.spec.ts` "redirects signed-out access to /board to /login". |
| **R4** | `LoginForm` signs in via browser client then `router.push("/board")`. | `components/auth/__tests__/LoginForm.test.tsx` "redirects to /board on success"; `e2e/auth.spec.ts` "admin signs in and lands on /board" (gated). |
| **R5** | `LoginForm` shows an error region (`role="alert"`) and does not navigate on `signInWithPassword` error. | `LoginForm.test.tsx` "shows an error … on invalid credentials"; `e2e/auth.spec.ts` "shows an error on invalid credentials". |
| **R6** | `ensureUserRow`: if no row, count == 0 → `ADMIN`, else `EMPLOYEE`; idempotent; name fallback to email local-part. | `lib/services/__tests__/users.test.ts` first-user-admin, subsequent-employee, idempotent, name-fallback cases. |
| **R7** | `lib/auth.ts` exposes `requireUser()` / `requireAdmin()` built on `supabase.auth.getUser()`. | `lib/__tests__/auth.test.ts` requireUser/requireAdmin authorized + rejected cases. |
| **R8** | `inviteUser` service: Admin API `createUser({ password: tempPassword, email_confirm: true, user_metadata })` then Prisma `User` insert; action wraps with `requireAdmin` + Zod + `revalidatePath`. | `lib/services/__tests__/users.test.ts` createUser-then-row, secret-key-used, Admin-API-error cases; `actions/__tests__/users.test.ts` invite happy path; `InviteUserDialog.test.tsx` temp-password field + submit; `e2e/auth.spec.ts` invite + immediate sign-in (gated). |
| **R8a** | `inviteUserSchema.tempPassword` reuses the min-6 password rule; rejected before any Admin-API/DB call. | `lib/validation/__tests__/user.test.ts` valid + too-short temp password; `actions/__tests__/users.test.ts` "rejects a too-short temp password with no service call". |
| **R9** | Both actions call `requireAdmin()` first; on `ForbiddenError` they return an error with no service/DB call. Admin pages also gate in the layout + page. | `actions/__tests__/users.test.ts` non-admin rejection (no service call) for invite + setUserRole; `lib/__tests__/auth.test.ts` requireAdmin rejects employee; `e2e/auth.spec.ts` employee blocked from /admin/users (gated). |
| **R10** | `setUserRole` service persists `role` via Prisma `update`; action revalidates `/admin/users`. | `lib/services/__tests__/users.test.ts` setUserRole update; `actions/__tests__/users.test.ts` persist+revalidate; `UsersTable.test.tsx` role change submits to action; `e2e/auth.spec.ts` admin role change (gated). |

---

## Pipeline results (per stage)

Run via `corepack pnpm` (bare `pnpm` not on PATH) and via `./init.sh` (with a
temporary `pnpm`→`corepack pnpm` shim, since `corepack enable` needs admin):

| Stage | Command | Result |
| --- | --- | --- |
| Prisma generate | `corepack pnpm prisma generate` | PASS |
| Typecheck | `corepack pnpm typecheck` | PASS (0 errors) |
| Lint | `corepack pnpm lint` | PASS (0 warnings/errors) |
| Unit/component tests + coverage | `corepack pnpm test` | PASS — 62 tests, 9 files |
| Build | `corepack pnpm build` | PASS (`/login` static; `/board`, `/admin/users` dynamic; middleware bundled) |
| Full pipeline | `./init.sh` (shim) | PASS — "init.sh (full) completed successfully" |

**Coverage on changed modules** (target: auth/service ~100% branches):
- `lib/auth.ts` — 100% stmts / 100% branch / 100% funcs / 100% lines
- `lib/services/users.ts` — 100% / 100% / 100% / 100%
- `lib/validation/user.ts` — 100% / 100% / 100% / 100%
- `components/admin/UsersTable.tsx` — 100% / 100% / 100% / 100%
- `components/admin/InviteUserDialog.tsx` — 100% / 100% / lines 100%
- `components/auth/LoginForm.tsx` — 100% / 90% / lines 100% (uncovered branch:
  the optional-chaining fallback on a Zod issue message, line 33)
- Untested 00-setup wrappers (`lib/db.ts`, `lib/supabase/*`, `middleware.ts`)
  pull the all-files average to ~85% lines / ~94% branch; they require live
  credentials and are out of this feature's changed scope.

**Secret-key safety check:** grepped `.next/static` after build — no
`SUPABASE_SECRET_KEY` / `sb_secret` and no server admin symbols
(`createAdminClient`, `inviteUserService`) in any client bundle. The only
`createUser` token in the client bundle is the Supabase auth-js library's own
method name (the login page imports the browser client); the secret key is read
only in `lib/services/users.ts` (marked `server-only`).

---

## Credential-gated stages (human follow-up required)

No `.env.local` is present, so the following were WRITTEN but NOT executed. To
complete them, copy `.env.example` → `.env.local`, fill the dev/staging Supabase
values, and run (never target production):

1. **Apply the two migrations to dev/staging Supabase**
   ```
   corepack pnpm prisma migrate dev   # applies user_and_role + user_rls
   corepack pnpm prisma migrate status # expect: "Database schema is up to date!"
   ```
   The schema migration was verified byte-equivalent to `prisma migrate diff`;
   the RLS migration is raw SQL committed alongside it.

2. **E2E + RLS flows (Playwright, live project)** — set the test-account vars
   (documented in `.env.example`): `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`,
   `E2E_EMPLOYEE_EMAIL`, `E2E_EMPLOYEE_PASSWORD`. These accounts must exist in
   the dev/staging project with matching app roles. Then:
   ```
   corepack pnpm build       # E2E webServer runs `pnpm start`
   corepack pnpm test:e2e    # or: ./init.sh e2e
   ```
   - `e2e/auth.spec.ts`: R3 + R5 run with no accounts; R4/R8/R9/R10 skip until
     the account vars are set.
   - `e2e/rls.spec.ts`: R2 skips until Supabase URL/anon key + employee/other
     accounts are set.

3. **Live Admin-API invite (R8)** is exercised by the gated `e2e/auth.spec.ts`
   invite test once `SUPABASE_SECRET_KEY` and the admin account are configured.

---

## Files created

- `lib/validation/user.ts` — `roleSchema`, `loginSchema`, `inviteUserSchema` (tempPassword min 6), `setRoleSchema`.
- `lib/services/users.ts` — `listUsers`, `ensureUserRow`, `inviteUser`, `setUserRole`, server-only admin client (secret key).
- `lib/auth.ts` — `getCurrentUser`, `requireUser`, `requireAdmin`, `UnauthenticatedError`, `ForbiddenError`.
- `actions/users.ts` — `"use server"` `inviteUser`, `setUserRole`, `signOut`.
- `components/ui/input.tsx`, `components/ui/label.tsx` — Tailwind-only primitives (no new deps).
- `components/auth/LoginForm.tsx` — client login island.
- `components/admin/InviteUserDialog.tsx` — invite dialog (native `<dialog>`, temp-password field).
- `components/admin/UsersTable.tsx` — users list with inline role editor.
- `app/(auth)/login/page.tsx` — login page.
- `app/(app)/layout.tsx` — authenticated group layout (guard + sign-out).
- `app/(app)/board/page.tsx` — placeholder `/board` landing.
- `app/admin/layout.tsx` — admin guard (403 for non-admins).
- `app/admin/users/page.tsx` — admin user-management page.
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260621192811_user_and_role/migration.sql`
- `prisma/migrations/20260621192812_user_rls/migration.sql`
- Tests: `lib/validation/__tests__/user.test.ts`, `lib/services/__tests__/users.test.ts`,
  `lib/__tests__/auth.test.ts`, `actions/__tests__/users.test.ts`,
  `components/auth/__tests__/LoginForm.test.tsx`,
  `components/admin/__tests__/UsersTable.test.tsx`,
  `components/admin/__tests__/InviteUserDialog.test.tsx`,
  `e2e/auth.spec.ts`, `e2e/rls.spec.ts`.

## Files changed

- `prisma/schema.prisma` — added `Role` enum + `User` model.
- `.env.example` — clarified `SUPABASE_SECRET_KEY` usage; added optional E2E
  test-account vars (Playwright-only, specs skip when unset).
- `specs/01_auth_and_user_management/tasks.md` — all tasks checked `[x]`.

---

## Scope / design notes for the reviewer

- **No new runtime dependencies.** The invite "dialog", role "select", and users
  "table" use native HTML (`<dialog>`, `<select>`, `<table>`) styled with
  Tailwind, plus two local `Input`/`Label` primitives — because adding shadcn
  `dialog`/`select` would pull in `@radix-ui/*` packages not in the approved
  spec. If the team prefers shadcn Radix primitives here, that is a follow-up
  dependency decision for the leader.
- **403 rendering.** `admin/layout.tsx` renders a "403 — Forbidden" UI for
  authenticated non-admins (and redirects unauthenticated users to `/login`).
  Next 15's `forbidden()` helper was avoided because it requires the
  experimental `authInterrupts` config flag, which is out of scope.
- **Per-request clients + `getUser()`** are used everywhere for authz; the secret
  key is confined to `lib/services/users.ts` (`server-only`).
- **Requirements mention `/board`** while tasks reference the `(app)` group;
  resolved by placing `/board` inside `app/(app)/` so the group guard protects
  it and login redirects there.
