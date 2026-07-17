# Implementation — 09_price_calculator

**Status:** implementation complete, awaiting review (NOT marked `done`).
**Date:** 2026-07-16

Stateless print price calculator: electricity + per-color filament cost, live
breakdown and total in MXN. Cost only — no margin/markup/sale price.

## Tasks

All tasks in `specs/09_price_calculator/tasks.md` are complete and marked `[x]`
(9 implementation, 16 test/verification).

## Files created / changed

**Created**

- `lib/pricing-core.ts` — the PURE core (no `server-only`, no Prisma, no React).
- `components/calculator/types.ts` — client-safe `ColorView`, `CalculatorPrintView`.
- `components/calculator/FilamentRow.tsx` — controlled row (client).
- `components/calculator/PriceCalculator.tsx` — the island, owns all state (client).
- `app/(app)/calculator/page.tsx` — Server Component (auth + reference reads).
- `app/(app)/calculator/loading.tsx`, `app/(app)/calculator/error.tsx`.
- `lib/__tests__/pricing-core.test.ts` — 30 core tests.
- `components/calculator/__tests__/PriceCalculator.test.tsx` — 14 component tests.
- `e2e/calculator.spec.ts` — credential-gated Playwright spec.

**Changed**

- `components/layout/MainNav.tsx` — added the `Calculator` link after "Expenses",
  **outside** the `showAdmin` block.
- `components/layout/__tests__/MainNav.test.tsx` — asserts the link for both
  `showAdmin={false}` and `showAdmin={true}`.

Nothing else. `prisma/`, `package.json`, `pnpm-lock.yaml`, `.env.example`,
`actions/`, and `app/api/` are untouched (`git diff --stat` on those paths is
empty).

## Requirements → how satisfied + covering test

