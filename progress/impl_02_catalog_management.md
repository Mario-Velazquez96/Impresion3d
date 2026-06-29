# Implementation — 02_catalog_management

**Feature:** Manageable catalogs (Colors, Print Types, Supply Types, Task
Categories) — Admin-only CRUD with RLS, idempotent seed, and a delete-guard.
**Status:** Implemented; credential-free pipeline green. Live-DB/E2E stages are
credential-gated (no `.env.local` present). Awaiting reviewer.
**Gate decisions applied:** delete strategy = hard `Restrict` + friendly in-use
pre-check (no soft-delete); seed color hexes = sensible `#RRGGBB` defaults
(editable later via the catalog UI).

## Tasks (all checked in `specs/02_catalog_management/tasks.md`)

1. [x] Models `Color`/`PrintType`/`SupplyType`/`TaskCategory` + migration (R1)
2. [x] RLS SQL migration: authenticated read, admin-only write, all four (R2)
3. [x] Idempotent `prisma/seed.ts` (6 colors+hex, 4 categories, 3 print types) (R3)
4. [x] Zod `colorSchema` (hex regex) + `nameOnlySchema` (R4, R5)
5. [x] `lib/services/catalogs.ts` generic CRUD + `isCatalogValueInUse` (R4, R6)
6. [x] `actions/catalogs.ts` create/update/delete; `requireAdmin()` first; P2002 → field error (R4, R5, R7)
7. [x] `app/admin/catalogs/page.tsx` + `<CatalogTabs>` + `<CatalogTable>` (swatch) (R4, R8)
8. [x] Delete-guard wired in action + UI (block in-use with message) (R6)
9. [x] Vitest (seed idempotency, in-use, hex regex, unique collision) + component (table CRUD, swatch) + E2E
10. [x] RLS denial E2E for catalogs (R2)
11. [x] typecheck + lint + test + build pass; coverage target met

## Requirement traceability (R1–R8)

- **R1 — four models with unique `name`.** Added to `prisma/schema.prisma` (Color
  also has `hex`). Migration `20260622093000_catalogs/migration.sql` creates the
  four tables + unique indexes on `name`. Covered by: `prisma/schema.prisma`
  parses/`prisma generate` succeeds; the schema models drive the service tests in
  `lib/services/__tests__/catalogs.test.ts` (delegate routing per catalog).

- **R2 — RLS: authenticated read, admin-only write.** `20260622093100_catalogs_rls
  /migration.sql` enables+forces RLS on each table; `SELECT TO authenticated USING
  (true)`; `INSERT/UPDATE/DELETE` gated by `public.is_admin()` (the SECURITY
  DEFINER predicate from the 01 `user_rls` migration). Covered by:
  `e2e/catalogs-rls.spec.ts > "RLS lets an employee read catalogs but blocks
  writes (R2, R7)"` (credential-gated). Server-layer equivalent: every action
  rejects non-admins (R7 tests).

- **R3 — idempotent seed.** `prisma/seed.ts` upserts keyed on `name` (colors
  refresh `hex`; name-only catalogs no-op on re-run). Covered by
  `prisma/__tests__/seed.test.ts`: `"defines exactly the brief's initial values"`,
  `"upserts every value keyed on name"`, `"refreshes color hex on update but
  no-ops name-only catalogs"`, `"issues the same upserts on a second run (creates
  no duplicates)"`.

- **R4 — validate + persist + revalidate on admin submit.** `actions/catalogs.ts`
  (`createCatalog`/`updateCatalog`) Zod-validate then call the service then
  `revalidatePath("/admin/catalogs")`. Covered by `actions/__tests__/catalogs.test.ts
  > "creates a color (name+hex) and revalidates on success (R4)"` and
  `"updates and revalidates on success (R4)"`. UI wiring covered by
  `components/catalogs/__tests__/CatalogTable.test.tsx > "submits catalog + name to
  createCatalog"` and `"submits the id + new name to updateCatalog"`.

- **R5 — duplicate name → field error, no write.** Unique `name` index → Prisma
  `P2002`, mapped to a `name` field error in both create and update actions.
  Covered by `actions/__tests__/catalogs.test.ts > "maps a Prisma P2002 to a name
  field error and writes nothing (R5)"` and `"maps P2002 on rename to a name field
  error (R5)"`; schema-level empty-name rejection in
  `lib/validation/__tests__/catalog.test.ts`. UI surface:
  `components/catalogs/__tests__/CatalogTable.test.tsx > "shows a name field error
  returned by the action (R5)"`.

