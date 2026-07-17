"use client";

import { Swatch } from "@/components/planning/Swatch";
import type { ColorView } from "@/components/calculator/types";

/**
 * One filament row's inputs (09_price_calculator: R3, R8, R9, R10). Fully
 * CONTROLLED by PriceCalculator — presentational only, no business logic and no
 * math: it reports changes upward and the parent owns the state.
 *
 * The color <select> lists the whole Color catalog; a native <option> cannot carry
 * a swatch, so the current choice's hex dot renders ADJACENT to the select — the
 * app's existing swatch convention (planning's <Swatch>), accessible without a
 * custom listbox (R10).
 *
 * `min="0"` is the client-side rejection of negatives (R8); the pure core's clamp
 * is the actual guarantee.
 */
export function FilamentRow({
  rowKey,
  index,
  allColors,
  colorId,
  grams,
  pricePerKg,
  canRemove,
  onColorChange,
  onGramsChange,
  onPricePerKgChange,
  onRemove,
}: {
  rowKey: string;
  index: number;
  allColors: ColorView[];
  colorId: string;
  grams: string;
  pricePerKg: string;
  canRemove: boolean;
  onColorChange: (value: string) => void;
  onGramsChange: (value: string) => void;
  onPricePerKgChange: (value: string) => void;
  onRemove: () => void;
}) {
  const colorInputId = `row-${rowKey}-color`;
  const gramsInputId = `row-${rowKey}-grams`;
  const priceInputId = `row-${rowKey}-price`;
  const selected = allColors.find((c) => c.id === colorId) ?? null;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={colorInputId} className="text-xs font-medium">
          Color (row {index + 1})
        </label>
        <div className="flex items-center gap-2">
          <select
            id={colorInputId}
            value={colorId}
            onChange={(e) => onColorChange(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">— No color —</option>
            {allColors.map((color) => (
              <option key={color.id} value={color.id}>
                {color.name}
              </option>
            ))}
          </select>
          {selected ? (
            <Swatch color={selected} showName={false} />
          ) : (
            <span className="text-xs text-muted-foreground">No color</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={gramsInputId} className="text-xs font-medium">
          Grams used (row {index + 1})
        </label>
        <input
          id={gramsInputId}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={grams}
          onChange={(e) => onGramsChange(e.target.value)}
          className="h-9 w-28 rounded-md border bg-background px-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={priceInputId} className="text-xs font-medium">
          Price per kg (row {index + 1})
        </label>
        <input
          id={priceInputId}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={pricePerKg}
          onChange={(e) => onPricePerKgChange(e.target.value)}
          className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
        />
      </div>

      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
        >
          Remove row {index + 1}
        </button>
      ) : null}
    </div>
  );
}