| R | How satisfied | Covering test |
|---|---|---|
| **R1** | `app/(app)/calculator/page.tsx` sits in the authenticated `(app)` group (layout redirects to `/login`) and calls `requireUser()` — **no** `requireAdmin`. Nav link is outside the `showAdmin` block. | `MainNav.test.tsx` "renders the Calculator link when showAdmin is false/true"; `e2e/calculator.spec.ts` signed-out redirect + EMPLOYEE nav navigation |
| **R2** | `powerCost(pricePerHour, minutes) = sanitize(price) × (sanitize(minutes) / 60)` | `pricing-core.test.ts` › "worked example" (3.75) + "powerCost" (60→×1, 30→×0.5, 120→×2, 0); `PriceCalculator.test.tsx` › live total; E2E |
| **R3** | `filamentRowCost(grams, pricePerKg) = sanitize(grams) × (sanitize(pricePerKg) / 1000)` | `pricing-core.test.ts` › "filamentRowCost (kg→g)" (1000 g @450 = 450; 1 g @1000 = 1; 30@450=13.50; 20@500=10) + "row semantics"; component live total; E2E |
| **R4** | `calculateBreakdown` returns order-preserving 1:1 lines, `filamentTotal` = sum, `total` = power + filament. The island derives it **during render** (no `useEffect`, no action, no fetch). | `pricing-core.test.ts` › "worked example" (lines 1:1, total 27.25); `PriceCalculator.test.tsx` › "updates the total on EVERY change"; E2E |
| **R5** | "Load from a print" `<select>` sets time from `printTimeMinutes`, replaces rows with one row per color (**grams blank**), and shows the print's **total** `filamentGrams` hint. No split invented. "None" clears the hint without wiping typed values. | `PriceCalculator.test.tsx` › "fills the time, makes one row per color with grams BLANK, and shows the total-grams hint"; "leaves prefilled values editable"; "choosing None clears the hint WITHOUT wiping" |
| **R6** | Default state is exactly one empty row; `selectedPrintId = ""` ⇒ full manual entry. | `PriceCalculator.test.tsx` › "renders exactly one empty row by default and accepts fully manual entry" (manual worked example → $27.25) |
| **R7** | `sanitizeAmount` = `Number(value)` → `Number.isFinite(n) && n > 0 ? n : 0`, applied before every multiplication. | `pricing-core.test.ts` › "sanitizeAmount" (12 cases incl. `""`/`null`/`undefined`/`"abc"`/`NaN`/`±Infinity`/`0`/`"0"`) + "blank inputs → 0, never NaN"; `PriceCalculator.test.tsx` › "untouched form shows $0.00 … never renders NaN" + "clearing a filled field" |
| **R8** | Rejected at the boundary (`min="0"` on every numeric input) **and** clamped in the core by the same `n > 0` guard. | `pricing-core.test.ts` › "negative inputs" (negative price/minutes/grams/pricePerKg each → 0; a negative row never lowers the total); `PriceCalculator.test.tsx` › "inputs refuse negatives via min=0 and a negative value contributes 0" |
| **R9** | "Add filament row" appends; Remove is rendered only while `rows.length > 1`; rows carry a stable `key` (counter), not an index. | `pricing-core.test.ts` › "row semantics" (zero rows → total = powerCost; one row); `PriceCalculator.test.tsx` › "Add … appends", "Remove drops the RIGHT row (keyed, not index-scrambled)", "Remove is not offered at one row" |
| **R10** | Reuses `components/planning/Swatch.tsx` (design's stated preference) — hex dot (`aria-hidden`) + name — beside each row's color select and on every breakdown line ("No color" when null). | `PriceCalculator.test.tsx` › "lists the full catalog and renders the selected color's hex swatch"; "renders each breakdown line with its color's swatch and name"; E2E swatch check |
| **R11** | No model/migration/action/route handler/env var/dependency; no `localStorage`/cookie/URL state. Costs summed unrounded, rounded ONCE at the display edge via `roundMoney` → `formatCurrency` (MXN). | `pricing-core.test.ts` › "roundMoney" (2 dp; `27.249999999999996` → 27.25; `0.1+0.2` → 0.3; non-finite/negative → 0); E2E asserts the formatted $27.25 **and** that a reload returns an empty calculator; the no-persistence check below |

## Coverage — actual numbers

- **`lib/pricing-core.ts`: 100% statements / 100% BRANCH / 100% functions /
  100% lines** — the spec's explicit target is **met**.
- `components/calculator/`: 99.61% lines, 96.29% branch, 100% functions
  (`FilamentRow.tsx` 100% across the board) — well above the ≥ 80% target.
- `components/layout/MainNav.tsx`: 100%.

## No-persistence contract — confirmed

- `prisma/schema.prisma` and `prisma/migrations/` — **untouched** (empty
  `git diff --stat`). No model, field, enum, or RLS policy.
- No `actions/` file added, no `"use server"` anywhere in the feature, no
  `app/api/` route → no Zod schema needed (there is no inbound boundary).
- No `.env.example` entry; no env var of any kind.
- **No new dependency**: `package.json` / `pnpm-lock.yaml` unchanged.
- No `localStorage`, cookie, or URL state. The only DB access is the page's two
  **reads** (`db.color.findMany` + the existing `listPrints()`), in one
  `Promise.all`, no N+1.
- `lib/pricing-core.ts` imports nothing at all — no `server-only`, so the client
  island imports it directly.

## Pipeline

Run with `corepack pnpm` (bare `pnpm` is not on PATH):

- `corepack pnpm typecheck` → **pass**, 0 errors.
- `corepack pnpm lint` → **pass**, 0 errors. (4 pre-existing `_a is defined but
  never used` warnings in `components/planning/__tests__/WeekPlanner.test.tsx`,
  unrelated to this feature and not introduced here.)
- `corepack pnpm test` (with coverage) → **pass**, **45 test files / 500 tests**,
  0 failures. 44 of those tests are new (30 core + 14 component), plus the
  extended MainNav assertions.
- **`pnpm build` intentionally SKIPPED**: a dev server is running and shares
  `.next`, so a production build would corrupt it. Typecheck covers the
  compile-level risk. Recommend the reviewer/leader validate the build on a
  **Vercel preview** (never production).
- E2E not run here: `e2e/calculator.spec.ts` is credential-gated and skips
  without `E2E_EMPLOYEE_EMAIL` / `E2E_EMPLOYEE_PASSWORD` (mirrors
  `e2e/planning.spec.ts`). The signed-out-redirect test needs no account.

## Deviations / notes

- **None from the spec.** Two design choices worth flagging for review, both
  explicitly sanctioned by `design.md`:
  1. **Swatch reuse.** `FilamentRow`/`PriceCalculator` import
     `components/planning/Swatch.tsx` rather than duplicating it — the design's
     stated preference ("Prefer reusing…"). It is purely presentational and the
     calculator's `ColorView` is structurally identical, so no coupling of logic.
     The fallback (a local swatch span) is available if the reviewer objects to
     the cross-feature import.
  2. **`roundMoney` routes through `sanitizeAmount`**, so a non-finite/negative
     value rounds to `0` rather than propagating. This is display-edge defence
     consistent with R7/R8; it is covered by an explicit test.
- `data-testid` attributes (`electricity-cost`, `filament-subtotal`,
  `total-cost`, `filament-lines`) were added to the breakdown so the component
  tests and E2E can assert figures unambiguously (currency strings otherwise
  collide with each other).
- Row remove buttons are labelled "Remove row N" for accessible, unambiguous
  targeting.
