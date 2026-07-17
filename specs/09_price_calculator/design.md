# Design — 09_price_calculator

**Source:** product-owner decision (2026-07-16)
**Depends on:** 06_print_inventory (`Print`, `PrintColor`, `Color`,
`lib/services/prints.ts`), 01_auth (`requireUser`), 05 (`lib/format.ts`)

## Approach

A **read-only, stateless** feature. The shape mirrors `07_weekly_planning`'s
proven split, minus every mutation:

```
app/(app)/calculator/page.tsx        Server Component — auth + reference-data read
  └─ components/calculator/PriceCalculator.tsx   Client island — ALL input state
       ├─ components/calculator/FilamentRow.tsx  Client — one row's inputs
       └─ components/calculator/types.ts         Client-safe view types
lib/pricing-core.ts                  PURE core — the math (no Prisma/React/server-only)
components/layout/MainNav.tsx        + "Calculator" link (all authenticated users)
```

The server does **exactly one thing**: authorize, load reference data, pass it
down. Every keystroke thereafter is client-local — the island holds the input
state and calls the pure core on each render to derive the breakdown. There is
**no Server Action, no route handler, no revalidate, no mutation** at all.

### No persistence — explicit statement

This feature adds:

- **No Prisma model, enum, or field** → `prisma/schema.prisma` is untouched.
- **No migration** and **no RLS policy** (nothing new to protect; the reads ride
  the existing `Print`/`Color` RLS as defense-in-depth, with `requireUser()` as
  the real server-layer guard since Prisma bypasses RLS).
- **No Server Action, no route handler**, hence **no Zod schema** — Zod guards
  external boundaries, and this feature has no inbound boundary: nothing is ever
  submitted. Validation is light and client-side (`min="0"` + core clamping).
- **No env var** (nothing for `.env.example`) and **no new dependency**.
- No `localStorage`, cookie, or URL-param persistence. Reload = a fresh, empty
  calculator. That is intended: it is a scratchpad, not a record.

## `lib/pricing-core.ts` — the pure core

Lives in `lib/`, **not** `lib/services/`, and deliberately **does not** import
`server-only` — exactly like `lib/planning-core.ts`. Services are server-only
(they touch Prisma); this module is framework-agnostic arithmetic, so the Client
island can import it directly without dragging a server guard into the browser
bundle, and Vitest can hit it with no mocks at 100% branch coverage.

```ts
/** One filament line: a color plus what it costs to use. */
export type FilamentInput = {
  colorId: string | null;   // null = no color chosen yet (still costs money)
  grams: number;            // may be blank/NaN/negative at the edge; sanitized
  pricePerKg: number;
};

export type CalculatorInput = {
  powerPricePerHour: number;
  printTimeMinutes: number;
  rows: FilamentInput[];
};

export type FilamentLine = { colorId: string | null; cost: number };

export type Breakdown = {
  powerCost: number;
  filamentLines: FilamentLine[]; // 1:1 with input rows, order preserved
  filamentTotal: number;
  total: number;
};

/** Blank/empty/NaN/Infinity/negative → 0. The single guard for R7 + R8. */
export function sanitizeAmount(value: number | string | null | undefined): number;

/** powerPricePerHour × (printTimeMinutes / 60)  (R2) */
export function powerCost(pricePerHour: number, minutes: number): number;

/** grams × (pricePerKg / 1000) — the kg→g conversion (R3) */
export function filamentRowCost(grams: number, pricePerKg: number): number;

/** The whole breakdown: lines, subtotal, total = power + filament (R4) */
export function calculateBreakdown(input: CalculatorInput): Breakdown;

/** Round to 2 dp for DISPLAY only, killing float drift (R11) */
export function roundMoney(value: number): number;
```

Design notes:

- **`sanitizeAmount` is the choke point.** Every numeric entering the math passes
  through it: `Number(value)` then `Number.isFinite(n) && n > 0 ? n : 0`. That one
  expression satisfies both R7 (blank/empty/`""`/`null`/`undefined`/`NaN` → 0,
  never `NaN`) and R8 (negative → clamped to 0). Because it runs before any
  multiplication, `NaN`/`Infinity` can never propagate into a total.
- **Row costs are computed, then summed, unrounded**; `roundMoney` is applied at
  the **display edge** only (the island formats via `formatCurrency`), so
  intermediate float drift (e.g. `0.1 + 0.2`) never surfaces as `$27.249999`.
  Money here is never stored, so `Decimal` (the `Expense.cost` pattern) is
  unnecessary — that rule exists to protect *stored* amounts.
