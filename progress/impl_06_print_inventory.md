# Implementation — 06_print_inventory

**Status:** Code-complete; full credential-free pipeline GREEN. Ready for review.
Credential-gated stages (migrations + bucket/policies apply, real Storage round-
trips, Playwright E2E/RLS) are written but not executed here (no `.env.local`).

This was a RESUME of an interrupted run. Most code already existed and was verified
correct; this session closed the known gaps (typecheck fix, component tests, E2E
specs, and two broken unit tests the prior run left behind) and ran the pipeline.

## Tasks completed (all of `tasks.md`)

All 12 task items are checked `[x]` in `specs/06_print_inventory/tasks.md`. The
three credential-gated "apply" steps (migrate dev, RLS migration, bucket migration)
are committed as version-controlled migrations; applying them to dev/staging is the
human follow-up below.

## Requirement traceability (R1–R11)

- **R1** (`Print` model: name, printTimeMinutes, filamentGrams, photoPath?,
  documentUrl?, printTypeId → PrintType onDelete:Restrict).
  `prisma/schema.prisma` model `Print`.
  Covered by: `lib/services/__tests__/prints.test.ts > createPrint…` (asserts the
  persisted fields) and `prisma/migrations/20260622120000_print_inventory`.
- **R2** (`PrintColor` join, composite PK, colorId onDelete:Restrict).
  `prisma/schema.prisma` model `PrintColor`.
  Covered by: `prints.test.ts > updatePrint…deleteMany + createMany` (the join
  rows) and the migration SQL.
- **R3** (RLS on Print/PrintColor, authenticated-only).
  `prisma/migrations/20260622120100_print_inventory_rls/migration.sql`.
  Covered by: `e2e/inventory-rls.spec.ts > "RLS denies the unauthenticated path on
  Print + PrintColor (R3)"` and the signed-in allowed-path test (credential-gated,
  skips without Supabase + employee creds).
- **R4** (private `print-photos` bucket, authenticated policies, signed-URL reads
  TTL 3600).
  `prisma/migrations/20260622120200_print_photos_bucket/migration.sql` +
  `lib/storage.ts` (`SIGNED_URL_TTL_SECONDS = 3600`, `createSignedUrl`).
  Covered by: `lib/__tests__/storage.test.ts > "createSignedUrl (R4) — TTL 3600,
  null-safe"` (asserts the 3600 TTL + opaque-key, never an http URL) and
  `e2e/inventory-rls.spec.ts > "the private print-photos bucket rejects the
  unauthenticated path (R4)"`.
- **R5** (create: validate → upload → store key → persist row + colors →
  revalidate).
  `actions/prints.ts createPrintAction`; `lib/services/prints.ts createPrint`;
  `lib/storage.ts uploadPhoto`.
  Covered by: `actions/__tests__/prints.test.ts > "uploads a valid photo then
  persists with its key"`, `prints.test.ts > createPrint…nested color set`,
  `components/inventory/__tests__/PrintFormDialog.test.tsx > "submits fields, the
  photo file, and the selected colors"`, and `e2e/inventory.spec.ts` create flow.
- **R6** (edit: update fields + replace color set atomically; replace photo if a
  new one is provided).
  `actions/prints.ts updatePrintAction`; `lib/services/prints.ts updatePrint`
  (`$transaction` deleteMany + createMany); `lib/storage.ts replacePhoto`.
  Covered by: `prints.test.ts > "updates fields and replaces the color set via
  deleteMany + createMany in $transaction"` and `"leaves photoPath untouched when
  …undefined"`; `actions/prints.test.ts > "replaces the photo (reads existing key)
  then updates with the new key"`; `PrintFormDialog.test.tsx > edit (swaps a
  color)`; `e2e/inventory.spec.ts` edit flow.
- **R7** (admin delete removes row + PrintColor rows + Storage object).
  `actions/prints.ts deletePrintAction`; `lib/services/prints.ts deletePrint`.
  Covered by: `prints.test.ts > "deletes PrintColor + Print in a transaction and
  removes the photo after commit"`; `e2e/inventory.spec.ts` admin delete.
- **R8** (search + type/color filter narrows the list).
  `lib/services/prints.ts buildPrintWhere`/`listPrints`; `components/inventory/
  InventoryFilters.tsx`; `app/(app)/inventory/page.tsx`.
  Covered by: `prints.test.ts > "buildPrintWhere (R8 …)"` (q/type/color + compose)
  and `"listPrints (R8 — single query…)"`; `PrintGrid.test.tsx` empty state;
  `e2e/inventory.spec.ts > "search and type/color filters narrow the grid (R8)"`.
