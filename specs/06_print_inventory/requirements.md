# Requirements — 06_print_inventory

**Feature:** Print inventory with photos and colors
**Source:** `client_requirement.md` §4.3; `solution_design.md` §3, §6 (Storage)
**Depends on:** 02_catalog_management

## Purpose

A searchable catalog of prints the business can produce. Each print records the
data needed to identify it and to drive color-based planning: name, the colors it
uses (multiple), print time, filament grams, a photo, a document link, and a print
type. Photos are stored in a private Supabase Storage bucket and served via signed
URLs. This feature provides the inventory that `07_weekly_planning` filters.

## In scope

- `Print` model + `PrintColor` M2M (colors used) + migration + RLS.
- Private Storage bucket `print-photos` with access policies.
- CRUD server actions including photo upload/replace and setting the color set.
- Inventory list/grid with search (by name) and filter (by print type, color).
- Print detail view with a signed photo URL.

## Out of scope

- Per-color filament grams (explicitly not tracked, brief §4.3 note).
- The weekly color-match filtering — that's `07_weekly_planning`.

## Requirements (EARS)

**R1 (Ubiquitous):** The system shall define a `Print` model with `name`,
`printTimeMinutes` (Int), `filamentGrams` (Int), optional `photoPath`, optional
`documentUrl`, and `printTypeId` (→ `PrintType`, `onDelete: Restrict`).

**R2 (Ubiquitous):** The system shall define a `PrintColor` join (`printId`,
`colorId`, composite PK) representing the colors a print uses, with `colorId`
`onDelete: Restrict`.

**R3 (Ubiquitous):** The `Print` and `PrintColor` tables shall have RLS enabled so
only authenticated users may read or write.

**R4 (Ubiquitous):** The `print-photos` Storage bucket shall be **private** with
access policies allowing only authenticated users; reads shall use server-generated
signed URLs.

**R5 (Event-driven):** When the create-print form is submitted with a photo, the
system shall validate input with `createPrintSchema`, upload the image to
`print-photos`, store its object key in `photoPath`, persist the print and its
`PrintColor` set, and revalidate `/inventory`.

**R6 (Event-driven):** When a print is edited, the system shall update its fields
and replace its color set atomically; if a new photo is provided, it shall replace
the stored object.

**R7 (Event-driven):** When an Admin deletes a print, the system shall remove the
row, its `PrintColor` rows, and its Storage object.

**R8 (State-driven):** While a search term and/or print-type/color filter is
active, the system shall list only prints matching all active criteria.

**R9 (Unwanted behavior):** If a non-admin invokes `deletePrint`, then the system
shall reject it and make no DB or Storage write.

**R10 (Unwanted behavior):** If an uploaded file exceeds the size/type limits or a
print has zero colors, then the system shall reject the submission with a field
error and store nothing.

**R11 (Optional):** Where a print has colors, the inventory and detail views shall
render each color's swatch from its `hex`.

## Acceptance

- A print is created with ≥1 color and a photo; the grid shows it with a signed
  image and color swatches.
- Editing changes fields, swaps the color set, and replaces the photo.
- An Admin deletes a print and its image is gone from Storage; an Employee cannot
  delete.
- Search by name and filter by type/color narrow the grid.
- Oversized/wrong-type uploads and zero-color prints are rejected.

## Open items

- Signed URL TTL (e.g. 1h) and image constraints (max ~5MB; png/jp/webp) — confirm
  at the gate.
- Whether to generate thumbnails — out of scope for MVP (serve original).
