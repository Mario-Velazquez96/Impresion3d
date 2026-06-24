import { z } from "zod";

/**
 * Validation for print inventory (06_print_inventory). This module is
 * client-importable (no server-only imports) so the print form / filters can reuse
 * the same shapes and error messages the server actions enforce.
 *
 * Photo file validation (`photoConstraints` + `validatePhotoFile`) is also here so
 * the action can reject an oversized / wrong-type upload with a field error BEFORE
 * any Storage or DB write (R10 — store nothing on rejection).
 */

// A cuid foreign-key id. Non-empty string; existence is enforced by the DB FK
// (a bad printTypeId / colorId raises Prisma P2003, which the action maps to a
// validation error).
const idSchema = z.string().trim().min(1);

// Required print name (R1).
const nameSchema = z.string().trim().min(1, "Name is required");

// A non-negative integer field arriving as a form string (or a number). Coerces a
// numeric string, then enforces integer ≥ 0. Rejects "", non-numeric, negative,
// and fractional values.
function nonNegativeIntField(label: string) {
  return z
    .union([z.string(), z.number()])
    .transform((value) =>
      typeof value === "number" ? value : value.trim(),
    )
    .superRefine((value, ctx) => {
      if (typeof value === "string" && value.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} is required`,
        });
      }
    })
    .pipe(
      z.coerce
        .number({ invalid_type_error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(0, `${label} cannot be negative`),
    );
}

// Optional document URL (R1). "", null, and a missing value normalize to undefined;
// a present-but-invalid URL is rejected with a field error.
const documentUrlSchema = z
  .union([z.literal(""), z.null(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  .superRefine((value, ctx) => {
    if (value === undefined) return;
    if (!z.string().url().safeParse(value).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid URL",
      });
    }
  });

// At least one color is required (R10). FormData delivers repeated `colorIds`
// fields as an array; a single value arrives as a one-element array. Each id is
// non-empty; existence is enforced by the DB FK.
const colorIdsSchema = z
  .array(idSchema)
  .min(1, "Select at least one color");

// Create a print (R5, R10). name required; integer fields ≥ 0; documentUrl
// optional; printTypeId + ≥1 colorId required. The photo File is validated
// separately in the action via photoConstraints/validatePhotoFile.
export const createPrintSchema = z.object({
  name: nameSchema,
  printTimeMinutes: nonNegativeIntField("Print time"),
  filamentGrams: nonNegativeIntField("Filament grams"),
  documentUrl: documentUrlSchema,
  printTypeId: idSchema,
  colorIds: colorIdsSchema,
});
export type CreatePrintInput = z.infer<typeof createPrintSchema>;

// Update a print (R6): the create shape plus the target print id.
export const updatePrintSchema = createPrintSchema.extend({
  id: idSchema,
});
export type UpdatePrintInput = z.infer<typeof updatePrintSchema>;

/**
 * Photo upload constraints (R10). Centralized here so the value is easy to change
 * and shared between the action guard and any client-side hinting. Gate decision:
 * max 5 MB; only png / jpeg / webp.
 */
export const photoConstraints = {
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
} as const;

export type PhotoMimeType = (typeof photoConstraints.allowedMimeTypes)[number];

// A minimal structural shape of the parts of a File the guard inspects. Declared
// structurally (not `instanceof File`) so it is testable in Node without the DOM
// File global and works for both the web File and Node's File-like upload object.
export type UploadedFileLike = {
  size: number;
  type: string;
  name?: string;
};

export type PhotoValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validate an uploaded photo against `photoConstraints` (R10). Returns a typed
 * result instead of throwing so the action can map a failure to a field error and
 * write nothing. An empty upload (size 0) is treated as "no file provided" and is
 * the caller's concern (create allows no photo); this guard only judges a file
 * that actually has bytes.
 */
export function validatePhotoFile(
  file: UploadedFileLike,
): PhotoValidationResult {
  if (file.size > photoConstraints.maxBytes) {
    return {
      ok: false,
      message: "Photo must be 5 MB or smaller",
    };
  }
  if (
    !(photoConstraints.allowedMimeTypes as readonly string[]).includes(
      file.type,
    )
  ) {
    return {
      ok: false,
      message: "Photo must be a PNG, JPEG, or WebP image",
    };
  }
  return { ok: true };
}
