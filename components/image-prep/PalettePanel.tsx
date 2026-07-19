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
 * Palette cleanup panel (R9–R14, R21, R22): the quantized palette split into
 * Neutrals (light→dark) and Colors (by hue), each entry a toggle button with
 * swatch, hex, coverage % — and the filament name once snapped (R13). Tapping
 * a swatch TOGGLES it in/out of a multi-selection (R22); with entries
 * selected an action bar appears offering **Merge to average** (all selected
 * collapse into one count-weighted average color), **Merge into one of
 * them…** (choose the survivor — it keeps its color and catalog link), and
 * **Clear**. Selection is CONTROLLED by the island so "Pick from image" (R21)
 * can toggle it from a canvas click. Below: merge-similar, merge-tiny, and
 * snap-to-filaments controls; snap is disabled with an explanatory note when
 * the catalog is empty (R14). An Undo button reverts the last palette-cleanup
 * action back toward the freshly-posterized palette (R20).
 */
export function PalettePanel({
  image,
  catalogEmpty,
  busy,
  canUndo,
  onUndo,
  selected,
  onToggleSelected,
  onClearSelection,
  pickMode,
  onTogglePickMode,
  onMergeMany,
  onMergeAverage,
  onMergeSimilar,
  onMergeTiny,
  onSnap,
}: {
  image: IndexedImage;
  catalogEmpty: boolean;
  busy: boolean;
  /** Whether a prior palette state exists to revert to (R20). */
  canUndo: boolean;
  /** Revert the last palette-cleanup action (merge / snap) (R20). */
  onUndo: () => void;
  /** The multi-selected entry indices, lifted to the island (R21, R22). */
  selected: number[];
  /** Toggle one entry in/out of the selection (R22). */
  onToggleSelected: (index: number) => void;
  /** Empty the selection (the action bar's Clear) (R22). */
  onClearSelection: () => void;
  /** Whether the eyedropper "Pick from image" mode is active (R21). */
  pickMode: boolean;
  /** Toggle the eyedropper mode on/off (R21). */
  onTogglePickMode: () => void;
  /** Merge every `from` entry into the surviving `into` entry (R22). */
  onMergeMany: (from: number[], into: number) => void;
  /** Merge the selected entries into their count-weighted average (R22). */
  onMergeAverage: (indices: number[]) => void;
  onMergeSimilar: (threshold: number) => void;
  onMergeTiny: (coveragePercentThreshold: number) => void;
  onSnap: () => void;
}) {
  const [mergeDistance, setMergeDistance] = useState(DEFAULT_MERGE_DISTANCE);
  const [tinyPercent, setTinyPercent] = useState(
    DEFAULT_TINY_COVERAGE_PERCENT,
  );
  // Whether the "Merge into one of them…" target chooser is open — local UI
  // state; a new palette closes it (the selection resets in the island).
  const [choosingTarget, setChoosingTarget] = useState(false);

  useEffect(() => {
    setChoosingTarget(false);
  }, [image]);

  const { neutrals, colors } = classifyPalette(image);

  // The island resets the selection AFTER the frame that swaps in a new
  // palette, so guard against momentarily-stale indices before using them.
  const activeSelection = selected.filter((i) => i < image.entries.length);
  const canMerge = activeSelection.length >= 2;

  const entryButton = (index: number) => {
    const entry = image.entries[index];
    const hex = entry.catalog ? entry.catalog.hex : rgbToHex(entry.color);
    const coverage = coveragePercent(entry, image).toFixed(1);
    const isSelected = activeSelection.includes(index);
    return (
      <button
        key={index}
        type="button"
        aria-pressed={isSelected}
        disabled={busy}
        onClick={() => onToggleSelected(index)}
        className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs hover:bg-accent disabled:opacity-50 ${
          isSelected ? "ring-2 ring-ring" : ""
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
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">Palette</h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-pressed={pickMode}
            disabled={busy}
            onClick={onTogglePickMode}
            className={`h-8 shrink-0 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50 ${
              pickMode ? "bg-accent ring-2 ring-ring" : ""
            }`}
          >
            Pick from image
          </button>
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="h-8 shrink-0 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tap entries to select them, then merge below. &ldquo;Pick from
        image&rdquo; toggles the palette color under a click on the preview.
        Undo reverts palette edits back to the freshly-posterized colors.
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

      {activeSelection.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">
              {activeSelection.length} selected
            </span>
            <button
              type="button"
              disabled={busy || !canMerge}
              onClick={() => onMergeAverage(activeSelection)}
              className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
            >
              Merge to average
            </button>
            <button
              type="button"
              aria-expanded={choosingTarget && canMerge}
              disabled={busy || !canMerge}
              onClick={() => setChoosingTarget((open) => !open)}
              className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
            >
              Merge into one of them…
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setChoosingTarget(false);
                onClearSelection();
              }}
              className="h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          {choosingTarget && canMerge ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Choose the entry the others merge into — it keeps its color
                and filament.
              </p>
              <div className="flex flex-wrap gap-2">
                {activeSelection.map((index) => {
                  const entry = image.entries[index];
                  const hex = entry.catalog
                    ? entry.catalog.hex
                    : rgbToHex(entry.color);
                  const label = entry.catalog
                    ? `Merge into ${entry.catalog.name} ${hex}`
                    : `Merge into ${hex}`;
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-label={label}
                      disabled={busy}
                      onClick={() => {
                        setChoosingTarget(false);
                        onMergeMany(
                          activeSelection.filter((i) => i !== index),
                          index,
                        );
                      }}
                      className="flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs hover:bg-accent disabled:opacity-50"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 rounded-full border"
                        style={{ backgroundColor: hex }}
                      />
                      {entry.catalog ? (
                        <span className="font-medium">
                          {entry.catalog.name}
                        </span>
                      ) : null}
                      <span className="tabular-nums">{hex}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
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
          <p className="text-xs text-muted-foreground">
            Merge similar collapses palette colors closer than this distance
            into one. Higher merges more aggressively.
          </p>
        </div>

        <div className="flex flex-col gap-1">
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
          <p className="text-xs text-muted-foreground">
            Merge tiny absorbs any palette color covering less than this % of
            the image into its nearest neighbor.
          </p>
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
