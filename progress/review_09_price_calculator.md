# Review — 09_price_calculator

**Verdict: APPROVE**
**Reviewer:** reviewer subagent · **Date:** 2026-07-16
**Scope reviewed:** `specs/09_price_calculator/{requirements,design,tasks}.md`,
`progress/impl_09_price_calculator.md`, `lib/pricing-core.ts`,
`app/(app)/calculator/{page,loading,error}.tsx`,
`components/calculator/{PriceCalculator,FilamentRow,types}`,
`components/layout/MainNav.tsx`, and all four test files.

The feature may be marked `done`.

---

## 1. Requirement traceability (R1–R11)

Every requirement maps to at least one test that genuinely exercises it. Verified
by reading each test, not by trusting the implementation report.

| R | Verified in code | Covering test(s) |
|---|---|---|
| **R1** — `/calculator` in `(app)`, any signed-in user, no admin gate | `page.tsx` calls `await requireUser()` (no `requireAdmin`); `(app)/layout.tsx` redirects to `/login`; the MainNav link sits outside the `showAdmin` block (confirmed in the diff) | `MainNav.test.tsx` > `it.each([false, true])` "renders the Calculator link when showAdmin is %s" — asserts **both** false AND true; `e2e/calculator.spec.ts` signed-out redirect + EMPLOYEE nav click |
| **R2** — `powerCost = pricePerHour × (minutes/60)` | `pricing-core.ts:59-61` | core > "worked example" (3.75); "powerCost" 60→×1, 30→×0.5, 120→×2, 0→0; component live-total; E2E |
| **R3** — `cost = grams × (pricePerKg/1000)` | `pricing-core.ts:67-69` | core > "filamentRowCost (kg→g)": 1000 g @450 = 450, 1 g @1000 = 1, 30@450=13.5, 20@500=10; component; E2E |
| **R4** — live breakdown, derived, no round-trip | `PriceCalculator.tsx:59-67` — `calculateBreakdown` called **during render**; no `useEffect`/action/fetch | core > "worked example" + "lines 1:1 in input order"; component > "updates the total on EVERY change" (2.50×60→$2.50, then 120→$5.00); E2E |
| **R5** — prefill: time + one row per color, grams BLANK, total-grams hint | `handlePrintChange` (`PriceCalculator.tsx:77-87`) sets time from `printTimeMinutes`, maps `print.colors` → `newRow(color.id)` with grams `""`; hint at `:165-170` renders `selectedPrint.filamentGrams` | component > "fills the time, makes one row per color with grams BLANK, and shows the total-grams hint" (time=90, exactly 2 selects preset to Piel/Verde, **both grams `toHaveValue(null)`**, "50 g of filament in total"); "leaves prefilled values editable"; "choosing None clears the hint WITHOUT wiping" |
| **R6** — manual standalone mode | `useState(() => [newRow()])`, `selectedPrintId = ""` | component > "renders exactly one empty row by default and accepts fully manual entry" → manual worked example = $27.25 |
| **R7** — blank/zero → 0, never NaN/Infinity | `sanitizeAmount` choke point, applied before every multiplication | core > `sanitizeAmount` 12 cases (`""`, `null`, `undefined`, `"abc"`, `NaN`, `+Infinity`, `-Infinity`, `0`, `"0"`, whitespace, valid num/string), each asserting `isFinite` true / `isNaN` false; "never yields NaN or Infinity from non-numeric input"; component > "untouched form shows $0.00 … never renders NaN" + "clearing a filled field" |
| **R8** — negatives clamped AND `min="0"` at the input | Core: the `n > 0` guard. Inputs: `min="0"` on power price and print time (`PriceCalculator.tsx:135,150`), grams and price/kg (`FilamentRow.tsx:84,100`) | core > "negative inputs": `powerCost(-2.5,90)=0`, `powerCost(2.5,-90)=0`, `filamentRowCost(-30,450)=0`, `filamentRowCost(30,-450)=0`, and a −9999 row leaves the total at 17.25 (never lowers it); component > "inputs refuse negatives via min=0 and a negative value contributes 0" asserts the `min` **attribute** and the 0 contribution |
| **R9** — add/remove, stable keys, ≥1 row | `newRow()` issues `row-N` counter keys; `updateRow`/`removeRow` filter **by key**; `canRemove={rows.length > 1}` plus a `prev.length > 1` guard in `removeRow` | core > zero-row and one-row edges; component > "Remove drops the RIGHT row (keyed, not index-scrambled)" — see §5; "Add … appends"; "Remove is not offered at one row" |
| **R10** — hex swatch + name | `<Swatch>` beside each row select and on every breakdown line; "No color" fallback | component > "lists the full catalog and renders the selected color's hex swatch" (asserts `rgb(238, 205, 163)`); "renders each breakdown line with its color's swatch and name" (scoped via `within(getByTestId("filament-lines"))`, asserting both Piel and Verde dots + names + 13.50/10.00); E2E |
| **R11** — persists nothing; display-only money | Structural verification in §2; `roundMoney` applied once at the display edge → `formatCurrency` (MXN) | core > `roundMoney` (2 dp, `27.249999999999996`→27.25, `0.1+0.2`→0.3, non-finite/negative→0); E2E asserts the formatted $27.25 **and** that a reload returns `0.00` |

