# Tasks — 02_catalog_management

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Add `Color`, `PrintType`, `SupplyType`, `TaskCategory` models; `prisma migrate dev --name catalogs` (R1)
- [ ] Write RLS SQL migration: authenticated read, admin-only write on all four tables (R2)
- [ ] Write idempotent `prisma/seed.ts` (6 colors + hex, 4 categories, 3 print types) (R3)
- [ ] Add Zod `colorSchema` (hex regex) + `nameOnlySchema` (R4, R5)
- [ ] Implement `lib/services/catalogs.ts` generic CRUD + `isCatalogValueInUse` (R4, R6)
- [ ] Implement `actions/catalogs.ts` create/update/delete with `requireAdmin()`; map P2002 → field error (R4, R5, R7)
- [ ] Build `admin/catalogs/page.tsx` + `<CatalogTabs>` + `<CatalogTable>` with color swatch (R4, R8)
- [ ] Wire delete-guard in UI + action (block in-use values with message) (R6)
- [ ] Write tests: Vitest (seed idempotency, in-use check, hex regex, unique collision); component (table CRUD, swatch); E2E (admin CRUD, delete-in-use blocked, employee blocked) (all R)
- [ ] Write the RLS denial test: non-admin cannot mutate any catalog (R2)
- [ ] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- Seed twice → no duplicates (R3). | Add/rename/delete each catalog via UI (R4).
- Delete an in-use value → blocked with message (R6). | Duplicate name → field error (R5).
- RLS test: employee insert/update/delete denied (R2, R7). | Color swatch visible (R8).
- Target: service/schema branches covered; delete-guard tested in-use + free.
