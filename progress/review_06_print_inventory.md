# Review — 06_print_inventory

**Verdict: APPROVE.** The feature may be marked `done`.

All R1-R11 trace to real tests, all 12 tasks are genuinely done, the storage/security crux is correct, the two test fixes preserved their assertions, and the credential-free pipeline is GREEN.

## R1-R11 traceability

| Req | Maps to | Test(s) | Result |
| --- | --- | --- | --- |
| R1 Print model (printType Restrict) | schema + print_inventory migration | prints.test.ts createPrint fields; migration FK RESTRICT | PASS |
| R2 PrintColor join (composite PK, colorId Restrict) | schema + migration | prints.test.ts createMany rows; migration PK + Restrict | PASS |
| R3 RLS Print/PrintColor authenticated | print_inventory_rls | inventory-rls.spec anon SELECT/INSERT denied + allowed path | PASS (gated) |
| R4 private bucket + signed-URL TTL 3600 | print_photos_bucket; lib/storage.ts | storage.test.ts TTL 3600 + opaque key (never http); inventory-rls anon bucket denied | PASS |
| R5 create validate-upload-key-persist-revalidate | actions/services/storage | actions uploads valid photo; prints.test nested colors; PrintFormDialog; e2e | PASS |
| R6 edit + atomic color-set replace + replace photo | services updatePrint; storage replacePhoto | prints.test deleteMany+createMany in $transaction; actions replace; e2e edit | PASS |
| R7 admin delete rows + PrintColor + Storage | services deletePrint; requireAdmin | prints.test deletes in transaction then removes photo; e2e admin delete | PASS |
| R8 search + type/color filter | buildPrintWhere/listPrints; InventoryFilters | prints.test buildPrintWhere + single-query; PrintGrid empty; e2e filter | PASS |
| R9 non-admin delete rejected, no write | actions ensureAdmin first | actions rejects non-admin NO DB/Storage + unauthenticated; e2e employee no-delete | PASS |
| R10 oversized/wrong-type/zero-color rejected, store nothing | validation/print.ts; actions validate-before-upload | print.test (>=1 color/size/mime/exact-limit); actions zero-color/oversized/bad-mime before upload | PASS |
| R11 render swatches from hex | ColorSwatches/PrintCard/Grid/detail | PrintGrid.test swatch from each hex; e2e swatches | PASS |

## Task completeness

All 12 tasks.md items [x] and genuinely done (spot-checked against code): models+migration, RLS SQL, private bucket SQL, storage helpers, Zod schemas + photoConstraints, prints service, actions, pages+grid+detail, client islands, unit/component/E2E tests, RLS denial test, pipeline. The three apply steps are committed as version-controlled migrations; applying them is the gated follow-up.

## Storage / security crux

- Bucket migration: PRIVATE (public = false), idempotent (bucket ON CONFLICT DO NOTHING; each policy DROP IF EXISTS then create); storage.objects policies SELECT/INSERT/UPDATE/DELETE scoped to bucket_id = print-photos for authenticated. Correct.
- lib/storage.ts: reads go ONLY through createSignedUrl (TTL constant 3600); never returns/stores a public or stored URL; keys are prints/<uuid>.<ext> (unguessable, safe-extension only). uploadPhoto returns the key, throws on error so the action aborts before the DB write.
- Validate-before-upload (R10): actions run requireUser/requireAdmin FIRST, then Zod field validation, then the file size/mime guard - all BEFORE any uploadPhoto/replacePhoto/DB write. Genuinely tested: oversized, disallowed mime, zero-color all rejected before upload/DB - each asserts upload/create mocks NOT called.
- deletePrint: action ensureAdmin first; service removes PrintColor + Print in $transaction, THEN removes the Storage object after commit; non-admin and unauthenticated reject with NO deletePrint call.
- Atomic color-set replace (R6): updatePrint does update + deleteMany + createMany inside one prisma.$transaction; photoPath only written when a key is supplied. Tested.
- Filter (R8): buildPrintWhere composes q (name contains, insensitive, trimmed), type, color (colors.some.colorId); listPrints is a single query with select (no N+1). Tested.
- Catalog delete-guard: services/prints.ts registers BOTH a printType counter and a color counter with the 02 registry, matching the 03/05 side-effect pattern. Sound.

## Two test fixes - assertions preserved (verified)

- storage.test.ts TS2556 fix (createClient: () => createClientMock()): the suite STILL asserts upload returns a generated key and key.not.toMatch(^https?:), createSignedUrl called with SIGNED_URL_TTL_SECONDS (=3600), and remove called on delete. No assertion weakened.
- actions/prints.test.ts (hoisting + real-File fix): ForbiddenError moved into vi.hoisted; makeFile now builds a REAL new File([...]) with size overridden via Object.defineProperty, so the 6 MB case genuinely hits the oversized branch (and value instanceof File holds). Non-admin / unauthenticated tests assert NO deletePrint call. Nothing loosened to pass.

## Schema

Print/PrintColor match the spec: printType onDelete: Restrict, colorId Restrict, printId Cascade, composite PK (printId, colorId), indexes on printTypeId, name, colorId. 07 weekItems relation correctly NOT added (only a deferral comment remains - no 07 model/route/env/dep leaked in).

## Boundary

/inventory + /inventory/[printId] are Server Components (requireUser guard, signed URLs generated at render via signPhoto, Promise.all to avoid a waterfall). Interactivity isolated to client islands (InventoryFilters, PrintFormDialog, ColorMultiSelect, DeletePrintButton). Delete control rendered only for user.role === ADMIN, with the action enforcing requireAdmin as the real gate. next/image uses unoptimized, so no remote-host config needed.

## Coverage (against the spec target: services + schema + storage branches)

- lib/services/prints.ts - 100% lines / 100% branches.
- lib/storage.ts - 100% lines / 94.7% branches (lone uncovered: extensionFor no-dot early return, exercised indirectly).
- lib/validation/print.ts - 93.75% lines / 84.2% branches.
- components/inventory: PrintCard/PrintGrid/ColorSwatches 100, ColorMultiSelect 96.9, PrintFormDialog ~90. InventoryFilters.tsx and DeletePrintButton.tsx 0% unit - thin URL-param / single-form islands exercised by the credential-gated E2E, matching how prior features tested pure-interaction islands. The stated target (service/schema/storage branches) is fully met. Acceptable.

## Pipeline reproduced

- corepack pnpm typecheck - PASS (0 errors).
- corepack pnpm lint - PASS (no ESLint warnings or errors).
- corepack pnpm test - PASS: 38 files, 367 tests, 0 failing.
- corepack pnpm build - PASS; /inventory + /inventory/[printId] are dynamic server routes.
- No new runtime dependency (package.json / pnpm-lock.yaml unchanged); .env.example unchanged (bucket name is a code constant).

## Gated stages (not grounds for rejection; verified by inspection)

Migration SQL (tables/RLS/bucket), RLS spec, and E2E specs all exist and are correct. Follow-up commands documented in the impl report (incl. applying the bucket migration). Run against dev/staging only.
