"use client";

import { useState } from "react";

import {
  DEFAULT_COLORS,
  MAX_COLORS,
  MIN_COLORS,
} from "@/lib/image-prep-core";

/**
 * Posterize controls (R7, R8): the color-count slider (2–64, default 8), the
 * dithering checkbox (OFF by default — flat bands print better in HueForge),
 * and the Posterize button (disabled with no image and while busy, R18).
 * Slider movement is local state only; the worker runs on button press.
 */
export function PosterizePanel({
  onPosterize,
  disabled,
  busy,
}: {
  onPosterize: (colors: number, dither: boolean) => void;
  disabled: boolean;
  busy: boolean;
}) {
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [dither, setDither] = useState(false);

  const inactive = disabled || busy;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Posterize</h2>

      <div className="flex items-center gap-2">
        <label htmlFor="posterize-colors" className="w-24 text-xs font-medium">
          Colors
        </label>
        <input
          id="posterize-colors"
          type="range"
          min={MIN_COLORS}
          max={MAX_COLORS}
          step={1}
          value={colors}
          disabled={inactive}
          onChange={(event) => setColors(Number(event.target.value))}
          className="max-w-[12rem] flex-1"
        />
        <span className="w-10 text-right text-xs tabular-nums">{colors}</span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={dither}
            disabled={inactive}
            onChange={(event) => setDither(event.target.checked)}
          />
          Dithering (Floyd–Steinberg)
        </label>
        <p className="text-xs text-muted-foreground">
          Diffuses color banding into a fine speckle. Leave off for flat, solid
          bands — they print cleaner in HueForge.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => onPosterize(colors, dither)}
          disabled={inactive}
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          Posterize
        </button>
      </div>
    </section>
  );
}
