"use client";

import { useState } from "react";

import {
  IDENTITY_ADJUSTMENTS,
  type AdjustSettings,
} from "@/lib/image-prep-core";

/**
 * Adjustment controls (R5): brightness/contrast/saturation/gamma sliders with
 * identity defaults, the auto-levels checkbox, Reset, and Apply. Moving a
 * slider only updates LOCAL state — nothing recomputes until Apply posts the
 * settings to the worker (on-demand by design; R5). Controls disable while
 * the worker is busy or no image is loaded (R18).
 */
export function AdjustPanel({
  onApply,
  disabled,
  busy,
}: {
  onApply: (settings: AdjustSettings) => void;
  disabled: boolean;
  busy: boolean;
}) {
  const [brightness, setBrightness] = useState(IDENTITY_ADJUSTMENTS.brightness);
  const [contrast, setContrast] = useState(IDENTITY_ADJUSTMENTS.contrast);
  const [saturation, setSaturation] = useState(IDENTITY_ADJUSTMENTS.saturation);
  const [gamma, setGamma] = useState(IDENTITY_ADJUSTMENTS.gamma);
  const [autoLevels, setAutoLevels] = useState(IDENTITY_ADJUSTMENTS.autoLevels);

  const inactive = disabled || busy;

  function reset() {
    setBrightness(IDENTITY_ADJUSTMENTS.brightness);
    setContrast(IDENTITY_ADJUSTMENTS.contrast);
    setSaturation(IDENTITY_ADJUSTMENTS.saturation);
    setGamma(IDENTITY_ADJUSTMENTS.gamma);
    setAutoLevels(IDENTITY_ADJUSTMENTS.autoLevels);
  }

  const slider = (
    id: string,
    label: string,
    value: number,
    setValue: (v: number) => void,
    min: number,
    max: number,
    step: number,
  ) => (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-24 text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={inactive}
        onChange={(event) => setValue(Number(event.target.value))}
        className="max-w-[12rem] flex-1"
      />
      <span className="w-10 text-right text-xs tabular-nums">{value}</span>
    </div>
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Adjust</h2>

      {slider("adjust-brightness", "Brightness", brightness, setBrightness, -100, 100, 1)}
      {slider("adjust-contrast", "Contrast", contrast, setContrast, -100, 100, 1)}
      {slider("adjust-saturation", "Saturation", saturation, setSaturation, -100, 100, 1)}
      {slider("adjust-gamma", "Gamma", gamma, setGamma, 0.2, 3, 0.1)}

      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          checked={autoLevels}
          disabled={inactive}
          onChange={(event) => setAutoLevels(event.target.checked)}
        />
        Auto levels
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={inactive}
          className="h-9 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() =>
            onApply({ brightness, contrast, gamma, saturation, autoLevels })
          }
          disabled={inactive}
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </section>
  );
}