**No untested requirement.**

## 2. The no-persistence contract — independently verified

I ran my own git/grep checks rather than trusting the report. The work is
uncommitted, so the working-tree diff IS the complete change set.

- **`git diff --stat` (tracked) — the ENTIRE tracked change:**
  `components/layout/MainNav.tsx` (+9), `components/layout/__tests__/MainNav.test.tsx`
  (+17), `feature_list.json` (+7). MainNav's 9 lines are the
  `<Link href="/calculator">` plus a comment. Nothing else.
- **`git diff --stat -- prisma package.json pnpm-lock.yaml .env.example` → EMPTY.**
  No model, field, enum, migration, RLS policy, env var, or dependency.
  `pnpm-lock.yaml` unchanged ⇒ **no new dependency**.
- **`git status --untracked-files=all`** — the only new files are
  `app/(app)/calculator/{page,loading,error}.tsx`,
  `components/calculator/{PriceCalculator,FilamentRow,types,__tests__/...}`,
  `lib/pricing-core.ts`, `lib/__tests__/pricing-core.test.ts`,
  `e2e/calculator.spec.ts`, plus the spec/progress markdown. No stray files.
- **No `actions/` file added** — the six `actions/*.ts` are all pre-existing and
  untouched (absent from the diff). **No `"use server"`** anywhere in the feature.
- **No `app/api/` route** — the directory does not exist at all.
- **Persistence greps → ZERO matches** for `localStorage`, `sessionStorage`,
  `document.cookie`, `useSearchParams`, `searchParams`, `fetch(`, `revalidate`
  across `lib/pricing-core.ts`, `app/(app)/calculator`, `components/calculator`.
- **The only DB access is two READS**, in one `Promise.all` (`page.tsx:33-39`):
  `db.color.findMany({ select: {id,name,hex} })` + the existing `listPrints()`.
  I read `lib/services/prints.ts`: `listPrints` is a **single** `findMany` with
  `printSelect` — **no N+1** — and it does **not** sign photo URLs (the inventory
  page does that), so the calculator page adds no storage calls. `photoPath`,
  `documentUrl` and `printType` are dropped before crossing the boundary.
- **`feature_list.json`** was touched only to add the `09` entry at
  `status: "in_progress"` — correctly **not** `done`.

## 3. The pure core

- **Imports nothing at all** (`git grep "^import" lib/pricing-core.ts` → no match):
  no `server-only`, no Prisma, no React. The Client island can and does import it
  directly. Correctly placed in `lib/`, not `lib/services/`, and the file header
  documents *why* — matching `lib/planning-core.ts`.
- **Math verified against the spec** (`pricing-core.ts:59-93`):
  `powerCost = sanitize(price) × (sanitize(minutes)/60)`;
  `filamentRowCost = sanitize(grams) × (sanitize(pricePerKg)/1000)`;
  `filamentTotal` = reduce-sum of the lines; `total = power + filamentTotal`.
  Lines are 1:1 and order-preserving via `rows.map`.

### Worked example — independently recomputed

I re-implemented the core's expressions in a standalone Node evaluation rather
than reading the test's expectation:

    powerCost 3.75 | r1 13.5 | r2 10 | filamentTotal 23.5
    total(raw) 27.25 | roundMoney(total) 27.25 | MXN: $27.25

