/**
 * Client-safe view types for the calculator island (09_price_calculator). Declared
 * HERE rather than imported from `lib/services/prints` so the client bundle never
 * pulls that module's `server-only` guard (the same reason
 * `components/planning/types.ts` exists). Re-declaring `ColorView` — structurally
 * identical to planning's — keeps the calculator independent of the planning
 * feature instead of coupling two unrelated islands through a shared import.
 */

export type ColorView = { id: string; name: string; hex: string };

/**
 * The minimal print shape the "load from a print" prefill needs. `filamentGrams`
 * is the print's TOTAL across all colors — PrintColor carries no per-color grams,
 * so the calculator surfaces this as a hint and never invents a split.
 */
export type CalculatorPrintView = {
  id: string;
  name: string;
  printTimeMinutes: number;
  filamentGrams: number;
  colors: ColorView[];
};
