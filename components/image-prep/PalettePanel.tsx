"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_MERGE_DISTANCE,
  DEFAULT_TINY_COVERAGE_PERCENT,
  classifyPalette,
  coveragePercent,
  rgbToHex,
  type IndexedImage,
} from "@/lib/image-prep-core";

/**
 * Palette cleanup panel (R9–R14): the quantized palette split into Neutrals
 * (light→dark) and Colors (by hue), each entry a toggle button with swatch,
 * hex, coverage % — and the filament name once snapped (R13). Tap one entry
 * to select it, tap ANOTHER to merge selected→tapped; tapping the selected
 * entry again deselects without merging (R10). Below: merge-similar,
 * merge-tiny, and snap-to-filaments controls; snap is disabled with an
 * explanatory note when the catalog is empty (R14).
 */
export function PalettePanel({
  image,
  catalogEmpty,
  busy,
  onMerge,
  onMergeSimilar,
  onMergeTiny,
  onSnap,
}: {
  image: IndexedImage;
  catalogEmpty: boolean;
  busy: boolean;
  onMerge: (from: number, into: number) => void;
  onMergeSimilar: (threshold: number) => void;
  onMergeTiny: (coveragePercentThreshold: number) => void;
  onSnap: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mergeDistance, setMergeDistance] = useState(DEFAULT_MERGE_DISTANCE);
  const [tinyPercent, setTinyPercent] = useState(
    DEFAULT_TINY_COVERAGE_PERCENT,
  );

  // A new palette (merge/snap result or fresh quantize) invalidates any
  // selection — a stale index would point at the wrong entry.
  useEffect(() => {
    setSelected(null);
  }, [image]);

  const { neutrals, colors } = classifyPalette(image);

  function handleTap(index: number) {
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    const from = selected;
    setSelected(null);
    onMerge(from, index);
  }

  const entryButton = (index: number) => {
    const entry = image.entries[index];
    const hex = entry.catalog ? entry.catalog.hex : rgbToHex(entry.color);
    const coverage = coveragePercent(entry, image).toFixed(1);
    return (
      <button
        key={index}
        type="button"
        aria-pressed={selected === index}
        disabled={busy}
        onClick={() => handleTap(index)}
        className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs hover:bg-accent disabled:opacity-50 ${
          selected === index ? "ring-2 ring-ring" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="inline-block size-3 rounded-full border"
          style={{ backgroundColor: hex }}
        />
        {entry.catalog ? (
          <span className="font-medium">{entry.catalog.name}</span>
        ) : null}
        <span className="tabular-nums">{hex}</span>
        <span className="tabular-nums text-muted-foreground">{coverage}%</span>
      </button>
    );
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Palette</h2>
      <p className="text-xs text-muted-foreground">
        Tap an entry, then tap another to merge the first into the second.
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">Neutrals</h3>
        {neutrals.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {neutrals.map(entryButton)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">None</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">Colors</h3>
        {colors.length > 0 ? (
          <div className="flex flex-wrap gap-2">{colors.map(entryButton)}</div>
        ) : (
          <p className="text-xs text-muted-foreground">None</p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="merge-similar-threshold"
            className="w-40 text-xs font-medium"
          >
            Similarity threshold
          </label>
          <input
            id="merge-similar-threshold"
            type="range"
            min={0}
            max={150}
            step={1}
            value={mergeDistance}
            disabled={busy}
            onChange={(event) => setMergeDistance(Number(event.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs tabular-nums">
            {mergeDistance}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onMergeSimilar(mergeDistance)}
            className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            Merge similar
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="merge-tiny-threshold"
            className="w-40 text-xs font-medium"
          >
            Tiny coverage (%)
          </label>
          <input
            id="merge-tiny-threshold"
            type="range"
            min={0}
            max={20}
            step={1}
            value={tinyPercent}
            disabled={busy}
            onChange={(event) => setTinyPercent(Number(event.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs tabular-nums">
            {tinyPercent}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onMergeTiny(tinyPercent)}
            className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            Merge tiny
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t pt-3">
        <div>
          <button
            type="button"
            disabled={busy || catalogEmpty}
            onClick={onSnap}
            className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
          >
            Snap to filaments
          </button>
        </div>
        {catalogEmpty ? (
          <p className="text-xs text-muted-foreground">
            The color catalog is empty — add filament colors in Catalogs to
            enable snapping.
          </p>
        ) : null}
      </div>
    </section>
  );
}
