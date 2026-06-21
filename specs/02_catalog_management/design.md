# Design — 02_catalog_management

**Source:** `solution_design.md` §3 (data model), §5 (catalog actions), §9; `client_requirement.md` §4.5, §4.6

## Approach

Schema + RLS + seed + Admin UI for four near-identical catalogs. The CRUD code
path is parameterized over the catalog (one generic service/UI driven by config)
to avoid four copies, but each keeps its own Zod schema and RLS policy.

## Schema & RLS

```prisma
model Color        { id String @id @default(cuid()) name String @unique hex String createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model PrintType    { id String @id @default(cuid()) name String @unique createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model SupplyType   { id String @id @default(cuid()) name String @unique createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model TaskCategory { id String @id @default(cuid()) name String @unique createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
```

Migration `catalogs`. RLS SQL migration per table: `ENABLE ROW LEVEL SECURITY`;
`SELECT` to any authenticated role; `INSERT/UPDATE/DELETE` only where the caller
is `ADMIN` (same admin predicate as `01`). Referencing FKs in later features use
`onDelete: Restrict` so an in-use value can't be deleted (R6).

## Seed

`prisma/seed.ts` — idempotent upserts keyed on `name`:
- Colors: `Azul Ballena MM`, `Café Moka MM`, `Piel MM`, `Verde Iguana MM`,
  `Rojo Cochinilla MM`, `Rojo Nochebuena MM` (assign reasonable `#RRGGBB` hexes;
  confirm shades at the gate).
- TaskCategory: Printer maintenance, Design creation, Purchases, Customer follow-up.
- PrintType: keychain, frame, deckbox.

## File layout & boundaries

```
app/(app)/admin/catalogs/page.tsx     # Server: load all four catalogs → <CatalogTabs>
components/catalogs/
  CatalogTabs.tsx (client)            # shadcn Tabs: one CatalogTable per catalog
  CatalogTable.tsx (client)           # rows + add/edit dialog + delete; color tab shows swatch + hex input
lib/services/catalogs.ts              # generic list/create/update/delete + isCatalogValueInUse()
lib/validation/catalog.ts             # colorSchema (name, hex regex), nameOnlySchema
actions/catalogs.ts                   # "use server": create/update/delete per catalog, requireAdmin()
```

- Generic action signature keyed by catalog name → maps to the right
  service/schema. Color uses `colorSchema` (adds `hex`), others `nameOnlySchema`.
- Delete path: call `isCatalogValueInUse(catalog, id)` (count referencing rows);
  if >0 reject (R6); else delete, relying on `Restrict` as the hard backstop.

## Auth & security

- Every mutation calls `requireAdmin()` (R7). Reads allowed to any authenticated
  user (later forms need them). Per-request Supabase client.

## Validation

- `colorSchema` { name: min 1, hex: `/^#[0-9a-fA-F]{6}$/` }.
- `nameOnlySchema` { name: min 1 }. Unique-name violations mapped to a field error
  (R5) by catching the Prisma `P2002`.

## Test approach

- **Vitest:** seed idempotency, `isCatalogValueInUse`, schemas (hex regex), unique
  collision → field error.
- **Component:** CatalogTable add/edit/delete calls actions; color swatch renders.
- **E2E:** admin adds/renames/deletes a value; delete-in-use blocked; employee
  cannot open `/admin/catalogs`.
- **RLS denial test:** non-admin cannot insert/update/delete any catalog (R2).
- Coverage target: services + schemas branch-complete; the delete-guard path
  tested both ways.

## Open items / discrepancies

- Exact hex shades for the 6 colors — confirm at the gate.
- Hard `Restrict` vs soft-delete — default `Restrict`.