- **`filamentLines` is 1:1 and order-preserving** with the input rows, so the
  island can zip lines back to rows for rendering without index gymnastics.
- **Add/remove row is NOT modeled in the core.** The core is a pure function of a
  row array; adding/removing is just a different array (island `useState`
  concern). Tests cover the semantics via "N rows → N lines, sum matches" and a
  0-row/1-row case.
- **No color lookup in the core.** It carries `colorId` opaquely; the island maps
  ids to name/hex for swatches. This keeps the core free of view concerns.

## Page — `app/(app)/calculator/page.tsx` (Server Component)

Thin, per conventions. Mirrors `app/(app)/planning/page.tsx`:

- `await requireUser()` first — a second server-layer guard behind the `(app)`
  layout's redirect. **No `requireAdmin`**: any signed-in user (R1).
- Reference data in **one `Promise.all`, two queries, no N+1**:
  - `db.color.findMany({ select: { id, name, hex }, orderBy: { name: "asc" } })`
    — the full catalog, so every color is selectable even if unused by a print
    (same rationale as the planning page's picker).
  - `listPrints()` (existing service, single query with its `include`/`select`,
    already ordered by name) → map to the island's minimal shape:
    `{ id, name, printTimeMinutes, filamentGrams, colors: [{id,name,hex}] }`.
    Reusing `listPrints` avoids a second `printSelect` drifting out of sync; the
    page drops the fields the calculator doesn't need (photoPath, documentUrl,
    printType) before crossing the boundary.
- Renders an `<h1>` plus `<PriceCalculator allColors={…} prints={…} />`. All
  props are plain serializable data — no functions cross the boundary.
- `export const metadata = { title: "Calculator — Tower Layers" }`.
- No `searchParams`: the calculator holds no URL state (nothing persisted).

## Client island — `components/calculator/PriceCalculator.tsx`

`"use client"`. Owns everything interactive; imports `lib/pricing-core` (safe —
no `server-only`) and `lib/format`'s `formatCurrency` (also safe — pure `Intl`).

State (all `useState`, strings so inputs stay controlled and blank-able):

```ts
powerPricePerHour: string
printTimeMinutes: string
rows: { key: string; colorId: string; grams: string; pricePerKg: string }[]
selectedPrintId: string       // "" = standalone (R6)
```

- **Derivation, not effects.** The breakdown is computed **during render**:
  `const breakdown = calculateBreakdown({ ... })`. No `useEffect`, no memo
  needed at this size — pure, cheap, and always in sync as you type (R4).
- **Row identity** uses a stable `key` (a counter/`crypto.randomUUID()`), not the
  array index, so removing a middle row doesn't scramble React state (R9).
- **Prefill (R5).** A **"Load from a print"** `<select>` over `prints` (plus an
  `""` → "— None (enter manually) —" option). `onChange`:
  1. `setPrintTimeMinutes(String(print.printTimeMinutes))`;
  2. `setRows(print.colors.map((c) => ({ key: newKey(), colorId: c.id, grams: "", pricePerKg: "" })))`
     — **one row per color, grams blank**;
  3. the print's `filamentGrams` renders as a **hint** next to the rows, e.g.
     _"This print uses 50 g of filament in total — split it across the colors
     below."_ Reading `selectedPrintId` from state (never derived state), the hint
     shows only while a print is selected.
  Choosing "None" clears `selectedPrintId` and the hint; it does **not** wipe the
  user's typed values (destroying work on a stray select is hostile). Everything
  prefilled stays editable — the prefill only *seeds* the same `useState` the
  user drives (R5).
  - **Why no per-color split:** `Print.filamentGrams` is a single total and
    `PrintColor` carries no grams, so any split would be fabricated. Surfacing
    the total as a reference is the honest option (requirements: out of scope).
- **Add/remove (R9).** "Add filament row" appends an empty row. Each row has a
  "Remove" button, rendered/enabled only while `rows.length > 1`, guaranteeing at
  least one row survives.
