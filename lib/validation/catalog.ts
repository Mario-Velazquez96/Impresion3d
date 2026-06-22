import { z } from "zod";

/**
 * Validation for the four catalogs (02_catalog_management). This module is
 * client-importable (no server-only imports) so the CRUD UI can reuse the same
 * shapes and error messages the server actions enforce.
 */

// The set of catalogs, used as the discriminator that maps an action call to the
// right service/schema. Kept as a plain string union (not the Prisma model names)
// so this file never imports the server-only Prisma client.
export const catalogKeySchema = z.enum([
  "color",
  "printType",
  "supplyType",
  "taskCategory",
]);
export type CatalogKey = z.infer<typeof catalogKeySchema>;

// #RRGGBB, case-insensitive. Stored as the 7-char string; the swatch renders it
// directly (R8).
export const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

// Color carries a name + hex (R4). Names are trimmed; empty/whitespace-only names
// are rejected before they reach Prisma.
export const colorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  hex: z
    .string()
    .trim()
    .regex(hexColorRegex, "Hex must be in #RRGGBB format"),
});
export type ColorInput = z.infer<typeof colorSchema>;

// PrintType / SupplyType / TaskCategory carry a name only (R4).
export const nameOnlySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});
export type NameOnlyInput = z.infer<typeof nameOnlySchema>;

/**
 * The Zod schema for a given catalog. Color adds `hex`; everyone else is
 * name-only. Returned as a `ZodType` over the union of payloads so callers can
 * `safeParse` generically.
 */
export function schemaForCatalog(
  catalog: CatalogKey,
): z.ZodType<ColorInput | NameOnlyInput> {
  return catalog === "color" ? colorSchema : nameOnlySchema;
}
