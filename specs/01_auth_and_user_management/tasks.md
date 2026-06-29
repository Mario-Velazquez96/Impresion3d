# Tasks — 01_auth_and_user_management

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [x] Add `Role` enum + `User` model to `schema.prisma`; `prisma migrate dev --name user_and_role` (R1)
- [x] Write RLS SQL migration on `"User"` (self-read; admin read-all; admin-only role update; no client insert/delete) (R2)
- [x] Build `lib/auth.ts`: `getCurrentUser`, `requireUser`, `requireAdmin` on `getUser()` (R3, R7)
- [x] Implement `services/users.ts.ensureUserRow` with first-user-is-admin logic (R6)
- [x] Build `(auth)/login/page.tsx` form using the browser client `signInWithPassword` (R4, R5)
- [x] Guard `(app)/layout.tsx` with `requireUser()` → redirect `/login`; add sign-out action (R3, R4)
- [x] Guard `admin/layout.tsx` with `requireAdmin()` → 403 (R9)
- [x] Implement `inviteUser` server action: `requireAdmin()` → `inviteUserSchema` → Supabase Admin API `createUser` (secret key, `email_confirm: true`, password = admin-entered temp password, server-only) → insert `User` row → `revalidatePath` (R8, R8a, R9)
- [x] Implement `setUserRole` server action: `requireAdmin()` → validate → persist → revalidate (R9, R10)
- [x] Build `admin/users/page.tsx` + `<UsersTable>` + invite dialog with a temporary-password field (R8, R10)
- [x] Add Zod schemas `loginSchema`, `inviteUserSchema` (incl. `tempPassword` min 6), `setRoleSchema` (R4, R8, R8a, R10)
- [x] Write tests: Vitest (auth helpers, ensureUserRow, schemas incl. `inviteUserSchema` valid + too-short temp password); component (login error, role change, invite dialog has temp-password field); E2E (R3/R4/R8/R9/R10) (all R)
- [x] Write the RLS denial test: Employee cannot read another user's row or update a role (R2)
- [x] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- E2E: signed-out `/board`→`/login` (R3); login→`/board` (R4); bad creds error (R5); admin invites a user with a temporary password and the invited user signs in with it (R8); admin role change (R10); employee blocked (R9).
- Schema unit: `inviteUserSchema` accepts a valid temp password and rejects one shorter than 6 chars with no auth user / `User` row created (R8a).
- RLS test asserts denial for non-owner/non-admin reads and role writes (R2).
- Unit: first-user-admin (R6), `requireAdmin` rejects employee (R7/R9).
- Target: auth/service branch coverage 100%; all green via `init.sh`.
