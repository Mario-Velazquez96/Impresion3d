# Design — 07_weekly_planning

**Source:** `solution_design.md` §3, §4, §7; `client_requirement.md` §1.2, §4.4

## Approach

Schema + a pure color-match service + a planning UI. The matching logic is the
heart of the feature, so it is a framework-agnostic, fully unit-tested function.
The page is a Server Component that loads/creates the week plan and the inventory
with colors; the color picker, filter toggle, and day grid are Client islands
calling server actions. "Dry the day before" is **computed**, never stored.

## Schema & RLS

```prisma
enum Weekday { MON TUE WED THU FRI SAT SUN }
model WeekPlan {
  id String @id @default(cuid())
  weekStartDate DateTime @unique          // Monday of the week
  createdBy User @relation(fields:[createdById], references:[id], onDelete: Restrict)
  createdById String
  colors WeekPlanColor[]
  items WeekPlanItem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
model WeekPlanColor {
  weekPlan WeekPlan @relation(fields:[weekPlanId], references:[id], onDelete: Cascade)
  weekPlanId String
  color Color @relation(fields:[colorId], references:[id], onDelete: Restrict)
  colorId String
  @@id([weekPlanId, colorId])
}
model WeekPlanItem {
  id String @id @default(cuid())
  weekPlan WeekPlan @relation(fields:[weekPlanId], references:[id], onDelete: Cascade)
  weekPlanId String
  print Print @relation(fields:[printId], references:[id], onDelete: Restrict)
  printId String
  dayOfWeek Weekday
  position Int
  @@index([weekPlanId, dayOfWeek, position])
}
```

Migration `weekly_planning`. RLS SQL migration: enable on all three; authenticated
read/write.

## Color-match service (the core)

`lib/services/planning.ts` — pure functions over in-memory data:

```ts
type Match = { print: PrintWithColors; missingColorIds: string[] };
// availableIds: Set<string> of week's colorIds
fullMatches(prints, availableIds):    prints where every colorId ∈ availableIds
partialMatches(prints, availableIds): prints where some colorId ∈ availableIds
                                      AND not full; missingColorIds = print − available
```

- Full match = `print.colorIds.every(id => available.has(id))` (and ≥1 color).
- Partial = `some(...)` and not full; `missingColorIds = colorIds.filter(!available)`.
- Empty `availableIds` ⇒ both empty (R6).
- "Colors to dry on day D−1" = for each `WeekPlanItem` on day D, union its print's
  colorIds; map day→day−1 (MON's prep shows on the prior Sunday slot or a
  "previous week" note) (R9). Pure helper `dryingSchedule(items)`.

## File layout & boundaries

```
app/(app)/planning/page.tsx     # Server: resolve current week → getOrCreateWeekPlan; load prints+colors → <WeekPlanner>
  loading.tsx · error.tsx
components/planning/
  WeekPlanner.tsx (client)      # holds available-colors + mode state; composes the below
  ColorPicker.tsx (client)      # multi-select swatches → setWeekColors action
  MatchModeToggle.tsx (client)  # Full (default) / Partial button
  FilteredInventory.tsx (client)# results from the match service; "missing colors" badges in partial
  WeekGrid.tsx (client)         # 7 DayColumns; assign/move/remove; "dry the day before" panel
  DayColumn.tsx (client)        # day's items + a day <Select> (fallback) / droppable (optional dnd)
lib/services/planning.ts        # fullMatches, partialMatches, dryingSchedule, getOrCreateWeekPlan, setWeekColors, assign/move/remove item
lib/validation/planning.ts      # setWeekColorsSchema, assignItemSchema, moveItemSchema
actions/planning.ts             # "use server": requireUser + zod + revalidate('/planning')
```

- `setWeekColors`: upsert `WeekPlan` by `weekStartDate`, then replace
  `WeekPlanColor` set in a transaction (R3).
- Matching runs **server-side** in the page (and re-derived in the client when the
  mode toggles using data already sent) so results stay consistent.
- Day assignment: `assignPrintToDay` (end of day order, R7), `moveWeekItem`
  (day/position) + `removeWeekItem` (R8). dnd optional; **Select is the required
  fallback** so the slice ships without drag.

## Auth & security

- Every action `requireUser()` (R10). Per-request Supabase client. Internal tool:
  any authenticated user edits the shared plan (no per-row ownership).

## Validation

- `setWeekColorsSchema` { weekStartDate: date; colorIds: array(id) }.
- `assignItemSchema` { weekStartDate, printId, dayOfWeek: Weekday }.
- `moveItemSchema` { itemId, dayOfWeek, toIndex ≥ 0 }.

## Test approach

- **Vitest (core):** `fullMatches`/`partialMatches`/`dryingSchedule` — the worked
  example (R4/R5), empty-available (R6), missing-color computation, day−1 mapping
  incl. the MON edge case. This is the highest-value test set.
- **Component:** ColorPicker persists; MatchModeToggle switches lists; WeekGrid
  assign/move/remove calls actions; partial badges show missing colors.
- **E2E:** pick colors → full-match inventory → toggle partial (missing shown) →
  assign prints to days → week grid + dry-the-day-before list → reload persists.
- **RLS denial test:** unauthenticated planning read/write rejected (R2, R10).
- Coverage target: the match/drying functions **100% branches**; core E2E green.

## Open items / discrepancies

- Week start (Monday default) + date-picker snapping — confirm at gate.
- dnd vs Select for day assignment — Select required, dnd optional this slice.
