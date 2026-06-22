# Requirements — 01_auth_and_user_management

**Feature:** Authentication, roles, and admin user management
**Source:** `client_requirement.md` §3, §5; `solution_design.md` §6, §9
**Depends on:** 00_project_setup

## Purpose

Establish identity and authorization for the whole portal: a `User` model with an
`ADMIN`/`EMPLOYEE` role synced to Supabase Auth, login + route protection, the
server-layer authorization helpers every later feature reuses, RLS on the `User`
table, and an Admin-only UI to invite users and change roles. The Employee role is
modeled from day one even though both launch users are Admins (brief §3 note).

## In scope

- `User` Prisma model (`id` = Supabase auth UUID, `email`, `name`, `role Role`)
  and the `Role` enum; migration + RLS on the table.
- Keeping `User` in sync with `auth.users` (a row exists for each authenticated
  user; first-ever user is `ADMIN`).
- `app/(auth)/login` email/password sign-in and sign-out.
- `middleware.ts`-backed route protection for the `(app)` group.
- `lib/auth.ts`: `getCurrentUser()`, `requireUser()`, `requireAdmin()`.
- Admin-only user management UI: list users, invite a user (with an admin-entered
  temporary password), change a user's role.

## Out of scope

- Catalog/task/expense/inventory/planning data — later features.
- Password reset / email templates beyond Supabase defaults (future).
- Forcing or prompting the invited user to change the temporary password after
  first login (future).

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall define a `User` model whose `id` equals the
Supabase `auth.users.id`, with `email` (unique), `name`, and `role` of enum `Role`
(`ADMIN` | `EMPLOYEE`, default `EMPLOYEE`).

**R2 (Ubiquitous):** The `User` table shall have RLS enabled: a user may read
their own row; only an `ADMIN` may read all rows or update another user's `role`.

**R3 (State-driven):** While a request to any `(app)` route has no authenticated
Supabase user, the system shall redirect it to `/login`.

**R4 (Event-driven):** When valid credentials are submitted on `/login`, the
system shall establish a session and redirect to `/board`.

**R5 (Unwanted behavior):** If invalid credentials are submitted on `/login`, then
the system shall show an error and establish no session.

**R6 (Event-driven):** When a user authenticates and has no `User` row yet, the
system shall create one; if it is the first user in the system, its `role` shall
be `ADMIN`, otherwise `EMPLOYEE`.

**R7 (Ubiquitous):** `lib/auth.ts` shall expose `requireUser()` (returns the
authenticated `User` or rejects) and `requireAdmin()` (rejects non-admins), built
on `supabase.auth.getUser()`.

**R8 (Event-driven):** When an Admin submits the invite-user form (email, name,
role, and an admin-entered temporary password), the system shall validate it with
`inviteUserSchema`, create the auth user via the Supabase Admin API
(`createUser`, secret key, server-only) with that password set and the email
auto-confirmed (`email_confirm: true`) so the user can sign in immediately with
the temporary password, and then create the matching `User` row. Prompting the
user to change the temporary password after first login is out of scope for this
feature.

**R8a (Unwanted behavior):** If the invite-user form's temporary password is
shorter than 6 characters, then `inviteUserSchema` shall reject the submission and
the system shall create no auth user and no `User` row.

**R9 (Unwanted behavior):** If a non-admin invokes any user-management action
(`inviteUser`, `setUserRole`), then the system shall reject it without a DB write.

**R10 (Event-driven):** When an Admin changes a user's role via `setUserRole`, the
system shall persist the new `role` and revalidate the users page.

## Acceptance

- Visiting `/board` while signed out redirects to `/login`; signing in lands on
  `/board`; sign-out clears the session.
- The first authenticated user is `ADMIN`; subsequent ones default `EMPLOYEE`.
- An Admin can invite a user by supplying a temporary password; the invited user
  can sign in immediately with that password. An Admin can change a role; an
  Employee cannot reach `/admin/users` and the actions reject for non-admins.
- A temporary password shorter than 6 characters is rejected with no auth user or
  `User` row created.
- RLS denies an Employee reading another user's row or editing roles.
- Login form is keyboard-operable with labeled fields and an error region.

## Open items

- None. (Invite delivery method and the Employee permission default were resolved
  at the approval gate — see design §6 and the invite flow in design.)
