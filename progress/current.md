# Current session

## Feature in progress
(none — all 11 features are `done`)

## State
All features `00`–`10` are reviewer-APPROVED and `done` (see `progress/history.md`
for per-feature entries). Latest full run: **761 tests / 57 files** green
(typecheck · lint · Vitest).

**Deployed.** The app is live on Vercel, auto-deploying from `main`:
- Repo: `github.com/Mario-Velazquez96/Impresion3d` · working branch is now `main`.
- Pipeline: commit → push `main` → Vercel rebuilds automatically.
- Backed by the **staging** Supabase project (`tower-layers-staging`); all
  migrations applied + catalogs seeded. A separate production Supabase project
  (with its own Vercel env vars + `migrate deploy` + `db seed`) remains the path
  to a true prod environment.
- Local dev: `corepack pnpm dev` against the same staging DB via `.env.local`.

## Delivered beyond the original 7 features
- `08_task_priority` — Priority LOW/MEDIUM/HIGH + badge + board filter (migration
  applied to staging).
- `09_price_calculator` — stateless cost calculator (no persistence); pure
  `lib/pricing-core.ts` at 100% branch coverage.
- `10_sales_and_balance` — `/finances`: Sale + Withdrawal ledgers and a DERIVED
  balance (2 migrations applied to staging). Pure `lib/finances-core.ts` at 100%
  branch coverage.
- Dark theme; shared `MainNav` (consistent app/admin nav + Catalogs + Calculator
  links); planning picker lists the full Color catalog; home "Get started" wired
  to `/board`.

## Known follow-ups (non-blocking)
- `prisma db seed` fails on Windows (Unix inline-env in `package.json#prisma`);
  works via Git Bash. Fix with cross-env or `prisma.config.ts`.
- E2E suites are written but never executed (credential-gated): set
  `E2E_ADMIN_*` / `E2E_EMPLOYEE_*` in `.env.local`, then `corepack pnpm test:e2e`.
- A production Supabase project + Vercel production env vars (see
  `docs/deployment.md`) if/when a real prod environment is wanted.

## Product decisions that look like bugs but are NOT
- **The `/finances` balance EXCLUDES expenses — on purpose.** `balance =
  sum(Sale.amount) − sum(Withdrawal.amount)`. It answers "how much revenue came in
  that hasn't been taken out yet", not "what's truly in the bank". Expenses stay a
  separate 05 concern. Documented in the schema comment, in
  `specs/10_sales_and_balance/requirements.md`, and rendered as a visible label on
  the page. **Do not "fix" it** by folding expenses in — that's a product change
  that needs the human, not a bug.
- **The balance is DERIVED, never stored.** No balance column/cache/running total
  anywhere; it's recomputed from the two ledgers per read (a stored total would
  drift). Don't add one "for performance" without a real measurement.

## Gotcha for future sessions
NEVER run `pnpm build` while the dev server is running — both share `.next` and
the build corrupts the dev server's CSS chunks (symptom: unstyled app, 404 on
`/_next/static/css/app/layout.css`). Verify changes with typecheck/lint/test
while dev is up; stop the server first if a build is truly needed.
