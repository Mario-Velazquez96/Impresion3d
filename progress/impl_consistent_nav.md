# Impl: Consistent header nav across (app) and admin layouts

## Approach

Shared component (preferred approach). Extracted a single `MainNav` component
rendering the full link set, with a `showAdmin` prop gating the admin-only links
(Users, Catalogs). Both layouts now consume it, so the two navs can no longer
drift apart.

## Files changed

- `components/layout/MainNav.tsx` (new) — Server Component. Renders Tower Layers
  (`/board`, bold brand `text-sm font-semibold`), Inventory (`/inventory`),
  Planning (`/planning`), Expenses (`/expenses`) with
  `text-sm text-muted-foreground hover:text-foreground`, and when `showAdmin` is
  true, Users (`/admin/users`) and Catalogs (`/admin/catalogs`). Classes match
  the originals exactly.
- `app/(app)/layout.tsx` — replaced inline `<nav>` with
  `<MainNav showAdmin={user.role === "ADMIN"} />`; removed now-unused
  `next/link` import. Auth guard (`getCurrentUser()` / redirect to `/login`) and
  the right-side header (email span + Sign out form) are unchanged.
- `app/admin/layout.tsx` — replaced inline `<nav>` with `<MainNav showAdmin />`
  (admin pages are already admin-gated). `requireAdmin()` try/catch with the 403
  UI and `/login` redirect, the `next/link` import (still used by the 403 "Back
  to board" link), header structure, and right-side content are unchanged.
- `components/layout/__tests__/MainNav.test.tsx` (new) — asserts the core links
  always render, admin links are hidden when `showAdmin={false}`, and shown
  (with correct hrefs) when `showAdmin` is true.

## Result

Navigating to `/admin/users` or `/admin/catalogs` now shows the same full link
set (Inventory / Planning / Expenses no longer disappear).

## Verification (credential-free; build skipped per instructions — shared `.next`)

- `corepack pnpm typecheck` — passed (tsc --noEmit, no errors).
- `corepack pnpm lint` — passed (no errors; only pre-existing warnings in the
  unrelated `components/planning/__tests__/WeekPlanner.test.tsx`).
- `corepack pnpm test` — 43 test files passed, 427 tests passed (0 failures);
  new `MainNav.test.tsx` (3 tests) green, MainNav.tsx at 100% coverage.
