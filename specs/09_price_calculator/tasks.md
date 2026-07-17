# Tasks — 09_price_calculator

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.
> Read `design.md` first. **This feature touches NO schema and adds NO migration,
> Server Action, route handler, env var, or dependency** — if a task seems to need
> one, stop and re-read the spec.

## Implementation

- [x] Create `lib/pricing-core.ts` — the PURE core, mirroring `lib/planning-core.ts`: **no** `server-only`, no Prisma, no React, no new dependency. Export the types (`FilamentInput`, `CalculatorInput`, `FilamentLine`, `Breakdown`) and `sanitizeAmount` (blank/empty/`NaN`/`Infinity`/negative → 0 — the single choke point every numeric passes through), `powerCost` (`pricePerHour × minutes / 60`), `filamentRowCost` (`grams × pricePerKg / 1000`), `calculateBreakdown` (order-preserving 1:1 lines, `filamentTotal` = sum, `total` = power + filament), and `roundMoney` (2 dp, display-only). Document *why* it lives outside `lib/services/` (R2, R3, R4, R7, R8, R11)
- [x] Create `components/calculator/types.ts` with the client-safe `ColorView` and `CalculatorPrintView` view types (declared here, not imported from the `server-only` prints service) (R5, R10)
- [x] Create `components/calculator/FilamentRow.tsx` (`"use client"`) — a controlled row: color `<select>` over the catalog with an adjacent hex swatch, **Grams** and **Price per kg** inputs (`type="number" min="0" step="any"`, real `<label>`s), and a Remove button rendered only while more than one row exists. Presentational only — no business logic (R3, R8, R9, R10)
- [x] Create `components/calculator/PriceCalculator.tsx` (`"use client"`) — owns all state (`powerPricePerHour`, `printTimeMinutes`, `rows` keyed by a stable id, `selectedPrintId`), derives the breakdown **during render** via `calculateBreakdown` (no `useEffect`), and renders the breakdown: electricity, one line per color (with swatch, or "No color"), filament subtotal, and the emphasized grand total — each through `formatCurrency(roundMoney(…))`, rounded once at the display edge (R2, R3, R4, R7, R8, R10, R11)
- [x] In `PriceCalculator`, add the optional **"Load from a print"** `<select>` (with a "— None (enter manually) —" option): selecting a print prefills `printTimeMinutes`, replaces the rows with **one row per color, grams blank**, and shows the print's total `filamentGrams` as a **hint** ("…split it across the colors below") — **no invented per-color split**; all prefilled values remain editable, and choosing "None" clears the hint without wiping typed values (R5, R6)
- [x] Add "Add filament row" (appends an empty row) and wire Remove; guarantee at least one row always remains; the default standalone state is one empty row (R6, R9)
- [x] Create `app/(app)/calculator/page.tsx` (Server Component, thin): `await requireUser()` (**no** `requireAdmin`), load reference data in ONE `Promise.all` — `db.color.findMany({ select: {id,name,hex}, orderBy: { name: "asc" } })` + `listPrints()` — map prints to the minimal `CalculatorPrintView` shape (no N+1, no extra query per print), set `metadata.title`, and render `<PriceCalculator allColors={…} prints={…} />` with fully serializable props (R1, R5, R10)
- [x] Add a **"Calculator"** `<Link href="/calculator">` to `components/layout/MainNav.tsx`, placed after "Expenses" and **outside** the `showAdmin` block so it renders for every authenticated user in both the app and admin navs (R1)
- [x] Confirm the no-persistence contract holds: `prisma/schema.prisma` and `prisma/migrations/` untouched, no `actions/` file added, no `app/api/` route, no `.env.example` entry, no new `package.json` dependency (R11)

## Tests

**Coverage target: `lib/pricing-core.ts` at 100% BRANCH coverage** (the repo's
pure-core standard, matching `lib/planning-core.ts`); ≥ 80% lines on the other
changed modules.