- **R9** (non-admin deletePrint rejected, no DB/Storage write).
  `actions/prints.ts ensureAdmin` (requireAdmin FIRST).
  Covered by: `actions/prints.test.ts > "rejects a non-admin with NO DB or Storage
  write"` and `"rejects an unauthenticated caller"`; `e2e/inventory.spec.ts >
  "employee can create a print but cannot delete (R9)"`.
- **R10** (oversized/wrong-type file OR zero colors rejected with a field error,
  store nothing).
  `lib/validation/print.ts` (`colorIds.min(1)`, `validatePhotoFile`,
  `photoConstraints`); `actions/prints.ts` (validate fields + file BEFORE any
  upload/DB write).
  Covered by: `lib/validation/__tests__/print.test.ts` (≥1 color, int/URL rules,
  size + mime guard incl. exact-limit edge); `actions/prints.test.ts > "rejects
  zero colors before any upload/DB write"`, `"rejects an oversized photo BEFORE
  uploading"`, `"rejects a disallowed mime type before uploading"`;
  `PrintFormDialog.test.tsx > "blocks a zero-color submission…"` and the bad-photo
  field-error render.
- **R11** (where a print has colors, render each swatch from its `hex`).
  `components/inventory/ColorSwatches.tsx`, `PrintCard.tsx`, `PrintGrid.tsx`,
  detail page.
  Covered by: `components/inventory/__tests__/PrintGrid.test.tsx > "renders a color
  swatch coloured from each color's hex (R11)"` (+ signed-image + empty/No-colors
  fallbacks); `e2e/inventory.spec.ts` asserts swatches on the card.

## Pipeline results (credential-free, all GREEN)

- `corepack pnpm typecheck` — PASS (0 errors).
- `corepack pnpm lint` — PASS (no ESLint warnings or errors).
- `corepack pnpm test` (vitest run --coverage) — PASS: **38 files, 367 tests, 0
  failing**. 06 test counts: `lib/validation/print.test.ts` 16,
  `lib/__tests__/storage.test.ts` 13, `lib/services/prints.test.ts` 18,
  `actions/prints.test.ts` 14, `components/inventory/PrintFormDialog.test.tsx` 4,
  `components/inventory/PrintGrid.test.tsx` 6.
- `corepack pnpm build` — PASS; `/inventory` and `/inventory/[printId]` compile as
  dynamic server routes.

### Coverage (spec target = services + schema + storage-helper branches)

- `lib/services/prints.ts` — **100%** lines / 100% branches.
- `lib/storage.ts` — **100%** lines / 94.7% branches (the one uncovered branch is
  the `extensionFor` no-dot early return, line 36 — exercised indirectly).
- `lib/validation/print.ts` — **93.75%** lines / 84.2% branches (uncovered lines
  32–36 are the empty-string superRefine path on a numeric field).
- `components/inventory`: `PrintCard.tsx` 100, `PrintGrid.tsx` 100,
  `ColorSwatches.tsx` 100, `ColorMultiSelect.tsx` 96.9, `PrintFormDialog.tsx` 90.
  `InventoryFilters.tsx` and `DeletePrintButton.tsx` are 0% in unit coverage — they
  are thin client islands (URL-param navigation / a single delete form) whose
  behaviour is exercised by the credential-gated E2E flows, matching how earlier
  features tested pure-interaction islands. The spec's stated coverage target
  (service/schema/storage branches) is fully met.

## Credential-gated stages — exact follow-up commands

No `.env.local` exists here, so these were written but NOT executed. Run against
the **dev/staging** Supabase project only (never production):

1. Apply schema + RLS + bucket migrations:
   ```
   corepack pnpm prisma migrate dev
   corepack pnpm prisma migrate status   # confirm all three 06 migrations applied
   ```
   This applies, in order: `20260622120000_print_inventory` (tables),
   `20260622120100_print_inventory_rls` (RLS), and
   `20260622120200_print_photos_bucket` (the **private bucket + storage.objects
   policies** — this is the step that provisions `print-photos`).
2. Real upload / signed-URL round-trip + UI flows + RLS denial:
   ```
   corepack pnpm test:e2e
   ```
   Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the existing
   `E2E_ADMIN_EMAIL/PASSWORD` + `E2E_EMPLOYEE_EMAIL/PASSWORD` accounts. The new
   specs (`e2e/inventory.spec.ts`, `e2e/inventory-rls.spec.ts`) `test.skip` when
   those vars are absent, mirroring the existing `e2e/*-rls.spec.ts` pattern.