- **R6 — delete in-use blocked (pre-check + DB Restrict backstop).** `deleteCatalog`
  calls `isCatalogValueInUse(catalog, id)` and rejects in-use values with
  `"This value is in use and cannot be deleted"`; a slipped-through reference
  (FK `P2003`) maps to the same message. Covered by
  `actions/__tests__/catalogs.test.ts > "blocks an in-use value..."`,
  `"deletes a free value and revalidates"`, `"maps a DB Restrict (P2003) backstop
  to the in-use message"`. Service both-ways:
  `lib/services/__tests__/catalogs.test.ts` (`isCatalogValueInUse` returns
  false with no counters / false at zero / true when any counter > 0). UI:
  `components/catalogs/__tests__/CatalogTable.test.tsx > "renders the in-use block
  message returned by the action (R6)"`.

- **R7 — non-admin mutation rejected, no write.** Every action calls
  `requireAdmin()` FIRST (`ensureAdmin()` before any parse/DB work). Covered by
  `actions/__tests__/catalogs.test.ts`: `"rejects a non-admin with NO service call
  or revalidate (R7)"` (create), and the update/delete non-admin tests
  (`inUseMock`/service never called). Route-level: admin layout 403s non-admins;
  `e2e/catalogs.spec.ts > "employee cannot reach /admin/catalogs (R7)"` and
  `"signed-out access ... redirects to /login (R7)"`.

- **R8 — color hex rendered as a visible swatch.** `CatalogTable` (color tab)
  renders an `aria-hidden` swatch coloured from `hex` plus the hex string, and the
  add/edit dialog includes a hex input validated by `colorSchema`. Covered by
  `components/catalogs/__tests__/CatalogTable.test.tsx > "renders a swatch and the
  hex string per color row"` and `"includes a hex input in the add dialog"`;
  `lib/validation/__tests__/catalog.test.ts` hex-regex suite. Keyboard operability
  (ARIA tabs, arrow/Home/End) covered by
  `components/catalogs/__tests__/CatalogTabs.test.tsx`.

## Pipeline results (per stage)

Run with `corepack pnpm` (bare `pnpm` is not on PATH; `corepack enable` is blocked
by EPERM in this sandbox, and `init.sh` hard-requires a bare `pnpm`, so each stage
was run directly — all the stages `init.sh` would run are green):

- `corepack pnpm prisma generate` → **OK** (client regenerated with the 4 models).
- `corepack pnpm typecheck` → **OK** (0 errors).
- `corepack pnpm lint` → **OK** (no warnings/errors; removed an unused import).
- `corepack pnpm test` → **OK** — 121 passed / 15 files. Coverage on changed
  modules:
  - `lib/services/catalogs.ts` 100% stmts/branch/funcs/lines.
  - `lib/validation/catalog.ts` 100% all.
  - `components/catalogs/CatalogTabs.tsx` 100% all.
  - `components/catalogs/CatalogTable.tsx` 97.66% lines / 91.37% branch (uncovered:
    the hex-error display branch in the dialog only).
  - (`actions/catalogs.ts` and `prisma/seed.ts` are outside the vitest coverage
    `include` (`lib/**`,`components/**`) but are exhaustively tested behaviorally —
    services + schemas are branch-complete and the delete-guard is tested both
    in-use and free, per the tasks.md target.)
- `corepack pnpm build` → **OK** — `/admin/catalogs` builds as a dynamic
  (server-rendered) route; no Server/Client boundary errors.

## Credential-gated stages (run by a human against dev/staging Supabase)

No `.env.local` is present, so these were WRITTEN but not executed; do NOT invent
credentials. Target dev/staging only — never production.

1. Apply migrations (creates the 4 tables + RLS policies):
   `corepack pnpm prisma migrate deploy`
   (or, to regenerate from schema during development, `corepack pnpm prisma migrate
   dev --name catalogs` — the SQL is already authored under
   `prisma/migrations/20260622093000_catalogs` and `…093100_catalogs_rls`).
2. Confirm in sync: `corepack pnpm prisma migrate status`.
3. Seed: `corepack pnpm prisma db seed` (runs `PRISMA_SEED_RUN=1 node
   prisma/seed.ts`; idempotent — safe to run twice).
4. E2E (needs a build + the test accounts in `.env.local`):
   `corepack pnpm build && corepack pnpm test:e2e`
   - `e2e/catalogs.spec.ts` — admin add/rename/delete a print type, swatch visible,
     duplicate-name rejected, employee 403, signed-out redirect.
   - `e2e/catalogs-rls.spec.ts` — employee can read but cannot insert/update/delete
     any catalog (R2 via the Supabase/PostgREST path RLS guards).
   These specs `test.skip` when `E2E_*` env vars are unset.

## Files created

