# Requirements — 02_catalog_management

**Feature:** Manageable catalogs (Colors, Print Types, Supply Types, Task Categories)
**Source:** `client_requirement.md` §4.5, §4.6; `solution_design.md` §3, §9
**Depends on:** 01_auth_and_user_management

## Purpose

Provide the four manageable catalogs that every domain feature references, as
**tables (not enums)** so they can be edited without code changes (brief §4.6),
seeded with the brief's initial values, with RLS and an Admin-only CRUD UI. Colors
additionally carry a hex swatch for the planning filters (brief §4.5).

## In scope

- `Color` (`name` unique, `hex`), `PrintType`, `SupplyType`, `TaskCategory`
  (`name` unique) models + migration + RLS.
- Seed: the 6 initial colors (with hex), initial task categories (Printer
  maintenance, Design creation, Purchases, Customer follow-up), and initial print
  types (keychain, frame, deckbox).
- Admin-only CRUD UI (`app/(app)/admin/catalogs`) with tabs per catalog.
- A delete-guard preventing removal of a catalog value already referenced.

## Out of scope

- Records that *use* the catalogs (tasks, expenses, prints) — later features.
- Per-color filament grams (explicitly not tracked, brief §4.3 note).

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall define `Color { name @unique, hex }`,
`PrintType { name @unique }`, `SupplyType { name @unique }`, and
`TaskCategory { name @unique }` models.

**R2 (Ubiquitous):** Each catalog table shall have RLS enabled: any authenticated
user may read; only an `ADMIN` may insert/update/delete.

**R3 (Event-driven):** When the database is seeded, the system shall create the 6
initial colors with hex values, the 4 initial task categories, and the 3 initial
print types, idempotently (re-seeding creates no duplicates).

**R4 (Event-driven):** When an Admin submits a create/edit form for any catalog,
the system shall validate it with the catalog's Zod schema and upsert the row,
then revalidate the catalogs page.

**R5 (Unwanted behavior):** If a create/edit would produce a duplicate `name`
within a catalog, then the system shall reject it with a field error and write
nothing.

**R6 (Unwanted behavior):** If an Admin attempts to delete a catalog value that is
referenced by an existing record, then the system shall reject the delete and
explain it is in use (DB `onDelete: Restrict` + a friendly pre-check).

**R7 (Unwanted behavior):** If a non-admin invokes any catalog mutation, then the
system shall reject it without a DB write.

**R8 (Optional):** Where a `Color` is rendered in any picker/filter, the system
shall display its `hex` as a visible swatch.

## Acceptance

- Seeding yields exactly the brief's initial values; re-seeding adds none.
- An Admin can add/rename/delete catalog values across all four tabs.
- Deleting an in-use value is blocked with a clear message.
- Duplicate names are rejected per catalog.
- Employees can read catalogs (for later forms) but cannot reach the admin UI or
  mutate; RLS denies non-admin writes.
- Color swatches render from `hex` and the UI is keyboard-operable.

## Open items

- Color hex format: store `#RRGGBB` 7-char string; validate with a hex regex.
- Whether to allow soft-delete instead of restrict — default hard `Restrict`;
  revisit if rename-not-delete proves insufficient.
