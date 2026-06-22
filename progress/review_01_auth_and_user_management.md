# Review - 01_auth_and_user_management

Verdict: APPROVE
Reviewer: reviewer subagent. Date: 2026-06-21
Scope reviewed: schema/RLS, auth helpers, services, server actions, login and
admin UI, tests (Vitest/component/Playwright), pipeline. Read-only; nothing
modified.

Note on gating: no .env.local exists, so live-Supabase stages (apply migrations,
Playwright E2E auth flows, RLS-denial flow, live Admin-API invite) are
credential-gated and legitimately not executed. These are NOT held against the
verdict; their spec FILES were verified to exist and be correct, and the gated
stages are accurately documented with the right human follow-up commands.

## 1. Requirement traceability (R1-R10 + R8a)

R1 (User model: id=auth uuid, email unique, name, role default EMPLOYEE):
schema.prisma + migration 20260621192811_user_and_role; verified byte-equivalent
to prisma migrate diff --from-empty; schema compiles. PASS.

R2 (RLS: self-read, admin-read-all, admin-only role UPDATE, no client
INSERT/DELETE): RLS migration 20260621192812_user_rls reviewed line by line;
e2e/rls.spec.ts (gated) asserts self-read=1, other-read=0, other-update=0. PASS.

R3 (no auth user on app group to /login): auth.test.ts UnauthenticatedError;
(app)/layout.tsx redirect; e2e/auth.spec.ts R3 runs unauthenticated. PASS.

R4 (valid login to /board): LoginForm.test.tsx redirects to /board; auth E2E R4
(gated). PASS.

R5 (invalid creds to error, no session): LoginForm.test.tsx error on invalid
credentials; auth E2E R5 runs unauthenticated. PASS.

R6 (first user ADMIN, else EMPLOYEE): users.test.ts first-user-admin,
subsequent-employee, idempotent, name-fallback. PASS.

R7 (requireUser/requireAdmin on getUser): auth.test.ts authorized + rejected;
source uses supabase.auth.getUser. PASS.

R8 (invite via Admin API createUser, temp pw, email_confirm true, then User
row): users.test.ts createUser-then-row + secret-key + Admin-API-error;
actions/users.test.ts invite happy path; InviteUserDialog.test.tsx temp-pw
field + submit; auth E2E invite + immediate-signin (gated). PASS.

R8a (temp pw < 6 chars rejected, no auth user / no row): user.test.ts valid +
too-short; actions/users.test.ts too-short with no service call. Traces
correctly: inviteUserSchema.tempPassword reuses the shared passwordSchema
(min 6), identical to loginSchema.password, consistent with R8. PASS.

R9 (non-admin user-mgmt action rejected, no DB write): actions/users.test.ts
non-admin rejection (no service call) for invite + setUserRole; auth.test.ts
requireAdmin rejects employee; auth E2E employee blocked (gated). PASS.

R10 (setUserRole persists + revalidates): users.test.ts setUserRole update;
actions/users.test.ts persist+revalidate; UsersTable.test.tsx role change
submits to action; auth E2E role change (gated). PASS.

Every requirement traces to at least one real, behaviour-asserting test.

## 2. Task completeness

All 14 items in tasks.md are checked and genuinely done (spot-checked against
source). No checkbox is checked without a corresponding artifact.

## 3. Security checks (performed)

- Authz in the server layer: requireUser/requireAdmin live in lib/auth.ts
  (server-only) and use supabase.auth.getUser, not getSession. Grep for
  getSession returns only doc references, none in app code. PASS.
- requireAdmin BEFORE any work (R9): both inviteUser and setUserRole call
  requireAdmin as the first statement; on rejection they return before any Zod
  parse / service / DB / Admin-API call. No write on rejection. PASS.
- Per-request Supabase clients: server.ts and client.ts create clients inside
  functions (never module scope); createAdminClient in services/users.ts is
  also per-call. PASS.
- Secret key confinement: SUPABASE_SECRET_KEY is read only in
  lib/services/users.ts (import server-only), never with a NEXT_PUBLIC_ prefix.
  After next build, grepped .next/static: sb_secret / SUPABASE_SECRET_KEY no
  matches; createAdminClient / inviteUserService / setUserRoleService no
  matches; admin.createUser / auth.admin no matches. Secret and server admin
  symbols do not reach any client bundle. PASS.
