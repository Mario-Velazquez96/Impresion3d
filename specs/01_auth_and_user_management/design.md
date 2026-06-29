# Design — 01_auth_and_user_management

**Source:** `solution_design.md` §6 (auth/security, role matrix), §9; `client_requirement.md` §3

## Approach

Two layers in one feature because they ship together: (a) schema/RLS for `User`,
(b) the auth flow + server-layer authz helpers + admin UI that depend on it.
Authorization is enforced in the server layer (Prisma bypasses RLS); RLS on
`User` is defense-in-depth and the real guard for any Supabase-client reads.

## Schema & RLS

```prisma
enum Role { ADMIN EMPLOYEE }
model User {
  id        String   @id            // = auth.users.id
  email     String   @unique
  name      String
  role      Role     @default(EMPLOYEE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Migration: `prisma migrate dev --name user_and_role`. RLS SQL migration (raw SQL,
version-controlled) on `public."User"`:

- `ENABLE ROW LEVEL SECURITY`.
- `SELECT`: `auth.uid() = id` OR caller is admin
  (`exists(select 1 from "User" u where u.id = auth.uid() and u.role = 'ADMIN')`).
- `UPDATE` of role: admin-only via the same predicate.
- No client `INSERT`/`DELETE` (rows are created server-side via the secret key).

## File layout & boundaries

```
app/
  (auth)/login/page.tsx        # Client island: form → browser client signInWithPassword
  (app)/layout.tsx             # Server: requireUser() or redirect('/login') + nav
  admin/
    layout.tsx                 # Server: requireAdmin() or 403
    users/page.tsx             # Server: list users → <UsersTable> (Client) + invite dialog
lib/
  auth.ts                      # getCurrentUser / requireUser / requireAdmin
  services/users.ts            # listUsers, ensureUserRow, inviteUser, setUserRole (Prisma + Admin API)
  validation/user.ts          # loginSchema, inviteUserSchema, setRoleSchema
actions/users.ts               # "use server": inviteUser, setUserRole, signOut
```

- `lib/auth.ts.getCurrentUser()`: server Supabase `getUser()` → load `User` row
  (calling `ensureUserRow` to create on first login, R6). `requireAdmin()` builds
  on it.
- First-user-is-admin (R6): in `ensureUserRow`, if `User` count is 0, set `ADMIN`.

## Invite flow (admin-set temporary password)

Invite delivery is by **admin-entered temporary password**, not the Supabase
invite email. We chose admin-entered over a system-generated secret because it
keeps the flow simpler and avoids ever rendering a generated secret in the UI;
the admin types a temporary password directly into the invite form and shares it
out-of-band.

`inviteUser` (server action → `services/users.ts`):

1. `requireAdmin()` (R9).
2. Validate input with `inviteUserSchema` (email, name, role, temporary
   password) — reject before any external call if the password is too short
   (R8a).
3. Build a Supabase **admin** client with the **secret key** (server-only) and
   call `admin.createUser({ email, password: tempPassword, email_confirm: true,
   user_metadata: { name } })`. `email_confirm: true` lets the invited user sign
   in immediately with the temporary password (R8).
4. Insert the matching `User` row (`id` = the returned auth user id, `email`,
   `name`, `role`) via Prisma.
5. `revalidatePath('/admin/users')`.

Prompting/forcing a password change after first login is explicitly **out of
scope** for this feature (future item).

## Auth & security

- Per-request Supabase clients (no module scope). `getUser()` (not `getSession()`)
  for authz. Secret key only in `services/users.ts` server path.
- Route protection: `(app)/layout.tsx` calls `requireUser()`; `admin/layout.tsx`
  calls `requireAdmin()`. Middleware keeps the session fresh.
- All user-management actions call `requireAdmin()` first (R9).

### Role matrix (resolved)

Confirmed at the approval gate. There are exactly two roles:

- **EMPLOYEE** — an authenticated app user with no admin privileges. Employees
  can reach the `(app)` group (e.g. `/board`) but not `/admin/*`. This feature
  grants Employees no write capabilities beyond their own session; later features
  define their operational permissions, which by default require only
  `requireUser()`.
- **ADMIN** — everything an Employee can do, plus user management (invite users,
  change roles) and any future admin-gated surface.

The only admin-gated capability introduced in this feature is **user
management**; all other authenticated surfaces gate on `requireUser()`. This
default shapes `requireAdmin()` call sites in later features: gate on
`requireAdmin()` only for admin-exclusive actions, otherwise `requireUser()`.

## Validation

- `loginSchema` { email: email, password: min 6 }.
- `inviteUserSchema` { email: email, name: min 1, role: enum, tempPassword:
  min 6 } — `tempPassword` reuses `loginSchema`'s min-6 rule so an invited user's
  temporary password always satisfies the login rule (R8a).
- `setRoleSchema` { userId: cuid/uuid, role: enum }.

## Test approach

- **Vitest:** `requireUser`/`requireAdmin` (authorized vs rejected), `ensureUserRow`
  first-user-admin logic, Zod schemas — including `inviteUserSchema` accepting a
  valid temp password and rejecting one shorter than 6 chars (R8a).
- **Component:** login form error state (R5); UsersTable role change calls action;
  invite dialog includes a temporary-password field.
- **E2E (Playwright):** signed-out `/board` → `/login` (R3); login → `/board` (R4);
  admin invites a user by setting a temporary password, then the invited user
  signs in with that temporary password (R8); admin changes a role (R10);
  employee blocked from `/admin/users` (R9).
- **RLS denial test:** an Employee identity cannot select another user's row or
  update a role (R2).
- Coverage target: auth helpers + services 100% of branches; the core E2E
  flows green.

## Open items / discrepancies

- None. Invite delivery (admin-set temporary password) and the Employee
  permission default (above) were resolved at the approval gate.
