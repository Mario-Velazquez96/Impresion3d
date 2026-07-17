"use client";

import { useState } from "react";

import { FilamentRow } from "@/components/calculator/FilamentRow";
import type {
  CalculatorPrintView,
  ColorView,
} from "@/components/calculator/types";
import { Swatch } from "@/components/planning/Swatch";
import { formatCurrency } from "@/lib/format";
import { calculateBreakdown, roundMoney } from "@/lib/pricing-core";

/**
 * The price calculator Client island (09_price_calculator: R2–R11). Owns ALL input
 * state; the breakdown is DERIVED during render by the pure core on every keystroke
 * — no useEffect, no memo, no server round-trip, no Server Action, no persistence
 * of any kind. Reload = a fresh calculator, by design: this is a scratchpad, not a
 * record.
 *
 * Values are held as STRINGS so inputs stay controlled and blank-able; the core's
 * sanitizeAmount turns blank/NaN/negative into 0 (R7, R8). Rounding happens ONCE
 * here, at the display edge, via roundMoney → formatCurrency (MXN) (R11).
 */

type RowState = {
  /** Stable identity so removing a middle row doesn't scramble React state (R9). */
  key: string;
  colorId: string;
  grams: string;
  pricePerKg: string;
};

let rowCounter = 0;
function newRow(colorId = ""): RowState {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, colorId, grams: "", pricePerKg: "" };
}

export function PriceCalculator({
  allColors,
  prints,
}: {
  allColors: ColorView[];
  prints: CalculatorPrintView[];
}) {
  const [powerPricePerHour, setPowerPricePerHour] = useState("");
  const [printTimeMinutes, setPrintTimeMinutes] = useState("");
  // Standalone default: exactly one empty row (R6).
  const [rows, setRows] = useState<RowState[]>(() => [newRow()]);
  const [selectedPrintId, setSelectedPrintId] = useState("");

  // id → color, for swatch rendering in the breakdown lines (R10).
  const colorsById = new Map(allColors.map((color) => [color.id, color]));
  const selectedPrint =
    prints.find((print) => print.id === selectedPrintId) ?? null;

  // R4: derived during render — always in sync with what the user just typed.
  const breakdown = calculateBreakdown({
    powerPricePerHour: Number(powerPricePerHour),
    printTimeMinutes: Number(printTimeMinutes),
    rows: rows.map((row) => ({
      colorId: row.colorId === "" ? null : row.colorId,
      grams: Number(row.grams),
      pricePerKg: Number(row.pricePerKg),
    })),
  });

  /**
   * R5: prefill from a print — the time from printTimeMinutes and ONE row per
   * color with grams left BLANK (PrintColor carries no per-color grams, so any
   * split would be fabricated; the print's TOTAL filamentGrams renders as a hint
   * instead). Everything prefilled only seeds the same state the user drives, so
   * it all stays editable. Choosing "None" clears the hint WITHOUT wiping typed
   * values — destroying work on a stray select would be hostile.
   */
  function handlePrintChange(printId: string) {
    setSelectedPrintId(printId);
    const print = prints.find((p) => p.id === printId);
    if (!print) return;
    setPrintTimeMinutes(String(print.printTimeMinutes));
    setRows(
      print.colors.length > 0
        ? print.colors.map((color) => newRow(color.id))
        : [newRow()],
    );
  }

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  // R9: at least one row always remains — Remove is only offered above one row.
  function removeRow(key: string) {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((row) => row.key !== key) : prev,
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Print</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="load-print" className="text-xs font-medium">
              Load from a print (optional)
            </label>
            <select
              id="load-print"
              value={selectedPrintId}
              onChange={(e) => handlePrintChange(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">— None (enter manually) —</option>
              {prints.map((print) => (
                <option key={print.id} value={print.id}>
                  {print.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="power-price" className="text-xs font-medium">
                Power price per hour
              </label>
              <input
                id="power-price"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={powerPricePerHour}
                onChange={(e) => setPowerPricePerHour(e.target.value)}
                className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="print-time" className="text-xs font-medium">
                Print time (minutes)
              </label>
              <input
                id="print-time"
                type="number"
                min="0"
                step="any"
                inputMode="numeric"
                value={printTimeMinutes}
                onChange={(e) => setPrintTimeMinutes(e.target.value)}
                className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Filament</h2>

          {selectedPrint ? (
            <p className="text-xs text-muted-foreground">
              This print uses {selectedPrint.filamentGrams} g of filament in total
              — split it across the colors below.
            </p>
          ) : null}

          {rows.map((row, index) => (
            <FilamentRow
              key={row.key}
              rowKey={row.key}
              index={index}
              allColors={allColors}
              colorId={row.colorId}
              grams={row.grams}
              pricePerKg={row.pricePerKg}
              canRemove={rows.length > 1}
              onColorChange={(value) => updateRow(row.key, { colorId: value })}
              onGramsChange={(value) => updateRow(row.key, { grams: value })}
              onPricePerKgChange={(value) =>
                updateRow(row.key, { pricePerKg: value })
              }
              onRemove={() => removeRow(row.key)}
            />
          ))}

          <div>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, newRow()])}
              className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
            >
              Add filament row
            </button>
          </div>
        </section>
      </div>

      <section className="flex w-full flex-col gap-3 rounded-lg border p-4 lg:w-80">
        <h2 className="text-sm font-semibold">Cost breakdown</h2>

        <div className="flex items-center justify-between text-sm">
          <span>Electricity</span>
          <span data-testid="electricity-cost">
            {formatCurrency(roundMoney(breakdown.powerCost))}
          </span>
        </div>

        <div
          data-testid="filament-lines"
          className="flex flex-col gap-1.5 border-t pt-3"
        >
          {breakdown.filamentLines.map((line, index) => {
            const color = line.colorId ? colorsById.get(line.colorId) : null;
            return (
              <div
                key={rows[index].key}
                className="flex items-center justify-between gap-2 text-sm"
              >
                {color ? (
                  <Swatch color={color} />
                ) : (
                  <span className="text-xs text-muted-foreground">No color</span>
                )}
                <span>{formatCurrency(roundMoney(line.cost))}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span>Filament subtotal</span>
          <span data-testid="filament-subtotal">
            {formatCurrency(roundMoney(breakdown.filamentTotal))}
          </span>
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-base font-bold">
          <span>Total cost</span>
          <span data-testid="total-cost">
            {formatCurrency(roundMoney(breakdown.total))}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Production cost only — no margin. Nothing here is saved.
        </p>
      </section>
    </div>
  );
}
