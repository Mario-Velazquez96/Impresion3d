# Tasks — 01_auth_and_user_management

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Add `Role` enum + `User` model to `schema.prisma`; `prisma migrate dev --name user_and_role` (R1)
- [ ] Write RLS SQL migration on `"User"` (self-read; admin read-all; admin-only role update; no client insert/delete) (R2)
- [ ] Build `lib/auth.ts`: `getCurrentUser`, `requireUser`, `requireAdmin` on `getUser()` (R3, R7)
- [ ] Implement `services/users.ts.ensureUserRow` with first-user-is-admin logic (R6)
- [ ] Build `(auth)/login/page.tsx` form using the browser client `signInWithPassword` (R4, R5)
- [ ] Guard `(app)/layout.tsx` with `requireUser()` → redirect `/login`; add sign-out action (R3, R4)
- [ ] Guard `admin/layout.tsx` with `requireAdmin()` → 403 (R9)
- [ ] Implement `inviteUser` (Supabase Admin API + secret key, server-only) + `setUserRole` server actions; revalidate (R8, R10)
- [ ] Build `admin/users/page.tsx` + `<UsersTable>` + invite dialog (R8, R10)
- [ ] Add Zod schemas `loginSchema`, `inviteUserSchema`, `setRoleSchema` (R4, R8, R10)
- [ ] Write tests: Vitest (auth helpers, ensureUserRow, schemas); component (login error, role change); E2E (R3/R4/R8/R9/R10) (all R)
- [ ] Write the RLS denial test: Employee cannot read another user's row or update a role (R2)
- [ ] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- E2E: signed-out `/board`→`/login` (R3); login→`/board` (R4); bad creds error (R5); admin invite + role change (R8/R10); employee blocked (R9).
- RLS test asserts denial for non-owner/non-admin reads and role writes (R2).
- Unit: first-user-admin (R6), `requireAdmin` rejects employee (R7/R9).
- Target: auth/service branch coverage 100%; all green via `init.sh`.