- `prisma/migrations/20260622093000_catalogs/migration.sql` — 4 tables + unique
  `name` indexes (R1).
- `prisma/migrations/20260622093100_catalogs_rls/migration.sql` — RLS enable/force
  + SELECT(authenticated)/INSERT/UPDATE/DELETE(admin) per table (R2).
- `prisma/seed.ts` — idempotent upsert seed; exports data + `seedCatalogs(client)`
  for testing (R3).
- `prisma/__tests__/seed.test.ts` — seed data + idempotency tests.
- `lib/validation/catalog.ts` — `catalogKeySchema`, `colorSchema`, `nameOnlySchema`,
  `hexColorRegex`, `schemaForCatalog` (R4, R5, R8).
- `lib/validation/__tests__/catalog.test.ts`.
- `lib/services/catalogs.ts` — generic list/create/update/delete +
  `isCatalogValueInUse` + the reference-counter registry (R4, R6).
- `lib/services/__tests__/catalogs.test.ts`.
- `actions/catalogs.ts` — `createCatalog`/`updateCatalog`/`deleteCatalog`
  (`requireAdmin` first; P2002→field error; delete-guard) (R4, R5, R6, R7).
- `actions/__tests__/catalogs.test.ts`.
- `app/admin/catalogs/page.tsx` — server page loading all four catalogs (R4).
- `components/catalogs/CatalogTabs.tsx` — accessible native ARIA tabs (R4, R8).
- `components/catalogs/CatalogTable.tsx` — rows + add/edit dialog + delete + swatch
  (R4, R6, R8).
- `components/catalogs/__tests__/CatalogTabs.test.tsx`,
  `components/catalogs/__tests__/CatalogTable.test.tsx`.
- `e2e/catalogs.spec.ts`, `e2e/catalogs-rls.spec.ts`.

## Files changed

- `prisma/schema.prisma` — added the four catalog models (with the
  `onDelete: Restrict` convention documented for later features' FKs).
- `app/admin/layout.tsx` — added the "Catalogs" nav link beside "Users".
- `package.json` — added a `prisma.seed` command (`PRISMA_SEED_RUN=1 node
  prisma/seed.ts`); no new dependency.
- `specs/02_catalog_management/tasks.md` — all tasks checked.

## Deviations / notes for the reviewer

- **Admin route location.** Placed at `app/admin/catalogs/` (matching the existing
  `app/admin/users/` from 01), not the spec's `app/(app)/admin/catalogs/`. 01 chose
  the un-grouped `app/admin` layout (which owns the admin 403 guard + nav), so this
  reuses it for consistency; the URL `/admin/catalogs` is unchanged.
- **Tabs implementation.** `@radix-ui/react-tabs` is NOT in `package.json`, so per
  the brief I did NOT add a new `@radix-ui/*` runtime dep. `CatalogTabs` is
  implemented with native accessible ARIA tab markup (roving `tabindex`,
  Left/Right/Home/End handling) — keyboard-operable (R8), verified in tests.
- **`isCatalogValueInUse` is forward-pluggable.** No referencing models exist yet,
  so it returns `false` for every catalog today. It sums a per-catalog registry of
  `CatalogReferenceCounter`s. A later feature plugs in by (a) adding its FK with
  `onDelete: Restrict` in its own migration and (b) calling
  `registerCatalogReference("taskCategory", (id) => db.task.count({ where: {
  categoryId: id } }))` from its module. The DB `Restrict` is the hard backstop;
  the action also maps a slipped-through FK `P2003` to the same friendly in-use
  message. (`__resetCatalogReferencesForTests` exists for test isolation only.)
- **Seed runner / no new dep.** Node v24 runs TypeScript natively, so the seed is
  configured as `node prisma/seed.ts` (gated by `PRISMA_SEED_RUN=1` so importing it
  in tests does not connect to a DB). No `tsx`/`ts-node` added. The seed data and
  `seedCatalogs` are exported so idempotency is unit-tested against a mock client.
- **Prisma config deprecation.** `corepack pnpm prisma generate` prints a warning
  that `package.json#prisma` is deprecated (removed in Prisma 7); it is still valid
  in the repo's Prisma 6 and does not affect this feature. Flagging for a future
  migration to `prisma.config.ts` if the team upgrades.
- **No new env var.** The seed reuses the existing `DATABASE_URL`/`DIRECT_URL`;
  `PRISMA_SEED_RUN` is an internal flag the seed command sets, not a user secret —
  `.env.example` needs no change.
- **`init.sh`** could not be run as one command (it hard-requires a bare `pnpm`,
  which is not on PATH and `corepack enable` is EPERM-blocked here); every stage it
  runs was executed individually via `corepack pnpm` and is green.
