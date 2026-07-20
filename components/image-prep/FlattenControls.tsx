"use client";

import {
  DESPECKLE_MAX_REGION_PX,
  PRESET_MAX_REGION_PX,
  type MaskMode,
} from "@/lib/flatten-core";

/**
 * Flatten tool controls (12_flatten: R8, R9, R18–R22, R26): mask-mode radio
 * group (Flood / Smooth / Brush), the current tolerance-or-radius readout with
 * the W/S caption, the catch-stray-pixels checkbox (flood/smooth only, R9), the
 * Low/Medium/High auto-flatten presets and Despeckle (R18, R19), Undo, Reset
 * all, and the regions-flattened counter. Every mutation control is disabled
 * while the worker is busy.
 */
export function FlattenControls({
  mode,
  onModeChange,
  tolerance,
  brushRadius,
  catchStrays,
  onCatchStraysChange,
  onCleanup,
  busy,
  canUndo,
  onUndo,
  onResetAll,
  regionsFlattened,
}: {
  mode: MaskMode;
  onModeChange: (mode: MaskMode) => void;
  /** Current flood/smooth tolerance (redmean units) (R5, R6, R8). */
  tolerance: number;
  /** Current brush radius in pixels (R7, R8). */
  brushRadius: number;
  /** Whether the flood/smooth mask also captures nearby strays (R9). */
  catchStrays: boolean;
  onCatchStraysChange: (value: boolean) => void;
  /** Run remove-small-regions image-wide with the given threshold (R18, R19). */
  onCleanup: (maxRegionPx: number) => void;
  busy: boolean;
  /** Whether a prior flatten state exists to revert to (R20). */
  canUndo: boolean;
  onUndo: () => void;
  /** Restore the stage-entry snapshot (R21). */
  onResetAll: () => void;
  /** Total regions collapsed since entering the stage (R22). */
  regionsFlattened: number;
}) {
  return (
    <section className="flex w-full flex-col gap-3 rounded-lg border p-4 lg:max-w-xs">
      <h2 className="text-sm font-semibold">Flatten tools</h2>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-medium">Mode</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="radio"
              name="flatten-mode"
              checked={mode === "flood"}
              onChange={() => onModeChange("flood")}
            />
            Flood
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="radio"
              name="flatten-mode"
              checked={mode === "smooth"}
              onChange={() => onModeChange("smooth")}
            />
            Smooth
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="radio"
              name="flatten-mode"
              checked={mode === "brush"}
              onChange={() => onModeChange("brush")}
            />
            Brush
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-0.5">
        <p className="text-xs tabular-nums">
          {mode === "brush"
            ? `Brush radius: ${brushRadius}`
            : `Tolerance: ${tolerance}`}
        </p>
        <p className="text-xs text-muted-foreground">W grow · S shrink</p>
      </div>

      {mode !== "brush" ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={catchStrays}
            onChange={(event) => onCatchStraysChange(event.target.checked)}
          />
          Catch stray pixels
        </label>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium">Auto-flatten</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onCleanup(PRESET_MAX_REGION_PX.low)}
            className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            Low
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCleanup(PRESET_MAX_REGION_PX.medium)}
            className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            Medium
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCleanup(PRESET_MAX_REGION_PX.high)}
            className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            High
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCleanup(DESPECKLE_MAX_REGION_PX)}
            className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            Despeckle
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onResetAll}
          className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
        >
          Reset all
        </button>
      </div>

      <p className="text-xs text-muted-foreground tabular-nums">
        {regionsFlattened} regions flattened
      </p>
    </section>
  );
}
