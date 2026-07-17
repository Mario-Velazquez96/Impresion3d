import { z } from "zod";

/**
 * Validation for sales & balance (10_sales_and_balance). This module is
 * client-importable (no server-only imports) so the sale/withdrawal forms can
 * reuse the same shapes and error messages the server actions enforce.
 *
 * AMOUNT IS NEVER A JS FLOAT. The form sends `amount` as a string; we validate it
 * with a regex that admits only a positive number with AT MOST two decimal
 * places, then keep it as a normalized string. The service hands that string
 * straight to `new Prisma.Decimal(value)`, so the value never passes through a
 * lossy `parseFloat`/`Number` and round-trips with exact two-decimal precision
 * (R7, R14). This mirrors `lib/validation/expense.ts#costSchema` verbatim — the
 * helpers are duplicated locally rather than refactored out of feature 05, whose
 * public API and error messages must not change.
 *
 * There are NO update schemas: editing a ledger row is out of scope (rows are
 * append-and-delete only).
 */

// A cuid foreign-key id for the required print reference (R8). Non-empty string;
// existence is enforced by the DB FK (a bad printId raises Prisma P2003, which
// the action maps to a validation error).
const printIdSchema = z.string().trim().min(1, "Print is required");

// Positive money with at most two decimals: "5", "5.5", "5.50", "1234.99".
// Rejects: "0"/"-1" (not positive), "" (empty), "1.234" (>2dp), "abc", "NaN".
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * Amount field (R14). Accepts the raw form string (or a number, which we
 * stringify), trims it, then enforces: parseable as a positive amount with at
 * most two decimal places. The output is the validated, normalized STRING — the
 * service constructs a Prisma.Decimal from it, so no float arithmetic ever
 * touches the amount. Negative, zero, non-numeric, blank, non-finite, and >2dp
 * values are all rejected here with a field error and no write.
 */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value) =>
    typeof value === "number" ? String(value) : value.trim(),
  )
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount is required",
      });
      return;
    }
    if (!AMOUNT_REGEX.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must be a number with at most two decimal places",
      });
      return;
    }
    // AMOUNT_REGEX already guarantees a non-negative number; reject exact zero so
    // the amount is strictly positive (R14).
    if (Number(value) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must be greater than zero",
      });
    }
  });

// Required date. Accepts an ISO/`yyyy-mm-dd` string or a Date; rejects an
// unparseable/empty value.
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

// Optional free text (Sale.buyer / Sale.notes). "", null, and a missing value all
// normalize to undefined; the service stores null.
const optionalTextSchema = z
  .union([z.literal(""), z.null(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  });

/** Record a sale (R8, R14): amount + date + a REQUIRED print, buyer/notes optional. */
export const createSaleSchema = z.object({
  amount: amountSchema,
  date: dateSchema,
  printId: printIdSchema,
  buyer: optionalTextSchema,
  notes: optionalTextSchema,
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

/**
 * Record a withdrawal (R14, R15): amount + date + a REQUIRED reason.
 *
 * DELIBERATELY NO `recordedById`. The audit trail of who took money out is taken
 * from the authenticated actor server-side (actions/withdrawals.ts passes
 * `user.id` from requireAdmin()); it is NEVER client input, so any recordedById
 * planted in the FormData is not in this schema and is silently ignored.
 */
export const createWithdrawalSchema = z.object({
  amount: amountSchema,
  date: dateSchema,
  reason: z.string().trim().min(1, "Reason is required"),
});
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