- RLS recursion check: the admin predicate uses a SECURITY DEFINER STABLE SQL
  function public.is_admin with SET search_path = public, which runs with the
  owner privileges so its SELECT FROM User is NOT itself subject to the User RLS
  SELECT policy, correctly avoiding the infinite-recursion trap. RLS ENABLEd and
  FORCEd; SELECT = auth.uid::text = id OR is_admin; UPDATE = admin-only with both
  USING and WITH CHECK; no INSERT/DELETE policy (default-deny). Matches R2. PASS.
- First-user-is-admin (R6): ensureUserRow returns existing rows unchanged
  (idempotent); else count==0 means ADMIN else EMPLOYEE, with name fallback to
  the email local-part. Five unit cases cover all branches. PASS.
- Migrations and env: schema migration byte-equivalent to migrate diff; RLS
  migration committed alongside; migration_lock.toml provider=postgresql.
  SUPABASE_SECRET_KEY and the optional E2E vars are all in .env.example. prisma
  migrate status is gated and documented with the correct follow-up. PASS.

## 4. Conventions / hygiene

- No any, no @ts-ignore / @ts-expect-error in source. No leftover console.log.
- Server/Client boundary correct: mutations are Server Actions (resolve auth,
  Zod-validate, authorize, call service, revalidate); Prisma only from lib/db.ts
  in server-only code; client components import only the browser client and Zod
  schemas. Only NEXT_PUBLIC_ vars reach the browser (verified by static grep).

## 5. Two design deviations - judgments

(a) Native HTML (dialog/select/table) + local Input/Label instead of shadcn
Radix primitives. ACCEPTABLE. conventions.md treats shadcn primitives as
generated and forbids adding a dependency not in an approved spec; the spec did
not enumerate the radix dialog/select packages, so adding them would be the
scope violation. The native, accessible, Tailwind-styled elements add zero new
deps (package.json unchanged from 00_setup) and stay a11y-correct (labeled
fields, role=alert regions, keyboard operable). Future shadcn adoption is
correctly flagged as a leader-level dependency decision. No action required.

(b) Custom 403 Forbidden UI in admin/layout.tsx instead of Next 15 forbidden().
ACCEPTABLE. forbidden() needs the experimental authInterrupts flag (out of
scope, not approved). The layout redirects unauthenticated users to /login and
renders 403 for authenticated non-admins; the (app) group, the page
requireAdmin, and per-mutation re-checks (R9) provide defense-in-depth.
Behaviour satisfies the requirement. No action required.

## 6. Scope discipline

In scope only: Role enum + User model (no other models/tables); routes /login,
/board (in app group), /admin/users. No catalog/task/expense/inventory/planning
artifacts leaked. No new runtime dependencies. PASS.

## 7. Pipeline (reproduced via corepack pnpm)

- typecheck -> PASS, 0 errors.
- lint -> PASS, 0 warnings/errors.
- test + coverage -> PASS, 62 tests, 9 files.
- build -> PASS; /login static; /board and /admin/users dynamic; middleware
  89.8 kB.
- secret grep on .next/static -> PASS, no secret/server-admin symbols in client.
- prisma migrate diff --from-empty -> PASS, DDL byte-equivalent to migration.

Coverage (changed modules): lib/auth.ts, lib/services/users.ts,
lib/validation/user.ts, UsersTable.tsx all 100 percent; InviteUserDialog.tsx
100 percent lines; LoginForm.tsx 100 percent lines / 90 percent branch (one
optional-chaining fallback). The all-files average (~85 percent lines) is pulled
down only by 00-setup credential-gated wrappers (lib/db.ts, lib/supabase/*,
middleware.ts), outside this feature changed scope. tasks.md target met.

E2E is credential-gated (no .env.local); R3 and R5 run without accounts, the
rest skip until the documented env vars are set.

## Conclusion

APPROVE. All R1-R10 (+R8a) trace to passing tests; tasks complete; server-layer
authz, secret confinement, and non-recursive RLS verified; both design
deviations acceptable under conventions.md; scope clean; credential-free pipeline
green (62 tests). The leader may mark 01_auth_and_user_management as done.

Human follow-up (credential-gated, documented in the impl report): with a
.env.local for the DEV/STAGING Supabase project, run corepack pnpm prisma
migrate dev plus migrate status, then set the E2E account vars and run
corepack pnpm test:e2e. Never target production.
