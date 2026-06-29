# Impl — 07_weekly_planning: picker sources the full Color catalog

Small, focused tweak to the already-implemented `07_weekly_planning` feature. The
week color picker on the Planning page now offers **all** catalog colors, not only
the colors used by existing prints.

## What changed (files)

- **`app/(app)/planning/page.tsx`** — the only application-code change.
  - Removed the logic that derived `allColors` from the deduped set of colors
    used by loaded prints (the `colorMap` loop + sort).
  - Added `import { db } from "@/lib/db"` and now load the full catalog in the
    existing `Promise.all` via
    `db.color.findMany({ select: { id, name, hex }, orderBy: { name: "asc" } })`,
    passing the result to `<WeekPlanner allColors={...} />` (which forwards it to
    `ColorPicker`). The picker's selectable list is now the full catalog ordered
    by name, independent of the prints loaded for matching.
- **No changes** to `WeekPlanner.tsx`, `ColorPicker.tsx`, `lib/services/planning.ts`,
  `lib/planning-core.ts`, the actions, validation, or schema. The match core
  (`fullMatches`/`partialMatches`/`dryingSchedule`), inventory/prints loading, the
  atomic color-set replace in `setWeekColors`, the per-day grid, and the drying
  panel are all untouched. Swatches still render from `hex` for every listed color.

## How the picker is now sourced

Page server load → `db.color.findMany(orderBy: name asc)` → `allColors` →
`WeekPlanner` → `ColorPicker`. Every catalog color is selectable even before any
print uses it. The week's *selected* set is still the persisted `WeekPlanColor`
rows (`initialAvailableColorIds`), saved via `setWeekColors` exactly as before, so
R3 and the R4/R5/R6 matching (and the worked example) are unchanged.

## Tests updated

- **`components/planning/__tests__/WeekPlanner.test.tsx`**
  - Added a catalog color `AZUL` (`id: "azul"`) used by **no** print, and made
    `allColors = [AZUL, PIEL, ROJO, VERDE]` (name order). Prints are unchanged, so
    the existing full/partial/empty/worked-example assertions still hold (AZUL is
    never in `initialAvailableColorIds`, so matching is identical).
  - Extended the swatch test to assert `AZUL`'s swatch renders (R11).
  - **New test** "lists ALL catalog colors ordered by name, incl. one no print
    uses (R3, R11)": asserts the picker renders one checkbox per catalog color
    (4), in name order `[Azul, Piel, Rojo, Verde]`, and that `Azul` (unused by any
    print) is selectable — proving the source is the full catalog, not
    colors-used-by-prints. No other assertions weakened.
- No planning page/service test asserted the picker color source (none exists), so
  nothing else needed adjusting.

## Requirements satisfied / re-verified

- **R3 / R11 (picker source clarification):** picker lists ALL catalog colors
  ordered by name incl. an unused-by-prints color; swatches from `hex` —
  new/extended ColorPicker tests above.
- **R4 / R5 / R6 (matching) + worked example:** unchanged and still green — the
  existing `WeekPlanner` matcher tests pass with the augmented `allColors`.

## tasks.md

Marked the two previously-open items `[x]`: source the picker from the full Color
catalog, and update the component test to assert all catalog colors.

## Pipeline (credential-free, `corepack pnpm`)

- `typecheck` — green (`tsc --noEmit`, no errors).
- `lint` — green; only the 4 pre-existing `_a is defined but never used` warnings
  in the test file (not introduced by this change), no errors.
- `test` — **42 files passed, 424 tests passed** (one new test added).
  `lib/planning-core.ts` remains **100% branch** coverage (target intact);
  `lib/services/planning.ts` 100%.
- `build` — green; `/planning` route built successfully.
