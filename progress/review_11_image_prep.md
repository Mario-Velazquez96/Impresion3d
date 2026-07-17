# Review — 11_image_prep

**Reviewer verdict: APPROVED**
**Date:** 2026-07-17 · Branch `main` (fresh review; prior attempt was interrupted)

The feature may be marked `done` in `feature_list.json` by the leader.

## Checks re-run independently

- `corepack pnpm typecheck` — clean (0 errors).
- `corepack pnpm lint` — 0 errors. Only 4 pre-existing warnings in
  `components/planning/__tests__/WeekPlanner.test.tsx` (unrelated to this
  feature); no new warnings from image-prep code.
- `corepack pnpm test` (vitest + coverage) — **847 tests / 61 files, all passing.**
  - `lib/image-prep-core.ts` — **100% statements / 100% branch / 100% funcs /
    100% lines** (meets the hard 100%-branch pure-core target).
  - Other changed modules (target ≥ 80% lines): worker-messages 100,
    useImagePrepWorker 100, decode 100, PosterizePanel 100, HistogramChart 100,
    PalettePanel 98.7, ImagePrep 95.07, ImageDropzone 93.02, AdjustPanel 92.5,
    BeforeAfterPreview 90.47, MainNav 100. All clear the bar. `types.ts` is
    type-only (0 executable lines); `page.tsx` is outside the vitest include
    (thin Server Component, E2E-covered) — same convention as the calculator page.
- `pnpm build` NOT run, per the leader's explicit instruction (shared `.next`
  dev-server corruption gotcha). Typecheck/lint/test stand in.
- E2E (`e2e/image-prep.spec.ts`) is written and credential-gated
  (`E2E_EMPLOYEE_*`), skipping when creds are absent — matching the established
  repo pattern (`e2e/calculator.spec.ts`). Not executed here (no creds); the
  signed-out redirect test needs no account. Acceptable per precedent.

## 1. Requirement → test traceability (R1–R19)

Every requirement maps to at least one genuine, behaviour-asserting test:

- **R1** — `MainNav.test.tsx` "Image prep link … showAdmin %s" (both false/true);
  `image-prep.spec.ts` signed-out redirect + nav-click.
- **R2** — core io-edges/color-math; `ImagePrep.test` "shows dimensions and
  formatted size" (asserts `2 × 2 px · 8 B`); E2E upload step.
- **R3** — `ImagePrep.test` rejects non-image type, rejects oversize (guard runs
  before decode — asserted via `decodeSpy` not called), surfaces decode failure;
  all assert `role="alert"` and prior state intact.
- **R4** — core `fitWithin` (4096×2048 → 2048×1024); `decode.test`; `ImagePrep.test`
  "shows the downscale notice from 4096 × 2048".
- **R5** — core adjustments suite (identity/brightness/contrast/gamma/saturation
  + clamp); `ImagePrep.test` "recomputes ONLY on Apply" (slider alone fires no
  request); E2E Apply.
- **R6** — core histogram bin/sum test; `ImagePrep.test` histogram renders after
  Apply.
- **R7** — core median-cut (k≤n, cluster split, n-clamp, determinism, tie-breaks)
  + `quantize` deterministic; `ImagePrep.test` posterize bounds 2–32/default 8;
  E2E.
- **R8** — core "matches the hand-computed 2×2 Floyd–Steinberg diffusion exactly"
  + "dither off maps flat; dither on…"; `ImagePrep.test` dither off by default +
  passes `{colors, dither}`.
- **R9** — core coverage-sum + classify (neutrals light→dark / colors by hue) +
  strict-`<` boundary; `ImagePrep.test` coverage %; E2E 25.0% assertions.
- **R10** — core `mergeEntries`; `ImagePrep.test` tap A→B merges, tap-twice
  deselects (no request).
- **R11** — core `mergeSimilar` (closest sub-threshold pair, strict threshold);
  `ImagePrep.test` sends threshold 40.