$2.50/h × 90 min + 30 g @ $450/kg + 20 g @ $500/kg = **$27.25**, exact. The raw
total lands on `27.25` with **no float drift**, and `formatCurrency` renders
`$27.25` under `es-MX`/`MXN`. Matches `requirements.md` line for line.

### Branch coverage — independently confirmed

From my own `corepack pnpm test` run:

    lib
      pricing-core.ts  |     100 |      100 |     100 |     100 |

**100% statements / 100% BRANCH / 100% functions / 100% lines.** The spec's hard
target is **met**. (`components/calculator/` 99.61% lines, 96.29% branch, 100%
functions — `FilamentRow.tsx` 100% across the board; `MainNav.tsx` 100%. All well
above the ≥ 80% line target for the other changed modules.)

## 4. Robustness (R7 / R8)

- `sanitizeAmount` = `Number(value)` → `Number.isFinite(n) && n > 0 ? n : 0` is a
  genuine single choke point: **every** numeric passes through it *before* any
  multiplication, so `NaN`/`±Infinity` cannot propagate into a figure.
- Non-finite cases are explicitly tested, including `+Infinity` and `-Infinity`,
  and the breakdown test asserts `isFinite` / `!isNaN` **and** `=== 0` on every
  figure — behavioural, not line-padding.
- Negatives are handled on **both** layers, as R8 demands: `min="0"` on all four
  numeric inputs (asserted as an attribute in the component test) **and** the core
  clamp (asserted for negative price, minutes, grams, and pricePerKg). The
  "a negative row never lowers the total" test is exactly the right assertion.

## 5. Prefill, rows, auth — the spot-checks that matter

- **No invented split (R5).** `handlePrintChange` maps colors to rows with
  `grams: ""` and never touches `filamentGrams` except to render it as prose:
  "This print uses {filamentGrams} g of filament in total — split it across the
  colors below." The test asserts `toHaveValue(null)` on both grams inputs, so it
  would fail if any split were fabricated. Prefilled values only seed the same
  `useState` the user drives, and the editability test proves it (90→60 min,
  blank grams→25 g, total updates). Choosing "None" clears the hint without
  wiping typed values.
- **Stable keys (R9) — the test genuinely proves it.** "Remove drops the RIGHT
  row" builds three rows (10/20/30 g @ 100/kg, subtotal 6.00), removes the
  **middle** one, then asserts the survivors' **input values** are `10` and `30`
  and the subtotal is `4.00`. With index keys React would preserve the DOM node
  and state at index 1, so the surviving second input would read `20` and the test
  would fail. A real regression guard, not a smoke test.
- **Auth (R1).** `requireUser()`, **not** `requireAdmin` — confirmed by reading
  `page.tsx`. The MainNav diff shows the link inserted after "Expenses" and
  **before** the `{showAdmin ? ...}` ternary, and the `it.each([false, true])`
  test asserts the link in **both** states.
- **Display edge.** Costs are summed unrounded in the core; `roundMoney` is
  applied exactly once per displayed figure, at the `formatCurrency` call site
  (`PriceCalculator.tsx:209, 229, 238, 245`). No rounding leaks into the math, and
  no float-drift artifacts surface.

## 6. Conventions & scope

- Server/Client boundary correct: the page is a Server Component (Prisma via the
  `@/lib/db` singleton, server-only); `"use client"` only on the two islands and
  `error.tsx` (required by the App Router error-boundary contract). All props are
  plain serializable data.
- No mutation ⇒ no auth→Zod→authorize→service→revalidate flow to enforce; the
  design's justification for omitting Zod (no inbound boundary) is sound.
- `git grep` for `: any` / `as any` / `console.log` / `console.debug` /
  `@ts-ignore` / `NEXT_PUBLIC` across the new files → **zero matches**.
- `loading.tsx` / `error.tsx` are not extra scope — `docs/conventions.md` mandates
  them for async UI.
- Nothing beyond the calculator + the one nav link changed (see §2).
- `components/calculator/types.ts` correctly avoids importing the `server-only`
  prints service.

## 7. The two flagged design choices — judged

**(a) `components/calculator/*` importing `components/planning/Swatch.tsx` —
ACCEPTABLE as-is.** `Swatch` is purely presentational (a hex dot with
`aria-hidden` plus a name), carries zero planning logic, and R10 explicitly
requires consistency "with the app's existing swatch convention". Duplicating it
would fork that convention and guarantee drift — the worse outcome. `design.md`
sanctions the reuse as its stated preference, and the type coupling is nil: the
calculator declares its own structurally identical `ColorView`. *Non-blocking
note:* the import direction is the mild smell — a shared presentational primitive
would ideally live in `components/ui/` or `components/common/`. Extracting it now
would mean editing planning files for a calculator feature, i.e. scope creep, so
the right home for that move is a future shared-primitives cleanup. Rejecting for
this would be wrong.