- [x] Vitest `lib/__tests__/pricing-core.test.ts` — **the worked example**: power $2.50/h × 90 min → `powerCost` 3.75; rows 30 g @ $450/kg → 13.50 and 20 g @ $500/kg → 10.00; `filamentTotal` 23.50; `total` **27.25** (R2, R3, R4)
- [x] Vitest (core) — the **kg→g conversion**: `filamentRowCost(1000, 450)` = 450 (a full spool costs a spool price) and `filamentRowCost(1, 1000)` = 1; `powerCost` over sub-hour and multi-hour times (60 → ×1, 30 → ×0.5, 120 → ×2) (R2, R3)
- [x] Vitest (core) — **blank/empty/zero → 0, never NaN**: `sanitizeAmount` over `""`, `null`, `undefined`, `"abc"`, `NaN`, `Infinity`, `0`, `"0"`, and a valid numeric string; `calculateBreakdown` with all-blank inputs returns `powerCost`/`filamentTotal`/`total` = 0 and every figure passes `Number.isFinite` (assert **not NaN** explicitly) (R7)
- [x] Vitest (core) — **negative handling**: negative power price, negative minutes, negative grams, and negative pricePerKg each clamp to 0 and contribute 0; a negative row never reduces `total` below the other rows' sum (R8)
- [x] Vitest (core) — **multi-row sum and row semantics**: N rows produce N `filamentLines` in input order with `filamentTotal` = their sum; **zero rows** → `filamentTotal` 0 and `total` = `powerCost` (the remove-to-empty edge); one row → that row's cost; a row with `colorId: null` still costs money and preserves its null id (R3, R4, R9)
- [x] Vitest (core) — `roundMoney` rounds to 2 dp and kills float drift (e.g. a sum landing on `27.249999…` renders as `27.25`); confirm 100% branch coverage of `lib/pricing-core.ts` is reached (R11)
- [x] Component `components/calculator/__tests__/PriceCalculator.test.tsx` — **prefill**: selecting a print with `printTimeMinutes: 90`, `filamentGrams: 50` and two colors fills the time input with 90, renders exactly **two** filament rows (one per color, correct colors preselected), leaves both grams inputs **blank**, and shows the **50 g total hint**; no per-color grams are guessed (R5)
- [x] Component — **live total**: typing the worked example (2.50 / 90 / 30@450 / 20@500) shows electricity $3.75, subtotal $23.50, and total **$27.25**, updating on each change with no Server Action / network call (R2, R3, R4)
- [x] Component — **standalone**: with no print selected the calculator renders one empty row, accepts fully manual entry, and totals correctly; an untouched form shows $0.00 everywhere and never renders "NaN" (R6, R7)
- [x] Component — **add/remove rows**: "Add filament row" appends a row; "Remove" drops the right row (keyed, not index-scrambled) and recomputes subtotal/total; Remove is unavailable at one row (R9)
- [x] Component — **swatches**: each row's selected color and each breakdown line render the color's `hex` swatch with its name, per the app's swatch convention (R10)
- [x] Component — prefilled values stay **editable**: after prefill, changing the time and typing grams updates the total (R5)
- [x] Component `components/layout/__tests__/MainNav.test.tsx` (extend) — the **Calculator** link renders with `href="/calculator"` for BOTH `showAdmin={false}` and `showAdmin={true}` (not admin-only) (R1)
- [x] E2E `e2e/calculator.spec.ts` (Playwright, **credential-gated** on `E2E_EMPLOYEE_EMAIL`/`E2E_EMPLOYEE_PASSWORD`, skipping when absent — mirrors `e2e/planning.spec.ts`) — signed out, `/calculator` redirects to `/login`; signed in as an **EMPLOYEE**, the **Calculator** nav link is visible and navigates to `/calculator` (R1)
- [x] E2E — signed in, enter the worked example on `/calculator` and see the total **$27.25** (formatted MXN), with the breakdown showing electricity, per-color lines, and the subtotal (R2, R3, R4, R10, R11)
- [x] `typecheck`, `lint`, and `test` (with coverage) pass; the 100% branch target on `lib/pricing-core.ts` is met

## Verification

- `/calculator` is reachable by any signed-in user from the nav (app **and** admin); signed-out redirects to `/login` (R1).
- Worked example: 2.50/h × 90 min + 30 g @ 450/kg + 20 g @ 500/kg → 3.75 + 13.50 + 10.00 = **$27.25** (R2, R3, R4).
- Prefill from a print fills time + one row per color, grams blank, with the total-`filamentGrams` hint and no invented split; values stay editable (R5).
- Manual standalone entry works with no print selected (R6).
- Blank/zero inputs yield $0.00 and never NaN (R7); negatives clamp to 0 (R8).
- Rows add/remove with at least one always present (R9); colors render swatches (R10).
- **Nothing is persisted**: no schema/migration diff, no action, no route handler, no env var, no dependency; money is display-only via `formatCurrency` (MXN) rounded at the end (R11).

## Coverage target

- **`lib/pricing-core.ts`: 100% branch coverage** (pure-core standard, per `lib/planning-core.ts`).
- ≥ 80% lines on the other changed modules (`PriceCalculator`, `FilamentRow`, the page, the nav change).
- **Traceability:** R1 → nav/page + MainNav component test + E2E; R2 → core worked-example/powerCost tests + component live-total + E2E; R3 → core kg→g/multi-row tests + component + E2E; R4 → core breakdown test + component live-total + E2E; R5 → core (prefill shape via rows) + component prefill/editable tests; R6 → component standalone test; R7 → core blank/NaN tests + component untouched-form test; R8 → core negative-clamp tests; R9 → core zero/one-row tests + component add/remove test; R10 → component swatch test + E2E; R11 → core `roundMoney` test + E2E formatted total + the no-persistence implementation check. Every R1–R11 traces to at least one test task.
