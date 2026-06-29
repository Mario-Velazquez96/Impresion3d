# Review — 00_project_setup

**Verdict: APPROVE**

Reviewer: reviewer subagent. Date: 2026-06-21. Read-only review; no code modified.

The feature delivers the toolchain/foundation as specified. Pipeline reproduced
green independently via `corepack pnpm` (bare `pnpm` is not on this machine's
PATH — documented by the implementer; not a code defect). The leader may mark
`00_project_setup` as `done`, subject to the one outstanding release-time
acceptance item below (Vercel preview), which is legitimately deferred and is
NOT a blocker for closing the implementation.

---

## R1–R8 traceability

| Req | What it requires | Test / verification | Result |
|-----|------------------|---------------------|--------|
| R1 | Next.js App Router + TS strict + @/* alias to source root | tsconfig.json (strict:true, paths @/*->./*); alias exercised by app/page.tsx -> @/components/ui/button and lib/__tests__/smoke.test.ts -> @/lib/utils; enforced by typecheck (PASS) + build (PASS) | PASS |
| R2 | Prisma datasource pooled DATABASE_URL + directUrl=DIRECT_URL; server-only singleton in lib/db.ts | prisma/schema.prisma (both URLs + generator); lib/db.ts:1 import "server-only" + globalThis singleton; prisma generate PASS offline; build PASS (server-only boundary holds) | PASS |
| R3 | Two @supabase/ssr clients, per request (no module scope) | lib/supabase/client.ts (createBrowserClient inside createClient()), lib/supabase/server.ts (createServerClient inside async createClient() bound to cookies()); both inside functions; typecheck + build PASS | PASS |
| R4 | Middleware refreshes session and forwards cookies | middleware.ts (matcher excludes static) + lib/supabase/middleware.ts updateSession calls supabase.auth.getUser() and returns response with updated cookies; build reports Middleware 89.8 kB; E2E request traverses middleware -> HTTP 200 | PASS |
| R5 | pnpm scripts (dev/build/typecheck/lint/test/test:e2e) + green init.sh (install->generate->typecheck->lint->test->build) | package.json scripts all present; init.sh full runs the documented order; all stages reproduced green | PASS |
| R6 | .env.example with the 5 keys, no values; .env.local gitignored | .env.example has exactly DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (all empty); git check-ignore .env.local -> IGNORED; only the template is tracked | PASS |
| R7 | No NEXT_PUBLIC_ prefix on secrets (DB URLs / secret key) | Grep NEXT_PUBLIC_.*(SECRET|DATABASE|DIRECT|SERVICE) over .ts/.tsx/.mjs + .env.example -> zero matches in code/config (only doc prose); DB URLs + SUPABASE_SECRET_KEY carry no prefix; SUPABASE_SECRET_KEY/service_role never referenced in source | PASS |
| R8 | Build + serve placeholder home without runtime errors | build prerenders / static; Playwright e2e/smoke.spec.ts loads / -> HTTP 200, "Tower Layers" heading + "Get started" button visible (1 passed); curl against prod server confirmed HTTP 200 + content with NO .env.local | PASS |

Every requirement maps to at least one real test / pipeline-enforced check.
Traceability contract satisfied.

---

## Task completeness

All 13 implementation tasks in tasks.md are [x] and spot-checked as genuinely
done against the code (datasource, singleton, per-request clients, middleware,
scripts, configs, .env.example, placeholder route, smoke tests, root-app/
decision recorded in docs/architecture.md "Source layout (decided)").

Task 14 (Vercel preview deploy) is [ ] — legitimately deferred: a Vercel
project + preview env vars cannot be created from this sandbox. The production
build a preview runs (next build) passes locally. NOT a rejection cause.

Outstanding release item (not a blocker for marking implementation done):
Run a Vercel preview deploy of the placeholder app before release and confirm it
builds (Acceptance bullet 3 in requirements.md).

---

## Conventions / structure / security

- Structure matches docs/conventions.md and the root-level app/ decision:
  app/, components/ui/, lib/db.ts, lib/supabase/{server,client}.ts,
  lib/utils.ts, prisma/schema.prisma, e2e/, @/* -> repo root.
- Per-request Supabase client rule honored: no module-scope client instances;
  both clients constructed inside functions.
- lib/db.ts:1 has import "server-only"; Prisma not imported by any client
  module. No "use client" modules at all this feature.
- R7 hardening confirmed by source grep (above).
- No domain models in prisma/schema.prisma (datasource + generator only).
- Hygiene: no console.log, no any (the db.ts "as unknown as" is the standard
  singleton cast, not any), Prettier/ESLint clean.
- Scope discipline: env vars referenced in code are only NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NODE_ENV, CI; DATABASE_URL/DIRECT_URL are
  consumed by Prisma. No extra env vars, models, routes, or out-of-spec deps.
  No auth UI / login / sign-in/out leaked in (only the middleware getUser()
  session-refresh call, which is R4).

## Data & security

- No schema change beyond the empty datasource -> no migration required;
  prisma migrate status N/A (no models), consistent with spec out-of-scope.
- Authorization: none required this feature (no Prisma data paths, no auth yet);
  nothing relies on RLS. Correct for scope.
- No secrets committed; new env vars all present in .env.example; .env.local
  gitignored.

## Middleware hardening assessment (no-credentials pass-through)

Sound. lib/supabase/middleware.ts:22-24 returns the unmodified
NextResponse.next() when NEXT_PUBLIC_SUPABASE_URL/...PUBLISHABLE_KEY are absent.
This does NOT mask any auth requirement — this feature introduces no
authorization, and the guard only short-circuits an otherwise-thrown "URL and
Key are required" from createServerClient in an uncredentialed checkout. When
env vars are present the normal refresh path runs. Independently confirmed: with
NO .env.local, the home route serves HTTP 200 and the E2E smoke passes,
satisfying R8 "without runtime errors". Later auth features will add real
authorization on top; this pass-through is appropriate for the foundation.

---

## Pipeline stages reproduced (this machine, corepack pnpm)

| Stage | Command | Result |
|-------|---------|--------|
| pnpm available | corepack pnpm --version | PASS (9.15.0, matches packageManager pin) |
| Prisma generate | corepack pnpm prisma generate | PASS (client v6.19.3, offline) |
| Typecheck | corepack pnpm run typecheck | PASS (0 errors) |
| Lint | corepack pnpm run lint | PASS (only next lint deprecation notice) |
| Unit tests + coverage | corepack pnpm run test | PASS (2 files, 8 tests; utils.ts + button.tsx 100%; infra modules 0% — design sets NO coverage threshold this feature: "pipeline green") |
| Build | corepack pnpm run build | PASS (/ static, /_not-found static, Middleware 89.8 kB) |
| E2E (test logic) | corepack pnpm exec playwright test vs manually started prod server | PASS (1 passed) |
| Home route smoke | curl http://localhost:3000/ with NO .env.local | HTTP 200 + "Tower Layers" + "Get started" |

init.sh e2e auto-spawn note: Playwright webServer.command (pnpm start) launches
through cmd.exe and cannot see pnpm on THIS machine PATH. Confirmed
environment-only, not a code defect: with a running server reuseExistingServer
reuses it and the spec passes. On any host with pnpm on PATH (CI/Vercel/normal
dev box) it runs unmodified.

---

## Defects

None blocking. (Two non-blocking environment notes carried forward: bare pnpm
not on this machine PATH; Vercel preview deferred to release.)

## Conclusion

APPROVE. The leader may mark 00_project_setup as done. Track the Vercel preview
deploy as a release-time acceptance item before shipping.
