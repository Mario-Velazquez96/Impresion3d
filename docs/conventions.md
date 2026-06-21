# docs/conventions.md — Style, naming, structure

Read before writing any code.

## Project structure

```
app/                 App Router routes (route groups, layouts, pages, loading/error)
  api/<name>/route.ts  Route handlers (REST-ish endpoints)
components/          Reusable components
  ui/               shadcn/ui primitives (generated via `pnpm dlx shadcn@latest add`)
lib/
  db.ts             Prisma client singleton (server-only)
  supabase/server.ts, supabase/client.ts   @supabase/ssr clients
  services/         Business logic modules
  validation/       Zod schemas
  utils.ts          `cn()` and small helpers
prisma/schema.prisma + migrations/
e2e/                Playwright specs
```

`package.json`, `tsconfig.json`, and `prisma/schema.prisma` are authoritative —
never bypass them.

## TypeScript

- **`strict` is on.** No `any`; prefer `unknown` + narrowing. No non-null `!`
  unless provably safe with a comment.
- Use **path aliases** (`@/lib/...`, `@/components/...`) per `tsconfig.json`.
- Co-locate types near usage; share cross-cutting types in `lib/types.ts`.
- Infer DB types from Prisma (`Prisma.<Model>GetPayload<...>`) rather than
  redeclaring shapes.

## React / Next.js (App Router)

- **Server Components by default.** Add `"use client"` only when you need state,
  effects, refs, browser APIs, or event handlers (dnd-kit components are client).
- **Mutations via Server Actions** (`"use server"`) or route handlers. Each one:
  (1) resolves the auth user, (2) `zod.parse`es input, (3) authorizes, (4) calls
  a service, (5) `revalidatePath`/`revalidateTag` as needed.
- **Naming:** component files `PascalCase.tsx` (e.g. `BoardColumn.tsx`); route
  segment folders lowercase/kebab (`app/board/[boardId]/page.tsx`); non-component
  modules `kebab-case.ts`. Hooks `useThing`.
- Keep `page.tsx`/`layout.tsx` thin — delegate to components and services.
- Use `loading.tsx` + `<Suspense>` for async UI; `error.tsx` for error boundaries.

## Styling — Tailwind + shadcn/ui

- **Utility-first Tailwind.** No inline `style={}` except for truly dynamic
  values. Compose conditional classes with the `cn()` helper.
- shadcn/ui components live in `components/ui/` and are **generated** — prefer
  re-generating or wrapping over hand-editing; if you must edit, note why.
- No magic colors/spacing — use Tailwind tokens / the theme config.

## Prisma & data

- Models `PascalCase` singular; fields `camelCase`. Map to snake_case DB columns
  with `@map`/`@@map` if the team prefers snake_case in Postgres.
- **Every schema change = a migration** (`pnpm prisma migrate dev --name <change>`).
  Never edit the DB by hand. Commit the generated SQL.
- Import the Prisma client only from `lib/db.ts` (singleton) and only in
  server-only code. Never in a `"use client"` module.
- No N+1: use `include`/`select` and batch; no queries inside render loops.

## dnd-kit

- Use `DndContext` with appropriate sensors; **always include `KeyboardSensor`**
  and accessible announcements for a11y.
- Keep drag state in the client component; persist order via a Server Action
  that writes an explicit `position`/`order` field (fractional or integer ranks).
- Make reorder writes idempotent and bulk-safe.

## Validation, errors, security

- Zod-validate all action/route-handler input; return typed, user-safe errors.
- Never expose stack traces or secrets to the client. Log server-side.
- Only `NEXT_PUBLIC_*` vars are client-visible; everything else is server-only.

## Hygiene

- No leftover `console.log`/debug code in committed work.
- Run Prettier/ESLint; `pnpm lint` and `pnpm typecheck` clean before handoff.
- Never introduce a model, table, env var, or dependency not described in an
  approved spec.
