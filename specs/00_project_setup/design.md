# Design — 00_project_setup

**Source:** `project-documents/solution_design.md` §3 (conventions), §6 (auth clients), §8 (env/deploy)

## Approach

Infrastructure/foundation layer. No domain schema, no RLS. We scaffold the app,
the data/auth client wiring, and the test/lint pipeline so every later slice is
buildable and verifiable given only this feature. Follow `docs/conventions.md`
for structure and `references/stack-conventions.md` for the Supabase SSR pitfalls.

## File layout

```
app/
  layout.tsx                 # root layout (html/body, font, globals.css)
  page.tsx                   # placeholder landing (Server Component)
  globals.css                # Tailwind directives
components/ui/               # shadcn primitives (button added as smoke check)
lib/
  db.ts                      # Prisma singleton (server-only)
  supabase/server.ts         # createServerClient (per request, cookies adapter)
  supabase/client.ts         # createBrowserClient
  utils.ts                   # cn()
middleware.ts                # supabase session refresh (matcher excludes static)
prisma/schema.prisma         # datasource + generator only (no models yet)
e2e/smoke.spec.ts            # Playwright: home route renders
lib/__tests__/smoke.test.ts  # Vitest: cn() / trivial assertion
.env.example
vitest.config.ts · playwright.config.ts · .eslintrc · .prettierrc · tsconfig.json
init.sh (already present — verify it runs the pipeline)
```

## Prisma datasource (no models yet)

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled, 6543
  directUrl = env("DIRECT_URL")     // direct, 5432
}
generator client { provider = "prisma-client-js" }
```

`lib/db.ts`: standard global-singleton pattern guarded by `globalThis` to avoid
multiple clients in dev HMR; `import "server-only"` at the top.

## Supabase clients (the part people get wrong)

- `lib/supabase/server.ts`: `createServerClient(url, publishableKey, { cookies })`
  built **inside** a function called per request; reads/writes cookies via the
  Next.js `cookies()` adapter.
- `lib/supabase/client.ts`: `createBrowserClient(url, publishableKey)`.
- `middleware.ts`: create a server client bound to the request/response, call
  `supabase.auth.getUser()` to trigger refresh, and return the response with
  updated cookies. Matcher excludes `_next/static`, `_next/image`, favicon.
- Use the new **publishable** key for both clients; the **secret** key is
  server-only and is not used here (reserved for admin operations in `01`).

## Auth & security

- No authz logic yet, but the **per-request client** rule is established here so
  later features inherit it. Secret key never imported into client code; only
  `NEXT_PUBLIC_*` values reach the browser (R7).

## Validation

- None (no input boundaries yet). Zod is installed for later features.

## Test approach

- **Vitest:** one smoke unit test (e.g. `cn()` merges classes) proving the runner,
  TS paths, and config work.
- **Playwright:** one E2E smoke test that loads `/` and asserts the placeholder
  renders.
- **Pipeline:** `init.sh` is the real acceptance — typecheck + lint + test + build
  green. Coverage target: pipeline green (no coverage threshold this feature).

## Open items / discrepancies

- Confirm `app/` at root vs `src/app/`; default root `app/`. Once chosen, update
  the bracketed note in `docs/architecture.md`.
