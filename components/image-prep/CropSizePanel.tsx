"use client";

import {
  CROP_PRESETS,
  MAX_PRINT_MM,
  MIN_PRINT_MM,
  MM_MAX_DECIMALS,
  PX_PER_MM_COMFORTABLE,
  PX_PER_MM_MIN,
  WORKING_CAP_PX,
  effectivePxPerMm,
  matchingPreset,
  pixelsKeptPercent,
  pxPerMmToDpi,
  resolutionLevel,
  type CropPreset,
  type CropRect,
  type PrintSize,
} from "@/lib/crop-core";

/**
 * The crop stage's size panel (13_crop: R2–R5, R9–R14): the two millimetre
 * inputs with their inline validation, the built-in preset buttons, Swap
 * orientation, Fit / Fill / Reset, the live readout with its resolution
 * caution/warning and the working-cap note, and Apply crop / Cancel.
 *
 * Everything numeric comes from the pure core — this component only formats.
 * The millimetre values are RATIO-ONLY (option A): they never resample the
 * image, they derive the locked aspect ratio and make the px/mm readout honest.
 */

/** `71.7` → `"71.7"`, `94` → `"94"` — no trailing zeros in the inputs. */
export function formatMm(value: number): string {
  return String(value);
}

export function CropSizePanel({
  size,
  widthDraft,
  heightDraft,
  widthError,
  heightError,
  rect,
  imgW,
  imgH,
  busy,
  onWidthDraftChange,
  onHeightDraftChange,
  onPreset,
  onSwap,
  onFit,
  onFill,
  onReset,
  onApply,
  onCancel,
}: {
  /** The last VALID target size — invalid drafts never reach it (R3). */
  size: PrintSize;
  widthDraft: string;
  heightDraft: string;
  widthError: boolean;
  heightError: boolean;
  rect: CropRect;
  imgW: number;
  imgH: number;
  busy: boolean;
  onWidthDraftChange: (value: string) => void;
  onHeightDraftChange: (value: string) => void;
  onPreset: (preset: CropPreset) => void;
  onSwap: () => void;
  onFit: () => void;
  onFill: () => void;
  onReset: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const invalid = widthError || heightError;
  const kept = pixelsKeptPercent(rect, imgW, imgH);
  const pxPerMm = effectivePxPerMm(rect, size).min;
  const dpi = pxPerMmToDpi(pxPerMm);
  const level = resolutionLevel(pxPerMm);
  const active = matchingPreset(size);
  const rangeHint = `Enter ${MIN_PRINT_MM}–${MAX_PRINT_MM} mm (up to ${MM_MAX_DECIMALS} decimals).`;

  return (
    <section
      data-testid="crop-size-panel"
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 className="text-sm font-semibold">Print size</h2>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="crop-width-mm" className="text-xs font-medium">
            Width (mm)
          </label>
          <input
            id="crop-width-mm"
            type="text"
            inputMode="decimal"
            value={widthDraft}
            aria-invalid={widthError}
            disabled={busy}
            onChange={(event) => onWidthDraftChange(event.target.value)}
            className="h-9 w-24 rounded-md border px-2 text-sm"
          />
          {widthError ? (
            <p role="alert" className="text-xs text-destructive">
              {rangeHint}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="crop-height-mm" className="text-xs font-medium">
            Height (mm)
          </label>
          <input
            id="crop-height-mm"
            type="text"
            inputMode="decimal"
            value={heightDraft}
            aria-invalid={heightError}
            disabled={busy}
            onChange={(event) => onHeightDraftChange(event.target.value)}
            className="h-9 w-24 rounded-md border px-2 text-sm"
          />
          {heightError ? (
            <p role="alert" className="text-xs text-destructive">
              {rangeHint}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onSwap}
          className="mt-5 h-9 rounded-md border px-3 text-xs font-semibold hover:bg-accent"
        >
          Swap orientation
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Presets</span>
        <div className="flex flex-wrap gap-2">
          {CROP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active?.id === preset.id}
              onClick={() => onPreset(preset)}
              className={`h-8 rounded-md border px-2 text-xs hover:bg-accent ${
                active?.id === preset.id ? "bg-accent ring-2 ring-ring" : ""
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onFit}
          className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-accent"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={onFill}
          className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-accent"
        >
          Fill
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-accent"
        >
          Reset
        </button>
      </div>

      {/* Live readout (R10) — recomputed on every rectangle or size change. */}
      <p data-testid="crop-readout" className="text-xs tabular-nums">
        {rect.width} × {rect.height} px · {kept.toFixed(0)}% of pixels kept ·{" "}
        {formatMm(size.widthMm)} × {formatMm(size.heightMm)} mm ·{" "}
        {pxPerMm.toFixed(1)} px/mm ({Math.round(dpi)} dpi)
      </p>

      {level === "low" ? (
        <p role="status" className="text-xs text-muted-foreground">
          Caution: below {PX_PER_MM_COMFORTABLE} px/mm this print may look soft
          — that is fewer than two image pixels per printable feature of a
          0.4 mm nozzle.
        </p>
      ) : null}
      {level === "critical" ? (
        <p role="alert" className="text-xs text-destructive">
          Warning: below {PX_PER_MM_MIN} px/mm visible detail will be lost —
          the image, not the printer, becomes the limit. You can still apply
          the crop.
        </p>
      ) : null}

      {/* R12 — where the numbers come from, and which way they can move. */}
      <p className="text-xs text-muted-foreground">
        Measured on the working image, whose longest side is capped at{" "}
        {WORKING_CAP_PX} px on load. Cropping only ever removes pixels, so the
        effective px/mm can only go down — raise it by choosing a smaller target
        size in mm, never by cropping and never by re-uploading a larger file
        (it is downscaled to the same cap).
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={busy || invalid}
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          Apply crop
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
