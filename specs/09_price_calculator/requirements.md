# Requirements — 09_price_calculator

**Feature:** Stateless print price calculator — power cost + per-color filament
cost, live breakdown and total in MXN
**Source:** product-owner decision (2026-07-16)
**Depends on:** 06_print_inventory (Print, PrintColor, Color, `listPrints`)

## Purpose

Give any signed-in user a tool to work out **what a print costs to produce**:
the electricity burned over the print's run time plus the filament consumed, per
color. The calculator is **stateless** — it is a thinking tool, not a record.
Nothing it computes is saved anywhere; it only **reads** existing Print/Color
data to optionally prefill itself.

The math lives in a **pure core** (`lib/pricing-core.ts`) mirroring the
`lib/planning-core.ts` pattern: no Prisma, no React, no `server-only`, so the
Client island can import it directly and it is unit-testable to 100% branch
coverage. The page is a Server Component that loads reference data once and hands
it to a Client island; the breakdown re-derives **as the user types**, with no
server round-trip and no Server Action.

## In scope

- A new route **`/calculator`** inside the authenticated `(app)` group, so it
  inherits that layout's guard plus its own `requireUser()` — **any** signed-in
  user (EMPLOYEE or ADMIN); no admin gating.
- **`lib/pricing-core.ts`** — the pure calculation core (types + functions),
  client-and-server-safe, no `server-only` import, no new dependency.
- The page's **reference-data read** (Server Component, single Prisma/service
  call each, no N+1): the `Color` catalog (id/name/hex) and the prints
  (id/name/printTimeMinutes/filamentGrams/colors).
- A **Client island** (`PriceCalculator` + `FilamentRow`) owning all input state:
  - **Power price per hour** (currency, non-negative).
  - **Print time in minutes** (non-negative integer) — mirrors
    `Print.printTimeMinutes`.
  - **Filament rows** (one or more), each: **color** (from the `Color` catalog,
    rendered with its hex swatch), **grams used** (non-negative), and **price per
    KILOGRAM** (spool price, non-negative). Rows can be **added** and **removed**.
- An optional **"load from a print"** selector listing Inventory prints, which
  prefills the print time and creates one filament row per color of that print,
  and surfaces the print's **total `filamentGrams`** as a hint/reference.
- A live **breakdown**: electricity cost, each color's filament cost (with
  swatch), the filament subtotal, and the grand total — all formatted with the
  existing `formatCurrency` (MXN), display-only.
- A **"Calculator"** link in the shared `components/layout/MainNav.tsx`, visible
  to **all** authenticated users (not admin-only), so it appears in both the app
  and admin navs.
- Light **client-side** validation only: non-negative numbers; blanks treated
  as 0.

## Out of scope

- **Persistence of any kind.** No Prisma model, no field, **no migration**, no
  RLS policy, no Server Action, no route handler, no `localStorage`/cookie/URL
  state, no env var. The calculator writes nothing, anywhere.
- **Margin, markup, or sale price.** The output is **cost only**. Pricing
  strategy is a separate, future decision.
- **Per-color gram tracking in the data model.** `Print.filamentGrams` is a
  **total** for the print; per-color grams are deliberately not tracked. The
  calculator must **not invent a split** — it surfaces the total as a hint and
  lets the user distribute it. No schema change to add per-color grams.
- Zod validation: there is **no server boundary** to validate — nothing is
  submitted. (Client-side non-negativity checks only.)
- Saving/naming/sharing a calculation, history, exports, or PDF/print output.
- Multi-currency: `formatCurrency` (MXN) is the single formatter, unchanged.
- Machine depreciation, labor, post-processing, failure-rate, or overhead costs.

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall provide a `/calculator` page inside the
authenticated `(app)` route group, such that an unauthenticated request is
redirected to `/login` and any signed-in user (EMPLOYEE or ADMIN) may use it
without admin gating.

**R2 (Ubiquitous):** The system shall compute the electricity cost as
`powerCost = powerPricePerHour × (printTimeMinutes / 60)`.

**R3 (Ubiquitous):** The system shall compute each filament row's cost as
`cost = grams × (pricePerKg / 1000)`, applying the kilogram→gram conversion so a
price quoted per kilogram is charged per gram used.

