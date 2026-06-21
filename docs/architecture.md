# docs/architecture.md — What "a good job" means here

Read before implementing. This is the project's definition of quality.

## Stack & source of truth

- **Next.js (App Router)** + **TypeScript** is the application. The Git
  repository is the single source of truth — never make changes only in a
  hosted dashboard (Supabase, Vercel) that aren't reflected in code/migrations.
- **Supabase (hosted)** provides **Postgres + Auth + Storage**. We use a
  **dev/staging** project for development and verification — never production.
- **Prisma** owns the schema and migrations (`prisma/schema.prisma`).
- **Tailwind + shadcn/ui** for styling/components; **dnd-kit** for drag & drop.
- **Vercel** hosts the app; every PR gets a **preview deploy**.

## Layering (separation of concerns)

```
app/ (routes)         Server Components by default; thin. Compose UI + call the data layer.
  └─ actions / route handlers   Server-only mutations & APIs. Validate input, authorize, call services.
components/           Presentational + interactive (Client) components. No data fetching logic.
  └─ ui/             shadcn/ui generated primitives. Don't hand-edit unless necessary.
lib/
  ├─ db (prisma)     Prisma client singleton. Server-only. Never imported by a Client Component.
  ├─ supabase/       @supabase/ssr clients: server.ts (RSC/actions) + client.ts (browser).
  ├─ services/       Business logic. Pure-ish, testable, framework-agnostic where possible.
  └─ validation/     Zod schemas for every external boundary (forms, actions, route handlers).
prisma/              schema.prisma + migrations + seed.
```

- **No business logic in components.** Components render; services decide.
- **No data access in Client Components.** Fetch in Server Components / actions /
  route handlers and pass data down, or use a typed client wrapper.
- **Server/Client boundary is deliberate.** Default to Server Components. Add
  `"use client"` only for interactivity (state, effects, dnd-kit, event
  handlers). Keep client bundles small.

## Data access & security (read this twice)

- **Two clients, two jobs.** Use the **Supabase client** for auth (sessions,
  sign-in/out) and Storage. Use **Prisma** for typed relational queries and
  migrations.
- **Prisma bypasses Supabase Row Level Security** — it connects with elevated DB
  credentials. Therefore: **authorization is enforced in the server layer**
  (actions/services check the authenticated user and ownership) for every
  Prisma read/write. RLS is still defined on tables as **defense in depth** and
  is the primary guard for any access that goes through the Supabase client.
- **Always start a mutation by resolving the authenticated user** via the
  server Supabase client; reject unauthenticated/unauthorized requests before
  touching the database.
- **Validate at the boundary** with Zod. Never trust client input.
- **Two connection URLs:** `DATABASE_URL` (pooled, pgBouncer port 6543, used at
  runtime) and `DIRECT_URL` (direct, port 5432, used by `prisma migrate`).

## Non-functionals

- **Type safety first.** No `any`. No `// @ts-ignore` without a one-line reason.
  `pnpm typecheck` must be clean.
- **Server Components stay serializable.** Don't pass functions/class instances
  across the server→client boundary; `pnpm build` catches most violations.
- **Accessibility:** interactive UI (especially dnd-kit) must be keyboard- and
  screen-reader-operable. Use dnd-kit's keyboard sensor and ARIA props.
- **Idempotent & bulk-safe data ops.** Re-running a seed/migration or replaying
  an action must not create duplicates; prefer upserts and unique constraints.
- **No secrets in client code.** Only `NEXT_PUBLIC_*` env vars reach the browser.

## What "done" looks like

- All `tasks.md` items complete and checked.
- All requirements `R<n>` traced to passing tests.
- `typecheck`, `lint`, `test`, and `build` all green; coverage target met.
- Data-model changes shipped as Prisma migrations that apply to dev/staging.
- A Vercel preview deploy builds successfully.
- Reviewer has approved (`progress/review_<feature>.md` = APPROVE).

> Adjust the bracketed/project-specific parts once `project-documents/` and the
> `00_project_setup` feature pin down exact folder names (e.g. `src/` vs root).