- **R12** — core `mergeTiny` (smallest-first, stop-at-one, strict boundary);
  `ImagePrep.test` sends coveragePercent.
- **R13** — core `snapToCatalog` (same-target merge, labels); `ImagePrep.test`
  "snaps every entry … showing catalog names"; E2E snap.
- **R14** — core "empty catalog returns input unchanged"; `ImagePrep.test`
  "disables snapping with an explanatory note".
- **R15** — core `indexedToPixels`; `ImagePrep.test` preview follows newest stage;
  `BeforeAfterPreview` rendered in loaded tests.
- **R16** — `ImagePrep.test` "re-applying discards the quantized palette",
  "loading a new file resets the whole pipeline".
- **R17** — core `downloadFileName`; `ImagePrep.test` "Download PNG names
  photo-prepped.png with no network" (fetch spy asserted not called); E2E
  download event asserts `image-prep-sample-prepped.png`.
- **R18** — `ImagePrep.test` "disables controls while busy" + status region;
  `useImagePrepWorker.test` (busy lifecycle, rejection, teardown); E2E real worker.
- **R19** — no-persistence git contract (below); `ImagePrep.test` fetch-spy; E2E
  reload-resets-to-empty.

No requirement is left without a covering test.

## 2. Task completeness (spot-checked, not trusting checkmarks)

All tasks in `tasks.md` are `[x]` and verified against code: constants/types/
color-math/adjust/posterize/palette-ops in `lib/image-prep-core.ts`; the typed
worker protocol + (de)serialize helpers; the logic-free worker dispatcher; the
Promise/busy hook; all six panels; the thin Server page; the MainNav link
outside the `showAdmin` block. The documented deviations (exporting
`mapToPalette` alongside `quantize`, validation living in `ImageDropzone`,
serialize helpers co-located with the protocol, near-threshold classify test,
posterize allowed from the `loaded` stage) are all faithful to the spec's
behaviour and well justified.

## 3. Conventions

- `page.tsx` is a Server Component (no `use client`), reads the `Color` catalog
  via the `@/lib/db` singleton with `select` + `orderBy` (no N+1), guards with
  `requireUser()` (no admin gating, per R1). Prisma is server-only; the pure core
  and client bundle never import it.
- Client boundary correct: everything under `components/image-prep/` is
  `"use client"`; the pure core deliberately omits `server-only` and lives in
  `lib/` (not `lib/services/`), mirroring `pricing-core`/`planning-core`.
- No `any` (the `self as unknown as {…}` worker narrowing is documented; the
  `as ArrayBuffer` transfer casts are type assertions, not `any`). No
  `console.log`, no leftover debug. No `NEXT_PUBLIC_*` / env exposure. File
  naming per convention (PascalCase components, kebab-case modules, `useThing`).

## 4. No-persistence contract (R19)

Confirmed via `git status` / `git diff`: `prisma/schema.prisma` and
`prisma/migrations/` untouched; **no** migration; no `package.json` change (zero
new dependencies); no `.env.example` entry; no `actions/` file, no `app/api/`
route, no Supabase Storage code; no `localStorage`/cookie/URL state; no `fetch`.
The image enters via the dropzone and leaves only via the client-side Download
anchor.

## 5. vitest.config.ts change

The only config diff is a single `coverage.exclude` entry for
`components/image-prep/image-prep.worker.ts` with a one-line reason
(logic-free browser-only worker shell, exercised by E2E). This is exactly the
change the spec authorizes, and the worker is genuinely a thin
deserialize → core → serialize dispatcher, so the exclusion is justified.

## 6. Data & security

No schema change ⇒ `prisma migrate status` not applicable. Authorization is
enforced server-side via `requireUser()` before the single Prisma read (which
bypasses RLS). No secrets, no new env vars, no scope creep (no model/table/route/
dependency beyond the spec).

## Findings

None blocking. The feature is complete, correct, and within scope.
