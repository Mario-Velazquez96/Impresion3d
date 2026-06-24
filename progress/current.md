# Current session

## Feature in progress
(none — all 7 features are `done`)

## State
Project complete: `00`–`07` all reviewer-APPROVED with green credential-free
pipelines (typecheck · lint · Vitest · build), each logged to
`progress/history.md`. The latest full run is 423 tests / 42 files green.

## Outstanding — human follow-up on dev/staging Supabase (never production)
These stages need live credentials and were written but not executed (no
`.env.local` in this environment). With a dev/staging `.env.local`:
1. Apply all migrations incl. RLS + the private `print-photos` Storage bucket:
   `corepack pnpm prisma migrate dev` → `corepack pnpm prisma migrate status`.
2. Seed catalogs: `corepack pnpm prisma db seed`.
3. Run the E2E + RLS suites: `corepack pnpm test:e2e`
   (set `E2E_ADMIN_*` / `E2E_EMPLOYEE_*` accounts first; specs `test.skip`
   without them).
4. Validate a Vercel preview deploy.

## Notes / blockers
- `pnpm` is not on this machine's PATH; use `corepack pnpm`.
- All implementation is committed to the working tree but NOT git-committed
  (awaiting the human's go-ahead).
