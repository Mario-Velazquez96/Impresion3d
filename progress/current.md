# Current session

## Feature in progress
_None — no feature is currently in progress. Pick up the next `pending`
feature in `feature_list.json` per the SDD flow._

## State
All features `00`–`12` are reviewer-APPROVED and `done` (see `progress/history.md`
for per-feature entries). Latest full run: **989 tests / 65 files** green
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
- `12_flatten` — region-by-region manual **Flatten** stage inside `/image-prep`:
  flood/smooth/brush mask preview with W/S resize, multi-region selection,
  most-common-color fill suggestion + runner-ups, Flatten selection, Recolor
  every match, Low/Medium/High presets, Despeckle, flatten-scoped Z-undo,
  Reset all, zoom/pan/Expand. Second pure core `lib/flatten-core.ts` at 100%
  branch coverage. No persistence. Delivered in three reviewed phases
  (A `9cdc5a9` · B `42f75bf` · C `383bd7e`).
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

### Pick-from-image enhancement (2026-07-17)
Scoped client-only enhancement to the shipped `11_image_prep` feature: a **"Pick
from image" eyedropper**. Toggle it on, click the Preview (after) canvas, and the
palette entry that pixel maps to is selected/highlighted — reusing the existing
palette selection, so tapping another swatch afterward still merges (R21). No
worker, schema, dependency, or persistence change; the ONLY core change is a
small pure helper.

- `lib/image-prep-core.ts` — added ONE pure helper `paletteIndexAt(image, x, y)`
  (clamps x/y into bounds → `indices[y·width + x]`). Nothing else in the core,
  worker, protocol, or schema touched.
- `components/image-prep/ImagePrep.tsx` — lifted the palette `selected` index up
  from `PalettePanel` (controlled props), moved the selection-reset effect up
  (resets when the quantized image ref changes / stage leaves quantized), added a
  `pickMode` flag + `handlePick(x, y)` that guards quantized and selects the
  entry via `paletteIndexAt`. Pick mode stays on for repeated picking.
- `components/image-prep/BeforeAfterPreview.tsx` — new pure, DOM-free
  `mapClickToPixel` (inverts object-contain scale + centering, rejects letterbox
  clicks); Preview canvas gets `cursor-crosshair` + an onClick when pick mode is
  on. DOM glue stays thin.
- `components/image-prep/PalettePanel.tsx` — controlled `selected` /
  `onSelectedChange`; new "Pick from image" toggle (`aria-pressed`, active style)
  in the toolbar; small "Picked" readout (swatch + hex + filament name).
- Traceability: new **R21** in `requirements.md`, a design note + tasks (done) in
  `design.md` / `tasks.md`.
- Tests: +1 core (`paletteIndexAt` bounds/clamp), +6 unit
  (`components/image-prep/__tests__/BeforeAfterPreview.test.tsx` — `mapClickToPixel`
  scale/letterbox/edge/degenerate), +4 component (toggle+crosshair, click selects
  entry + Picked readout, pick-then-merge, letterbox click ignored).

Verified green: typecheck · lint · Vitest (**864 tests / 62 files**);
`lib/image-prep-core.ts` still 100% branch; changed components all ≥ 80% lines
(BeforeAfterPreview 92.4%, ImagePrep 93.7%, PalettePanel 98.6%). `pnpm build` not
run per standing instruction.

### Multi-select merge enhancement (2026-07-18)
Replaced `11_image_prep`'s instant tap-to-merge with **multi-select merging**
(new R22; R10 rewritten as toggle-only, R21 picks now toggle membership). Tap
swatches (or pick pixels) to build a selection; an action bar under the palette
groups offers **Merge to average** (count-weighted average color at the lowest
selected index, catalog cleared), **Merge into one of them…** (inline
dependency-free chooser; the chosen survivor keeps its color + filament link),
and **Clear**. Core gains pure `mergeManyEntries` + `mergeEntriesToAverage`;
the worker `PaletteAction` union swaps `merge` for `mergeMany`/`mergeAverage`,
so both merges ride the R20 undo history; selection still resets on every
palette change. No schema/dependency/persistence change. Details + traceability
in `progress/impl_11_image_prep.md`; specs amended in
`specs/11_image_prep/{requirements,design,tasks}.md`.

Verified green: typecheck · lint · Vitest (**878 tests / 62 files**);
`lib/image-prep-core.ts` still 100% branch; ImagePrep 93.9% / PalettePanel
99.6% lines. `pnpm build` not run per standing instruction.

- 2026-07-18: Posterize color cap raised 32 → 64 (`MAX_COLORS` in `lib/image-prep-core.ts`; slider/clamp/specs/tests updated in step; no structural change — `indices` stays Uint8Array). Green: typecheck · lint · Vitest (878 tests / 62 files); core still 100% branch.

### Selection highlight enhancement (2026-07-18)
Scoped view-only enhancement to the shipped `11_image_prep` feature (new
**R23**): while the palette multi-selection is non-empty on a quantized result,
the Preview canvas **dims every pixel not belonging to a selected entry** to
~30% brightness (selected entries keep their true color; union semantics).
Always on with a selection, no toggle; clears when the selection empties
(deselect / Clear / palette-change reset). Pure render-layer effect — pipeline
data, worker protocol, Download output, schema, dependencies, persistence all
untouched.

- `lib/image-prep-core.ts` — ONE additive pure helper `buildHighlightMask(image,
  selected)` + `HIGHLIGHT_DIM_ALPHA` (178): RGBA mask, transparent over selected
  entries' pixels, semi-opaque black elsewhere; dedupes and ignores
  non-integer/out-of-range indices; `null` when nothing valid remains.
- `components/image-prep/BeforeAfterPreview.tsx` — new optional `highlight`
  prop (`{ image, selected }`); mask built via `useMemo`, painted onto an
  overlay canvas absolutely stacked over the Preview canvas (same intrinsic
  dims + object-contain geometry, `pointer-events-none` so R21 eyedropper
  clicks pass through, `aria-hidden`); overlay unmounts when no mask.
- `components/image-prep/ImagePrep.tsx` — memoized `highlight` (null unless
  stage quantized AND selection non-empty) passed to the preview; main-thread
  compute, no worker op.
- Traceability: **R23** in `specs/11_image_prep/requirements.md` (+ acceptance
  bullet), design note in `design.md`, impl + test tasks (done) in `tasks.md`.
- Tests: +6 core (`buildHighlightMask` transparent/dim/union/all-selected/
  dedupe-invalid/null-contract + purity), +5 component (overlay mounts with a
  selection and unmounts on deselect/Clear/fresh-posterize, pointer-events
  pass-through with same-pixel pick clearing it, Download unaffected while
  highlighted).

Verified green: typecheck · lint · Vitest (**889 tests / 62 files**);
`lib/image-prep-core.ts` still 100% branch; BeforeAfterPreview 93.7% /
ImagePrep 94.1% / PalettePanel 99.6% lines. `pnpm build` not run per standing
instruction.
