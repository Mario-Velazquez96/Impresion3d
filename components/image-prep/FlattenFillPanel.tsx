"use client";

import { MAX_RUNNER_UPS, type ColorCount } from "@/lib/flatten-core";
import { rgbToHex, type Rgb } from "@/lib/image-prep-core";

/**
 * Fill panel for the flatten stage (12_flatten: R12–R16), rendered only while
 * the selection is non-empty: the "N px selected" count, the suggested fill
 * (most-common exact color with hex + % of the selection) and up to
 * `MAX_RUNNER_UPS` runner-up swatches, a hex input with an inline error on
 * invalid values, the eyedropper **Pick** toggle, **Flatten selection**,
 * **Clear**, and **Recolor every match** (R17, enabled only when the chosen
 * fill differs from the suggested color). The chosen fill lives in the
 * workspace so it can reset to the suggested color whenever the selection
 * changes (R13).
 */
export function FlattenFillPanel({
  selectedPx,
  stats,
  chosenFill,
  onChooseFill,
  hexDraft,
  hexError,
  onHexChange,
  pickMode,
  onTogglePickMode,
  onFlatten,
  onClear,
  onRecolor,
  busy,
}: {
  /** Union size of the selection in pixels (R10). */
  selectedPx: number;
  /** Selection color statistics, most common first (R13). */
  stats: ColorCount[];
  /** The fill a Flatten would apply right now (suggested unless overridden). */
  chosenFill: Rgb;
  onChooseFill: (color: Rgb) => void;
  hexDraft: string;
  hexError: boolean;
  onHexChange: (value: string) => void;
  /** Eyedropper mode (R15). */
  pickMode: boolean;
  onTogglePickMode: () => void;
  /** Collapse the selection to the chosen fill (R16). */
  onFlatten: () => void;
  /** Empty the selection without changing the image (R12). */
  onClear: () => void;
  /** Swap the suggested color for the chosen fill image-wide (R17). */
  onRecolor: () => void;
  busy: boolean;
}) {
  const suggested = stats[0];
  const runnerUps = stats.slice(1, 1 + MAX_RUNNER_UPS);
  const suggestedHex = rgbToHex(suggested.color);
  const suggestedPercent = ((suggested.count / selectedPx) * 100).toFixed(1);
  const chosenHex = rgbToHex(chosenFill);
  // Recolor is a no-op when the fill equals the suggested color, so it is only
  // offered once the user has chosen a different fill (R17).
  const canRecolor = chosenHex !== suggestedHex;

  const swatchButton = (color: Rgb, label: string, extra?: string) => {
    const hex = rgbToHex(color);
    return (
      <button
        key={label}
        type="button"
        aria-label={label}
        aria-pressed={hex === chosenHex}
        disabled={busy}
        onClick={() => onChooseFill(color)}
        className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs hover:bg-accent disabled:opacity-50 ${
          hex === chosenHex ? "ring-2 ring-ring" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="inline-block size-3 rounded-full border"
          style={{ backgroundColor: hex }}
        />
        <span className="tabular-nums">{hex}</span>
        {extra ? (
          <span className="tabular-nums text-muted-foreground">{extra}</span>
        ) : null}
      </button>
    );
  };

  return (
    <section className="flex w-full flex-col gap-3 rounded-lg border p-4 lg:max-w-xs">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">Fill</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {selectedPx} px selected
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">Suggested</h3>
        {swatchButton(
          suggested.color,
          `Use suggested ${suggestedHex}`,
          `${suggestedPercent}% of selection`,
        )}
        {runnerUps.length > 0 ? (
          <>
            <h3 className="text-xs font-medium">Runner-ups</h3>
            <div className="flex flex-wrap gap-2">
              {runnerUps.map((entry) =>
                swatchButton(entry.color, `Use ${rgbToHex(entry.color)}`),
              )}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label htmlFor="flatten-hex" className="text-xs font-medium">
            Hex color
          </label>
          <input
            id="flatten-hex"
            type="text"
            value={hexDraft}
            disabled={busy}
            placeholder="#22aa88"
            onChange={(event) => onHexChange(event.target.value)}
            className="h-8 w-28 rounded-md border bg-transparent px-2 text-xs tabular-nums"
          />
          <button
            type="button"
            aria-pressed={pickMode}
            disabled={busy}
            onClick={onTogglePickMode}
            className={`h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50 ${
              pickMode ? "bg-accent ring-2 ring-ring" : ""
            }`}
          >
            Pick
          </button>
        </div>
        {hexError ? (
          <p role="alert" className="text-xs text-destructive">
            Enter a 3- or 6-digit hex color like #22aa88.
          </p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Fill with <span className="tabular-nums">{chosenHex}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onFlatten}
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          Flatten selection
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="h-9 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={busy || !canRecolor}
          onClick={onRecolor}
          className="h-9 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-50"
        >
          Recolor every match
        </button>
      </div>
    </section>
  );
}