**(b) `roundMoney` routing through `sanitizeAmount` — ACCEPTABLE, with a noted
footgun.** In this feature it is harmless and arguably correct: `roundMoney`'s
only callers are breakdown figures that already passed the clamp, so the guard is
defence-in-depth consistent with R7/R8, it keeps `NaN` off the screen at the last
possible moment, and it is explicitly tested (`roundMoney(NaN) → 0`,
`roundMoney(-5) → 0`). The caveat: the name promises rounding, not clamping, so a
future caller wanting to display a legitimately negative amount (a credit, a
refund, a margin delta once pricing strategy lands) would silently get `$0.00`.
That risk is contained today — the feature is cost-only by requirement and the
function is used nowhere else — and the JSDoc documents the behaviour. **Flag for
the leader, not a defect:** if `roundMoney` is ever reused beyond the calculator,
revisit the clamp or rename it (e.g. `roundMoneyForDisplay`).

## 8. Pipeline (run independently, with `corepack pnpm`)

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | **PASS** — `tsc --noEmit`, 0 errors |
| `corepack pnpm lint` | **PASS** — 0 errors. 4 warnings (`'_a' is defined but never used`) in `components/planning/__tests__/WeekPlanner.test.tsx` — **pre-existing**, confirmed by that file's absence from the diff. Not introduced here. |
| `corepack pnpm test` (coverage) | **PASS** — **45 test files / 500 tests, 0 failures**, 13.28 s. New: `pricing-core.test.ts` **34 tests**, `PriceCalculator.test.tsx` **14 tests**, plus the extended MainNav assertions. |
| **`lib/pricing-core.ts` branch coverage** | **100%** (100 / 100 / 100 / 100) — hard target met |
| `pnpm build` | **Correctly SKIPPED** — a dev server shares `.next`; a production build would corrupt it. `typecheck` covers the compile-level risk. **Recommend the leader validate the build on a Vercel preview (never production).** |
| `pnpm test:e2e` | **Not run — legitimately.** `e2e/calculator.spec.ts` is credential-gated on `E2E_EMPLOYEE_EMAIL` / `E2E_EMPLOYEE_PASSWORD` and skips when absent, mirroring `e2e/planning.spec.ts`. I reviewed the **file**: it covers the signed-out redirect (needs no account), EMPLOYEE nav navigation (R1's no-admin-gating), the worked example → `$27.25` with the electricity/subtotal breakdown, a swatch check, and a **reload → `0.00`** assertion that directly proves R11. |
| `prisma migrate status` | **N/A** — no schema change (the `prisma/` diff is empty). |

## 9. Minor observations (non-blocking, no action required)

1. The impl report says "30 core tests"; the actual run reports **34** (the
   `it.each` table expands to 12). An undercount in the report only — the tests
   are real and passing.
2. `data-testid` attributes on the breakdown are justified: MXN currency strings
   collide across lines, so role/text queries would be ambiguous. The swatch and
   color-name assertions still go through accessible queries.
3. `rowCounter` is module-level and never reset. Correct here — keys need only be
   unique within a session, never deterministic.

---

## Verdict

**APPROVE.** The defining constraint of this feature — the no-persistence
contract — holds under independent verification, not merely by assertion: the
entire tracked diff is 9 lines of nav plus tests; `prisma/`, `package.json`,
`pnpm-lock.yaml` and `.env.example` are byte-identical; there is no action, no
route handler, and no client-side persistence of any kind. The pure core is
import-free and hits the spec's hard 100% branch target; the worked example
recomputes to exactly $27.25 with no float drift. Prefill invents no gram split,
row removal is genuinely key-stable and proven so, and the page is
`requireUser()`-gated with the nav link outside `showAdmin`. All of R1–R11 trace
to real tests. Both flagged design choices are sound; only the `roundMoney`
naming deserves a note if it ever escapes this feature.

**The leader may mark `09_price_calculator` as `done`** (build validation on a
Vercel preview recommended, since the local build was correctly skipped).
