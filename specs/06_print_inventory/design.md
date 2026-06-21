# Design — 06_print_inventory

**Source:** `solution_design.md` §3, §6 (Storage/signed URLs); `client_requirement.md` §4.3

## Approach

Schema + Storage + CRUD + server-rendered grid. The list/detail are Server
Components (fetch + generate signed URLs server-side); the create/edit form is a
Client island that uploads via a server action. Color set is replaced atomically
in a transaction.

## Schema & RLS

```prisma
model Print {
  id String @id @default(cuid())
  name String
  printTimeMinutes Int
  filamentGrams Int
  photoPath String?            // Storage object key
  documentUrl String?
  printType PrintType @relation(fields:[printTypeId], references:[id], onDelete: Restrict)
  printTypeId String
  colors PrintColor[]
  weekItems WeekPlanItem[]     // (referenced by 07)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([printTypeId]) @@index([name])
}
model PrintColor {
  print Print @relation(fields:[printId], references:[id], onDelete: Cascade)
  printId String
  color Color @relation(fields:[colorId], references:[id], onDelete: Restrict)
  colorId String
  @@id([printId, colorId]) @@index([colorId])
}
```

Migration `print_inventory`. RLS SQL migration: enable on both; authenticated
read/write. Storage: create bucket `print-photos` (private) + policies (SELECT/
INSERT/UPDATE/DELETE for `authenticated`) in a version-controlled SQL migration.

## File layout & boundaries

```
app/(app)/inventory/
  page.tsx                     # Server: parse searchParams → listPrints(filters); signed URLs → <PrintGrid>
  [printId]/page.tsx           # Server: print detail + signed URL
  loading.tsx · error.tsx
components/inventory/
  PrintGrid.tsx (server)       # cards with photo + name + type + color swatches
  PrintCard.tsx (server)
  InventoryFilters.tsx (client)# search + type/color filters → searchParams
  PrintFormDialog.tsx (client) # create/edit; file input + ColorMultiSelect
  ColorMultiSelect.tsx (client)# multi-select of colors with swatches
lib/services/prints.ts         # listPrints(filters), getPrint, createPrint, updatePrint, deletePrint, signPhoto
lib/storage.ts                 # upload/replace/remove object + createSignedUrl (server-only)
lib/validation/print.ts        # createPrintSchema, updatePrintSchema, photoConstraints
actions/prints.ts              # "use server": requireUser (create/edit), requireAdmin (delete)
```

- **Upload:** the form posts `FormData` (fields + file) to the action; the action
  validates, calls `lib/storage.upload`, then writes the row in a transaction that
  also resets `PrintColor` (deleteMany + createMany) (R5, R6).
- **Signed URLs:** generated in Server Components / `signPhoto` at render time
  (TTL ~1h) — never store public URLs (R4).
- **Delete:** transaction removes `PrintColor` + `Print`, then removes the Storage
  object (R7); admin-only (R9).
- **Search/filter:** `where` from `?q=` (name contains, case-insensitive),
  `?type=`, `?color=` (some `colors` relation) (R8). Single query with `include`.

## Auth & security

- `createPrint`/`updatePrint`: `requireUser()`. `deletePrint`: `requireAdmin()`
  (R9). Storage ops run server-side with the per-request authenticated client;
  secret key not needed for user-scoped bucket ops.

## Validation

- `createPrintSchema` { name: min 1; printTimeMinutes: int ≥ 0; filamentGrams:
  int ≥ 0; documentUrl?: url; printTypeId: id; colorIds: array(id).min(1) } (R10).
- File: max size + mime allowlist (`photoConstraints`) checked in the action (R10).

## Test approach

- **Vitest:** schema (≥1 color required, int fields, URL), filter `where` builder,
  the color-set replace logic, file-constraint guard.
- **Component:** PrintFormDialog upload + ColorMultiSelect; grid renders swatches.
- **E2E:** create print w/ photo + colors → grid shows signed image + swatches;
  edit (swap colors + replace photo); admin delete removes image; employee delete
  blocked; search + type/color filter.
- **RLS denial test:** unauthenticated read/write rejected; bucket read requires
  auth (R3, R4).
- Coverage target: services + schema + storage helper branches covered.

## Open items / discrepancies

- Signed-URL TTL + image size/type limits — confirm at the gate.
- Thumbnails out of scope (serve original).
