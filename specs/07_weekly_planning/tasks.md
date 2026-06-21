# Tasks — 07_weekly_planning

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Add `Weekday` enum + `WeekPlan`/`WeekPlanColor`/`WeekPlanItem` models; `prisma migrate dev --name weekly_planning` (R1)
- [ ] Write RLS SQL migration on all three planning tables (authenticated read/write) (R2)
- [ ] Implement `lib/services/planning.ts` match core: `fullMatches`, `partialMatches` (+ missing colors), `dryingSchedule` (day−1) (R4, R5, R6, R9)
- [ ] Implement `getOrCreateWeekPlan` + `setWeekColors` (upsert plan, replace color set in transaction) (R3)
- [ ] Implement `assignPrintToDay` (end position), `moveWeekItem`, `removeWeekItem` services (R7, R8)
- [ ] Add Zod `setWeekColorsSchema`, `assignItemSchema`, `moveItemSchema` (R3, R7, R8)
- [ ] Implement `actions/planning.ts` with `requireUser` + zod + `revalidatePath('/planning')` (R3, R7, R8, R10)
- [ ] Build `planning/page.tsx` server load (week plan + prints/colors, server-side matching) → `<WeekPlanner>` (R4–R6)
- [ ] Build `ColorPicker`, `MatchModeToggle`, `FilteredInventory` (missing-color badges), `WeekGrid`/`DayColumn` (Select fallback) + dry-the-day-before panel (R3–R9, R11)
- [ ] Write tests: Vitest (match core + drying incl. worked example + empty + MON edge); component (picker, toggle, assign/move/remove, missing badges); E2E (pick→filter→toggle→assign→grid→reload) (all R)
- [ ] Write the RLS denial test: unauthenticated cannot read/write planning tables (R2, R10)
- [ ] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- Unit (worked example): {Piel} → full; {Piel,Verde} → partial missing {Verde}; {Rojo Cochinilla} → neither (R4, R5); empty available → both empty (R6); day−1 drying incl. MON edge (R9).
- E2E: pick colors → full-match list → partial toggle shows missing → assign to days → grid + dry list → reload persists (R3, R7, R8).
- Component: move/remove persist (R8); swatches render (R11).
- RLS test: unauthenticated denied (R2, R10).
- Target: match/drying functions 100% branch coverage; core E2E green.
