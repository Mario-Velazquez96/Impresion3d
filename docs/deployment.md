# docs/deployment.md — Deploying Tower Layers

Runbook for shipping the portal to **Supabase (hosted)** + **Vercel**.

> **Guardrail (from `CLAUDE.md` / `AGENTS.md`):** validate on a **dev/staging**
> Supabase project and a **Vercel preview** before touching production. Never run
> destructive DB operations against production. Migrations are a deliberate,
> manual/CI step — never part of the Vercel build.

Package manager is **pnpm 9.15.0**. On machines where bare `pnpm` is not on PATH,
prefix commands with `corepack` (e.g. `corepack pnpm …`).

---

## 0. Build prerequisite (already wired)

`package.json` runs `prisma generate` via a `postinstall` script, so the Prisma
Client is regenerated on every install — including Vercel's cached installs. No
extra build step is required.

## 1. Provision Supabase (staging first, then production)

Create a **separate** Supabase project per environment (don't share one across
staging and production). From each project's settings, collect the five env vars
(see `.env.example`):

| Var | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Connection string — **pooled** (port 6543) | App runtime. Append `?pgbouncer=true`. |
| `DIRECT_URL` | Connection string — **direct** (port 5432) | Used by `prisma migrate`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Browser-safe. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) | Browser-safe. |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`) | **Server-only.** Powers admin invite. Never `NEXT_PUBLIC_`. |

## 2. Apply migrations + seed (per environment)

Run from a trusted machine with `.env.local` pointing at the target DB — **not**
in the Vercel build:

```bash
corepack pnpm prisma migrate deploy   # 'deploy' (not 'dev') for staging/prod
corepack pnpm prisma migrate status   # expect: up to date
corepack pnpm prisma db seed          # 6 colors, task categories, print types (idempotent)
```

This applies all migrations, including:
- Row-Level Security on every table (`*_rls` migrations).
- The **private `print-photos` Storage bucket + `storage.objects` policies**
  (`20260622120200_print_photos_bucket`).

**Verify afterward** in the Supabase dashboard that the `print-photos` bucket
exists and is **private** — SQL-created buckets/policies are the one step worth
eyeballing.

## 3. Deploy to Vercel

1. Import the repo; framework preset **Next.js**; package manager **pnpm**.
2. Add all five env vars in **Settings → Environment Variables**, scoped
   separately to **Preview** (staging values) and **Production** (prod values).
3. Push a branch → Vercel builds a **Preview**. Validate there first.

## 4. Bootstrap the first admin

The app makes the **first authenticated user `ADMIN`** (`ensureUserRow`,
first-user-is-admin). There is no public signup UI, so:

1. Supabase → **Auth → Users → Add user** (email + password) on the target project.
2. Sign in at `/login` → that user's `User` row is created as `ADMIN`.
3. That admin invites everyone else from the admin UI (admin-set temporary
   password flow).

## 5. Validate, then cut over

- **E2E against a live target:** set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` /
  `E2E_EMPLOYEE_EMAIL` / `E2E_EMPLOYEE_PASSWORD` (matching real accounts/roles in
  the project), then `corepack pnpm test:e2e`. (Specs `test.skip` when these are
  unset.)
- **Manual smoke test:** login + route guards · catalogs CRUD · board + drag/drop ·
  expenses · a print upload (confirm the signed image renders) · a week plan with
  the dry-the-day-before list.
- When the preview is clean, **promote to Production** (your action). Run
  production `migrate deploy` + `db seed` once, deliberately.

## Things to watch

- **Migrations stay out of the build.** Keep `migrate deploy` a manual/CI step;
  the Vercel build uses the pooled URL and must not mutate schema.
- **`SUPABASE_SECRET_KEY`** must be set in Vercel (server env) for invites; it must
  never reach the client bundle.
- **Pooled vs direct.** Prisma connection-pool errors on Vercel usually mean
  `DATABASE_URL` is missing `?pgbouncer=true` or is using the 5432 direct port.
- **Images.** `PrintCard` uses `next/image` with `unoptimized`, so no
  `images.remotePatterns` config is needed for Supabase signed URLs.
