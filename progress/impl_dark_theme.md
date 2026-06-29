# Implementation: Activate Default Dark Theme

## Change made
Single edit in `app/layout.tsx`:

- Added `className="dark"` and `style={{ colorScheme: "dark" }}` to the `<html>`
  element so the existing `.dark` CSS variables (defined in `app/globals.css`)
  apply globally, and native form controls / scrollbars render dark.
- `lang="en"` preserved.
- `<body className={inter.className}>` and the `Inter` font import left unchanged
  (body still applies `bg-background text-foreground` via globals.css).

```tsx
<html lang="en" className="dark" style={{ colorScheme: "dark" }}>
```

No palette values in `globals.css` were touched, no components were restyled, no
theme toggle or new dependency was added.

## Hardcoded-color fixes
None needed. A repo-wide grep for `bg-white`, `text-black`, `bg-gray-50`,
`bg-gray-100`, `bg-slate-50`, `text-gray-900` across `**/*.{tsx,ts,jsx,js}`
returned zero matches. All components already use semantic theme tokens.

## Verification (credential-free; build intentionally skipped)
- `corepack pnpm typecheck` — PASS (tsc --noEmit, no errors).
- `corepack pnpm lint` — PASS (no errors; only 4 pre-existing
  `@typescript-eslint/no-unused-vars` warnings in
  `components/planning/__tests__/WeekPlanner.test.tsx`, unrelated to this change).
- `corepack pnpm test` — PASS: 43 test files, 427 tests passed.

No layout test exists, so none needed updating.
