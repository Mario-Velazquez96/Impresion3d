# Current session

## Feature in progress
_None — no feature is currently in progress. Pick up the next `pending`
feature in `feature_list.json` per the SDD flow._

## State
All features `00`–`11` are reviewer-APPROVED and `done` (see `progress/history.md`
for per-feature entries). Latest full run: **847 tests / 61 files** green
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
- `11_image_prep` — stateless client-side HueForge image prep (`/image-prep`):
  adjust → posterize (median cut in a Web Worker) → palette merge tools → snap
  to the Color catalog → download PNG. No persistence (no model/migration/
  Storage). Pure `lib/image-prep-core.ts` at 100% branch coverage.
- Dark theme; shared `MainNav` (consistent app/admin nav + Catalogs + Calculator
  + Image prep links); planning picker lists the full Color catalog; home
  "Get started" wired to `/board`.

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

## UI refinements

### 11_image_prep preview layout (2026-07-17)
Presentational-only polish in response to live feedback ("image too small,
adjustment bars too wide"). No pipeline/worker/`lib/image-prep-core.ts` logic
touched — only Tailwind classes in the presentational components.

- `components/image-prep/ImagePrep.tsx` — swapped column proportions: controls
  moved to a narrow fixed column (`lg:w-80 lg:shrink-0`) and the preview column
  now takes the majority of the row (`flex-1`) and is `lg:sticky lg:top-4` so it
  stays visible while scrolling the controls. Mobile stays single-column stacked.
- `components/image-prep/BeforeAfterPreview.tsx` — canvases grow with the wider
  column; figures gain `basis-72 min-w-[16rem]` so Original/Preview sit
  side-by-side when the column is wide and gracefully wrap to stacked when narrow.
  Canvases capped with `max-h-[70vh] max-w-full object-contain` so a 2000×2000
  image never overflows the viewport and aspect ratio is preserved.
- `components/image-prep/AdjustPanel.tsx` and `PosterizePanel.tsx` — range inputs
  capped at `max-w-[12rem]` so the bars aren't full-width; label/slider/value row
  structure and `htmlFor`/`id` links unchanged.

Tests untouched (selectors are role/label/text-based, not layout classes).
Verified green: typecheck · lint · Vitest (847 tests / 61 files).

### Palette undo enhancement (2026-07-17)
Scoped client-only enhancement to the shipped `11_image_prep` feature: an
**Undo button for palette-cleanup edits** (merge / merge-similar / merge-tiny /
snap), reverting one step at a time back to the freshly-posterized palette. No
worker, `lib/image-prep-core.ts`, schema, dependency, or persistence change.

- `components/image-prep/ImagePrep.tsx` — the `quantized` stage now carries a
  bounded `history: { image; preview }[]` stack (cap 20, oldest dropped).
  Posterize seeds the baseline (Undo disabled); each palette action pushes the
  new state; `handleUndo` pops it as PURE client state (no worker re-post, no
  recompute) and restores the prior `image` ref (which re-fires PalettePanel's
  selection-reset effect). `Ctrl/Cmd+Z` reuses `handleUndo`, only
  `preventDefault`ing when Undo applies. History lives inside the stage, so
  Apply / load discard it structurally (R16 invariant intact).
- `components/image-prep/PalettePanel.tsx` — new `canUndo`/`onUndo` props and a
  secondary-styled **Undo** button beside the Palette heading.
- Traceability: new **R20** in `specs/11_image_prep/requirements.md`, a design
  note + task (done) in `design.md` / `tasks.md`.
- Tests: +6 in `components/image-prep/__tests__/ImagePrep.test.tsx` (baseline
  disabled, restore-previous with no worker call, walk-back-to-baseline,
  re-posterize resets, busy-disabled, Ctrl+Z).

Verified green: typecheck · lint · Vitest (**853 tests / 61 files**);
`lib/image-prep-core.ts` still 100% branch, ImagePrep.tsx 93.9% / PalettePanel
99.4% lines. `pnpm build` not run per standing instruction.
