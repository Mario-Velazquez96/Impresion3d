import { z } from "zod";

/**
 * Validation for expense tracking (05_expense_tracking). This module is
 * client-importable (no server-only imports) so the expense form can reuse the
 * same shapes and error messages the server actions enforce.
 *
 * COST IS NEVER A JS FLOAT. The form sends `cost` as a string; we validate it
 * with a regex that admits only a positive number with AT MOST two decimal
 * places, then keep it as a normalized string. The service hands that string
 * straight to `new Prisma.Decimal(value)`, so the value never passes through a
 * lossy `parseFloat`/`Number` and round-trips with exact two-decimal precision
 * (R1, R3, R8).
 */

// A cuid foreign-key id. Non-empty string; existence is enforced by the DB FK
// (a bad supplyTypeId raises Prisma P2003, which the action maps to a validation
// error).
const idSchema = z.string().trim().min(1, "Supply type is required");

// Positive money with at most two decimals: "5", "5.5", "5.50", "1234.99".
// Rejects: "0"/"-1" (not positive), "" (empty), "1.234" (>2dp), "abc".
const COST_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * Cost field (R8). Accepts the raw form string (or a number, which we stringify),
 * trims it, then enforces: parseable as a positive amount with at most two
 * decimal places. The output is the validated, normalized STRING — the service
 * constructs a Prisma.Decimal from it, so no float arithmetic ever touches the
 * amount.
 */
export const costSchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()))
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cost is required",
      });
      return;
    }
    if (!COST_REGEX.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cost must be a number with at most two decimal places",
      });
      return;
    }
    // COST_REGEX already guarantees a non-negative number; reject exact zero so
    // the amount is strictly positive (R8). Compared as a string against the
    // numeric value of 0 without trusting float equality on the stored value.
    if (Number(value) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cost must be greater than zero",
      });
    }
  });

// Required reason (R1).
const reasonSchema = z.string().trim().min(1, "Reason is required");

// Required date. Accepts an ISO/`yyyy-mm-dd` string or a Date; rejects an
// unparseable/empty value (R1).
const dateSchema = z
  .union([z.string(), z.date()])
  .superRefine((value, ctx) => {
    if (typeof value === "string" && value.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date is required" });
      return;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid date",
      });
    }
  })
  .transform((value) => (value instanceof Date ? value : new Date(value)));

// Optional purchase URL (R9). "", null, and a missing value normalize to
// undefined; a present-but-invalid URL is rejected with a field error.
const purchaseUrlSchema = z
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

// Create an expense (R3, R8, R9).
export const createExpenseSchema = z.object({
  cost: costSchema,
  reason: reasonSchema,
  date: dateSchema,
  purchaseUrl: purchaseUrlSchema,
  supplyTypeId: idSchema,
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

// Update an expense (R4): the create shape plus the target expense id.
export const updateExpenseSchema = createExpenseSchema.extend({
  id: idSchema,
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
