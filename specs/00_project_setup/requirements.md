# Requirements — 00_project_setup

**Feature:** Project bootstrap & toolchain foundation
**Source:** `project-documents/solution_design.md` §3, §6, §8; `client_requirement.md` §5
**Depends on:** none (foundation layer)

## Purpose

Stand up the Next.js (App Router, TypeScript) application with the full toolchain
so every later feature has a working, verifiable foundation: Tailwind + shadcn/ui,
Prisma wired to the hosted Supabase Postgres, `@supabase/ssr` clients + auth
middleware, dnd-kit, Vitest + Playwright, lint/format, environment scaffolding,
and Vercel settings. This feature delivers **no business logic and no domain
tables** — only the skeleton and the green `init.sh` pipeline.

## In scope

- Next.js App Router + TypeScript (`strict`) project with path aliases (`@/…`).
- Tailwind CSS + shadcn/ui initialized (`components/ui/`, `cn()` in `lib/utils.ts`).
- Prisma installed; `prisma/schema.prisma` with `datasource` using `DATABASE_URL`
  (pooled) + `directUrl` = `DIRECT_URL`; Prisma client singleton `lib/db.ts`.
- `@supabase/ssr` clients: `lib/supabase/server.ts` + `lib/supabase/client.ts`,
  both created **per request** (no module scope); `middleware.ts` session refresh.
- dnd-kit dependencies installed (no UI yet).
- Vitest (unit/component) + Playwright (E2E) configured with a smoke test each.
- ESLint + Prettier configured; `pnpm lint`/`typecheck`/`test`/`build` scripts.
- `.env.example` with all required keys (no secret values).
- A minimal root layout + placeholder home route that builds and renders.

## Out of scope

- Any domain model (User, Task, etc.) — those land in their own features.
- Auth UI / login — `01_auth_and_user_management`.
- RLS policies — introduced per-table in the feature that adds the table.

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall be a Next.js App Router project in
TypeScript with `strict` enabled and path aliases (`@/*`) resolving to the source
root.

**R2 (Ubiquitous):** The Prisma `datasource` shall use `url = env("DATABASE_URL")`
(pooled) and `directUrl = env("DIRECT_URL")`, and the Prisma client shall be
exported as a singleton from `lib/db.ts` that is server-only.

**R3 (Ubiquitous):** The system shall provide a browser Supabase client
(`lib/supabase/client.ts`) and a server Supabase client (`lib/supabase/server.ts`)
built with `@supabase/ssr`, each instantiated inside the request scope (never at
module scope).

**R4 (Event-driven):** When a request is handled, `middleware.ts` shall refresh
the Supabase auth session and forward updated cookies on the response.

**R5 (Ubiquitous):** The system shall expose pnpm scripts `dev`, `build`,
`typecheck`, `lint`, `test` (Vitest), and `test:e2e` (Playwright), and `init.sh`
shall run install → prisma generate → typecheck → lint → test → build to green.

**R6 (Ubiquitous):** The repository shall contain `.env.example` listing
`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` with no real
values, and `.env.local` shall be gitignored.

**R7 (Unwanted behavior):** If a `NEXT_PUBLIC_*` prefix is applied to a secret
(e.g. the Supabase secret key or a DB URL), then the setup shall be considered
non-compliant — only browser-safe values use the `NEXT_PUBLIC_` prefix.

**R8 (Ubiquitous):** The system shall build (`pnpm build`) and serve a placeholder
home route without runtime errors.

## Acceptance

- `bash init.sh` completes green: install, `prisma generate`, typecheck, lint, the
  Vitest smoke test, the Playwright smoke test, and `build` all pass.
- `.env.example` exists with the five keys above and no secrets; `.env.local` is
  gitignored.
- A Vercel preview deploy of the placeholder app builds successfully.
- The two Supabase clients and `middleware.ts` exist and are import-clean.

## Open items

- Source root convention `src/` vs root `app/`: pick one and record it in
  `docs/architecture.md` (the doc's final note). Default: root-level `app/`.