## Files created this session

- `components/inventory/__tests__/PrintFormDialog.test.tsx` — create submits
  fields + photo file + repeated colorIds; returned field error renders; zero-color
  blocked at the form/schema boundary; edit prefills + swaps a color (R5, R6, R10,
  R11).
- `components/inventory/__tests__/PrintGrid.test.tsx` — empty state, signed-image
  render, No-photo / No-colors fallbacks, hex swatches (R8, R11). Mocks `next/image`
  + `next/link` so the Server-Component cards render in jsdom.
- `e2e/inventory.spec.ts` — signed-out redirect; admin create-with-photo+colors →
  signed image + swatches → edit (swap colors + replace photo) → admin delete;
  search + type/color filter; employee create-but-no-delete (R5–R9, R11).
- `e2e/inventory-rls.spec.ts` — anon SELECT/INSERT on Print/PrintColor denied; anon
  bucket list/download denied; signed-in employee allowed-path (R3, R4).

## Files changed this session

- `lib/__tests__/storage.test.ts` — **typecheck fix (TS2556)**: the
  `@/lib/supabase/server` mock was `createClient: (...a: unknown[]) =>
  createClientMock(...a)`, but the real `createClient()` takes zero args, so
  spreading an `unknown[]` rest into it failed strict typecheck. Changed to
  `createClient: () => createClientMock()`. All assertions preserved — the test
  still verifies upload returns a generated key (not an http URL), `createSignedUrl`
  is called with TTL 3600, and `remove` is invoked on delete.
- `actions/__tests__/prints.test.ts` — **two broken-test fixes** (the suite was
  un-runnable / had 5 failures the prior run left behind):
  1. *Mock hoisting:* `vi.mock("@/lib/auth")` referenced a top-level
     `class ForbiddenError`, which is in its temporal dead zone when the hoisted
     mock factory runs (`ReferenceError: Cannot access 'ForbiddenError' before
     initialization`). Moved the class into the `vi.hoisted(() => …)` block.
  2. *`makeFile` produced a plain object* cast as `File`; `FormData.set(...)`
     stringifies a non-Blob and `value instanceof File` is false, so the action
     treated every "uploaded" photo as absent (5 failures). Replaced with a real
     `new File([...])` whose `size` is overridden via `Object.defineProperty` to
     hit the size-limit branches without allocating bytes. No assertions weakened —
     all 14 action tests now pass.
- `specs/06_print_inventory/tasks.md` — all items checked `[x]`.

## Deviations / notes

- **Storage mocking in unit tests:** the Supabase Storage client is mocked at the
  `@/lib/supabase/server.createClient` boundary (`storage.test.ts`) and at the
  `@/lib/storage` boundary in the service/action tests — so no real Supabase is
  needed offline. Real upload/sign/remove round-trips are deferred to the
  credential-gated E2E.
- **Object-key generation:** `lib/storage.buildPhotoKey` produces
  `prints/<uuid>.<ext>` (lowercased, alnum-only extension or dropped). Keys are
  unguessable; reads go only through `createSignedUrl` (never a public/stored URL).
- **Validate-before-upload ordering (R10):** the actions Zod-validate fields AND
  run `validatePhotoFile` BEFORE any `uploadPhoto`/DB write, and `requireUser`/
  `requireAdmin` run FIRST of all — verified by the "before any upload/DB write" and
  "NO DB or Storage write" action tests.
- **`PrintFormDialog` file-input test:** jsdom does not serialize a file input into
  the React form-action `FormData`, so the create test asserts the File on the input
  element (name/type/accept) plus the non-file fields and repeated colorIds in the
  posted FormData. Real multipart upload is covered by `e2e/inventory.spec.ts`
  (`setInputFiles`).
- **Benign React warning:** `PrintFormDialog`'s `<form>` sets
  `encType="multipart/form-data"` while using a function action; React logs that it
  overrides encType (it handles multipart automatically for function actions). Left
  as-is — it is the prior run's working component code, the warning is cosmetic, and
  rewriting it is out of scope for this resume.
- **`.env.example`:** no additions required. The inventory E2E/RLS specs reuse the
  existing `NEXT_PUBLIC_SUPABASE_*` + `E2E_ADMIN_*`/`E2E_EMPLOYEE_*` keys; the bucket
  name `print-photos` is a code constant (`PRINT_PHOTOS_BUCKET`), not an env var.
- **Not marked `done`:** awaiting reviewer approval per the SDD flow.
