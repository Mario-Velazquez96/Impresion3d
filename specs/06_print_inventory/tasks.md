# Tasks — 06_print_inventory

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Add `Print` + `PrintColor` models; `prisma migrate dev --name print_inventory` (R1, R2)
- [ ] Write RLS SQL migration on `Print`/`PrintColor` (authenticated read/write) (R3)
- [ ] Create private `print-photos` bucket + access policies (SQL migration) (R4)
- [ ] Implement `lib/storage.ts` (upload/replace/remove + createSignedUrl, server-only) (R4, R5, R6, R7)
- [ ] Add Zod `createPrintSchema`/`updatePrintSchema` (≥1 color, int fields, URL) + `photoConstraints` (R5, R10)
- [ ] Implement `lib/services/prints.ts` (list w/ filters, get, create, update w/ color-set replace, delete, signPhoto) (R5–R8)
- [ ] Implement `actions/prints.ts` (requireUser create/edit; requireAdmin delete) handling FormData upload (R5–R7, R9)
- [ ] Build `inventory/page.tsx` + `<PrintGrid>`/`<PrintCard>` (signed URLs, swatches) + `[printId]/page.tsx` detail (R8, R11)
- [ ] Build `InventoryFilters`, `PrintFormDialog`, `ColorMultiSelect` (R8, R11)
- [ ] Write tests: Vitest (schema, filter where, color-set replace, file guard); component (upload form, multi-select, swatches); E2E (create/edit/delete, search/filter) (all R)
- [ ] Write the RLS denial test: unauthenticated cannot read/write prints or bucket (R3, R4)
- [ ] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- E2E: create w/ photo+colors → signed image + swatches (R5, R11); edit swaps colors + replaces photo (R6); admin delete removes Storage object (R7); employee delete blocked (R9); search/type/color filter (R8).
- Unit: ≥1 color enforced + oversized/bad-type rejected (R10); filter where (R8).
- RLS test: unauthenticated denied; bucket needs auth (R3, R4).
- Target: service/schema/storage branches covered.