- **Breakdown rendering (R4, R10, R11).** A summary block:
  - `Electricity` → `formatCurrency(roundMoney(breakdown.powerCost))`
  - one line per `filamentLines[i]` → `<Swatch>`-style dot + color name (from an
    id→color `Map` built once from `allColors`) or "No color" when `colorId` is
    null, then `formatCurrency(roundMoney(line.cost))`
  - `Filament subtotal` → `formatCurrency(roundMoney(breakdown.filamentTotal))`
  - `Total` → `formatCurrency(roundMoney(breakdown.total))`, visually emphasized.
  Rounding happens **here, at the display edge**, once (R11).

## `components/calculator/FilamentRow.tsx` (Client)

One row's inputs, presentational + controlled by the parent (no business logic):

- **Color `<select>`** over `allColors` — each `<option>` labelled by name, with
  a rendered **hex swatch** beside the select showing the current choice (a
  native `<option>` can't carry a swatch; the adjacent dot is the app's existing
  convention and keeps it accessible without a custom listbox) (R10).
- **Grams** `<input type="number" min="0" step="any" inputMode="decimal">`.
- **Price per kg** `<input type="number" min="0" step="any">`, labelled
  explicitly **"Price per kg"** so the spool-price semantics are unambiguous.
- **Remove** button (hidden/disabled at one row).
- Every input has a real `<label>`; `min="0"` is the client-side validation for
  R8, with the core's clamp as the actual guarantee.

## `components/calculator/types.ts`

Client-safe view types declared here (not imported from the `server-only` prints
service) — the same reason `components/planning/types.ts` exists:

```ts
export type ColorView = { id: string; name: string; hex: string };
export type CalculatorPrintView = {
  id: string; name: string; printTimeMinutes: number;
  filamentGrams: number; colors: ColorView[];
};
```

`ColorView` is structurally identical to planning's; re-declaring here keeps the
calculator independent of the planning feature rather than coupling two unrelated
islands through a shared import.

## Swatch reuse

Prefer **reusing `components/planning/Swatch.tsx`** (`<Swatch color={…} />`) —
it's already the app's swatch convention and is a plain presentational component
with no planning-specific logic. If the implementer finds importing across
feature folders objectionable, the fallback is a small local swatch span in
`FilamentRow`; either way the rendering (a `hex`-filled dot + name, `aria-hidden`
on the dot) must match the existing convention (R10).

## `components/layout/MainNav.tsx`

Add **one** link, **outside** the `showAdmin` block, so it renders for every
authenticated user in both the app and admin navs (R1):

```tsx
<Link href="/calculator" className="text-sm text-muted-foreground hover:text-foreground">
  Calculator
</Link>
```

Placed after "Expenses", before the admin-only group. No other nav change.

## Auth & security

- `(app)/layout.tsx` redirects unauthenticated requests to `/login`; the page's
  `requireUser()` is the server-layer guard before any Prisma read (Prisma
  bypasses RLS, so this is the real check). **No admin gating** — R1.
- No mutation ⇒ no auth→Zod→authorize→service→revalidate flow to specify. The
  only inbound data is the user's own keystrokes, which never leave the browser.
- Reference data (color names/hex, print names/times/grams) is already visible to
  any authenticated user on `/inventory` and `/planning` — no new exposure.
- No secrets, no `NEXT_PUBLIC_*`, no env vars.

## Server/Client boundary

- **Server:** `app/(app)/calculator/page.tsx` — auth + the two reads + mapping.
- **Client:** `PriceCalculator`, `FilamentRow` — state and event handlers only.
- **Shared/pure:** `lib/pricing-core.ts`, `lib/format.ts` — importable by both
  (no `server-only`). This is precisely why the core is not in `lib/services/`.

## Test approach

- **Vitest (pure core, target 100% branch coverage):** the worked example
  (2.50/h × 90 min + 30g@450 + 20g@500 = **27.25**), the kg→g conversion, blank/
  empty/`NaN` → 0 (never `NaN`), negative → clamped 0, multi-row sum, zero-row and
  single-row cases, `roundMoney` float-drift.
- **Component (RTL):** prefill from a print (time + one row per color + the
  `filamentGrams` hint, grams blank); typing updates the live total; add/remove
  rows; swatches render; standalone entry.
- **E2E (Playwright, credential-gated):** open `/calculator` via the nav link,
  enter the worked example, see **$27.25**; signed-out redirect.
- **Coverage target:** `lib/pricing-core.ts` **100% branch coverage**; ≥ 80% lines
  on the other changed modules.

## Open items

- None. Margin/sale price, per-color gram tracking, and any persistence are
  explicitly deferred (see `requirements.md` → Out of scope).
