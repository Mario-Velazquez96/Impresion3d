# Impl: Catalogs nav link

## Change
In `app/(app)/layout.tsx`, added a "Catalogs" link to the main authenticated
nav, shown only for admins. The existing admin-only block wrapped a single
`Users` Link; it now wraps both `Users` and the new `Catalogs` link inside a
React fragment under the same `user.role === "ADMIN"` condition, keeping them
grouped. Catalogs is placed immediately after Users.

New link:

```tsx
<Link
  href="/admin/catalogs"
  className="text-sm text-muted-foreground hover:text-foreground"
>
  Catalogs
</Link>
```

- `href="/admin/catalogs"`, label "Catalogs".
- Exact same `className` as the existing Users link.
- Auth guard (`getCurrentUser()` / `redirect("/login")`) and all other links
  untouched. No new dependencies.

## Tests
No layout test existed for `app/(app)/layout.tsx` (searched `__tests__`,
`*layout*test*`, and `AppLayout`/`(app)/layout` references — the only hits for
`/admin/users` were in `actions/__tests__/users.test.ts`, which test
`revalidatePath`, not the layout). Per instructions, no new layout test harness
was created for this static-link change.

## Pipeline (credential-free, corepack pnpm)
- typecheck: green (tsc --noEmit, no errors)
- lint: green (only pre-existing warnings in WeekPlanner.test.tsx, unrelated)
- test: green — 42 test files, 424 tests passed
- build: green — `/admin/catalogs` route present in output

A dev server is running and hot-reloaded; no impact.