**R4 (State-driven):** While the user is editing any input (power price, print
time, a row's grams, price per kg, or color), the system shall derive and display
the live breakdown — electricity cost, each row's filament cost, the filament
subtotal (`filamentTotal = sum(row costs)`), and the grand total
(`total = powerCost + filamentTotal`) — updating as inputs change, entirely
client-side with no server round-trip and no Server Action.

**R5 (Event-driven):** When the user selects a print in the "load from a print"
selector, the system shall prefill the print time from that print's
`printTimeMinutes`, replace the filament rows with **one row per color** of the
print (from `PrintColor`) with **grams left blank**, and display that print's
total `filamentGrams` as a hint/reference next to the rows — without inventing a
per-color gram split. All prefilled values shall remain editable.

**R6 (State-driven):** While no print is selected, the system shall allow the
user to enter every value manually (standalone mode) and produce the same
breakdown and total, with at least one filament row available by default.

**R7 (Unwanted behavior):** If any numeric input is blank, empty, non-numeric, or
zero, then the system shall treat it as `0`, yielding a cost contribution of `0`,
and shall **never** display or return `NaN` (nor `Infinity`) in any breakdown
figure or total.

**R8 (Unwanted behavior):** If a numeric input is negative, then the system shall
**reject** it at the input boundary — the inputs carry `min="0"` and the pure
core **clamps** any negative value to `0` before it reaches the math — so a
negative value contributes `0` and never reduces the total.

**R9 (Event-driven):** When the user activates "add row", the system shall append
a new empty filament row; when the user activates "remove" on a row, the system
shall remove that row, recompute the subtotal and total, and shall keep at least
one row present (removing the last row is not offered/leaves one empty row).

**R10 (Optional):** Where a filament row or breakdown line has a color selected,
the system shall render that color with its `hex` swatch alongside its name,
consistent with the app's existing swatch convention.

**R11 (Ubiquitous):** The system shall persist **nothing**: no database write of
any kind occurs from the calculator (no model, no migration, no Server Action, no
route handler), and every monetary value is display-only — computed, rounded for
display at the end, and formatted with `formatCurrency` (MXN), never stored.

## Acceptance

- Signed out, `/calculator` redirects to `/login`. Signed in as an EMPLOYEE (not
  just an ADMIN), the page loads and the **Calculator** nav link is visible in
  both the app and admin navs and navigates there (R1).
- **Worked example** (the canonical, testable case):
  - Power price = **$2.50/h**, print time = **90 min**
    → `powerCost = 2.50 × (90 / 60)` = **3.75**
  - Row 1: **30 g @ $450/kg** → `30 × (450 / 1000)` = **13.50**
  - Row 2: **20 g @ $500/kg** → `20 × (500 / 1000)` = **10.00**
  - `filamentTotal` = 13.50 + 10.00 = **23.50**
  - `total` = 3.75 + 23.50 = **$27.25**

  The breakdown shows electricity **$3.75**, the two per-color lines (each with
  its swatch), subtotal **$23.50**, and grand total **$27.25** (R2, R3, R4, R10).
- Typing into any input updates the total immediately, with no navigation, no
  network request, and no Server Action invocation (R4).
- Selecting a print with two colors and `printTimeMinutes = 90`,
  `filamentGrams = 50` prefills time = 90, creates exactly two rows (one per
  color, correct swatches), leaves both grams blank, and shows a "50 g total for
  this print" style hint. No per-color grams are guessed. Every prefilled field
  can then be edited (R5).
- With no print selected, entering the worked example manually yields the same
  **$27.25** (R6).
- An empty form (all blanks, no print) shows **$0.00** for electricity, subtotal,
  and total — never `NaN` (R7). Clearing a filled field returns it to a 0
  contribution, not `NaN`.
- Entering `-5` for grams/price/time contributes `0` (the total does not
  decrease); inputs refuse negatives via `min="0"` (R8).
- "Add row" appends an empty row; "Remove" drops a row and the subtotal/total
  recompute accordingly; at least one row always remains (R9).
- Every color shown (in a row selector and in its breakdown line) renders its hex
  swatch with its name (R10).
- No migration is added, `prisma/schema.prisma` is unchanged, no Server Action or
  route handler is created, and no `.env.example` entry is added. The feature adds
  **no runtime dependency** (R11).
