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
- `inviteUser` uses a Supabase **admin** client built with the **secret key**
  (server-only) to create the auth user, then inserts the `User` row.

## Auth & security

- Per-request Supabase clients (no module scope). `getUser()` (not `getSession()`)
  for authz. Secret key only in `services/users.ts` server path.
- Route protection: `(app)/layout.tsx` calls `requireUser()`; `admin/layout.tsx`
  calls `requireAdmin()`. Middleware keeps the session fresh.
- All user-management actions call `requireAdmin()` first (R9).

## Validation

- `loginSchema` { email: email, password: min 6 }.
- `inviteUserSchema` { email: email, name: min 1, role: enum }.
- `setRoleSchema` { userId: cuid/uuid, role: enum }.

## Test approach

- **Vitest:** `requireUser`/`requireAdmin` (authorized vs rejected), `ensureUserRow`
  first-user-admin logic, Zod schemas.
- **Component:** login form error state (R5); UsersTable role change calls action.
- **E2E (Playwright):** signed-out `/board` → `/login` (R3); login → `/board` (R4);
  admin invites a user and changes a role (R8, R10); employee blocked from
  `/admin/users` (R9).
- **RLS denial test:** an Employee identity cannot select another user's row or
  update a role (R2).
- Coverage target: auth helpers + services 100% of branches; the four core E2E
  flows green.

## Open items / discrepancies

- Invite delivery method (Supabase invite email vs temp password) — default invite
  email; confirm at the gate.
