# Requirements — 07_weekly_planning

**Feature:** Weekly planning with color filtering
**Source:** `client_requirement.md` §1.2, §4.4; `solution_design.md` §3, §7
**Depends on:** 06_print_inventory

## Purpose

The portal's central, business-defining tool. Because filament must be dried a day
before use (high humidity), the user picks which **colors** will be dried for the
week; the system filters the inventory to the prints producible with those colors,
the user assigns chosen prints to days (Mon–Sun), and the week view shows what
prints each day plus which colors must be dried the day before. The filter offers
a **full-match** default and a **partial-match** mode that surfaces missing colors.

## In scope

- `WeekPlan` (one per `weekStartDate`), `WeekPlanColor` (week's available colors),
  `WeekPlanItem` (print assigned to a day) + migration + RLS.
- A color-match service: full match (all of a print's colors available) and
  partial match (≥1 available, listing the missing colors).
- Planning UI: week color picker, the filtered inventory with a full/partial
  toggle, assigning prints to days, and a per-day "dry the day before" indicator.

## Out of scope

- Linking the week's colors to filament stock/expenses (future, brief §6).
- Multi-week templates / recurring plans (future).

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall define `WeekPlan` (`weekStartDate` unique,
`createdById`), `WeekPlanColor` (`weekPlanId`, `colorId`, composite PK), and
`WeekPlanItem` (`weekPlanId`, `printId`, `dayOfWeek` enum Mon–Sun, integer
`position`).

**R2 (Ubiquitous):** The planning tables shall have RLS enabled so only
authenticated users may read or write.

**R3 (Event-driven):** When a user selects the set of colors available for a week,
the system shall persist them as `WeekPlanColor` rows (replacing the prior set) for
that week's `WeekPlan`, creating the `WeekPlan` if absent.

**R4 (State-driven / full match — default):** While the filter is in full-match
mode, the system shall list only prints whose entire color set is contained in the
week's available colors.

**R5 (State-driven / partial match):** While the filter is in partial-match mode,
the system shall list prints sharing at least one color with the week's available
colors, and for each shall list the colors that are missing.

**R6 (Unwanted behavior):** If no colors are selected for the week, then full-match
shall list no prints and partial-match shall list no prints (empty available set
matches nothing), with an empty-state message.

**R7 (Event-driven):** When a user assigns a print to a day, the system shall
create a `WeekPlanItem` for that day at the end of the day's order and reflect it
in the week view.

**R8 (Event-driven):** When a user moves or removes a planned print, the system
shall persist the new day/position or deletion and update the week view.

**R9 (Ubiquitous / derived):** For each planned print on day D, the week view
shall indicate that the print's colors must be dried on day D−1 (derived, not
stored), aggregated into a per-day "colors to dry" list.

**R10 (Unwanted behavior):** If any planning mutation is invoked without an
authenticated user, then the system shall reject it and make no DB write.

**R11 (Optional):** Where colors appear in the picker, filter results, or
dry-the-day-before list, the system shall render each color's swatch from its `hex`.

## Acceptance

- The user selects dried colors for a week; the inventory filters to producible
  prints in full-match by default.
- Toggling partial match shows additional prints and their missing colors.
- The user assigns prints to specific days; the week grid (Mon–Sun) shows each
  day's prints and the "colors to dry the day before" derived list.
- Moving/removing a planned print updates the grid and persists across reload.
- With no colors selected, both modes show an informative empty state.

## Acceptance — worked example (from the brief)

Available colors = {Piel MM, Café Moka MM, Azul Ballena MM}:
- A print using {Piel MM} → **full match**.
- A print using {Piel MM, Verde Iguana MM} → **partial match**, missing
  {Verde Iguana MM}.
- A print using {Rojo Cochinilla MM} → not shown in either mode.

## Open items

- Week selection UX (date picker snapping to Monday) and whether Sunday or Monday
  starts the week — default Monday start, confirm at the gate.
- Whether to enable dnd for day assignment in this slice or ship the Select
  fallback first — default: Select fallback required, dnd optional enhancement.
