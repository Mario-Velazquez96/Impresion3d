"use client";

import type { MaskMode } from "@/lib/flatten-core";

/**
 * Flatten tool controls (12_flatten: R8, R20, R21, R22, R26): mask-mode radio
 * group (Flood / Brush in Phase A; Smooth arrives in Phase B), the current
 * tolerance-or-radius readout with the W/S caption, Undo, Reset all, and the
 * regions-flattened counter. Every mutation control is disabled while the
 * worker is busy; presets and Despeckle arrive in Phase C.
 */
export function FlattenControls({
  mode,
  onModeChange,
  tolerance,
  brushRadius,
  busy,
  canUndo,
  onUndo,
  onResetAll,
  regionsFlattened,
}: {
  mode: MaskMode;
  onModeChange: (mode: MaskMode) => void;
  /** Current flood tolerance (redmean units) (R5, R8). */
  tolerance: number;
  /** Current brush radius in pixels (R7, R8). */
  brushRadius: number;
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
