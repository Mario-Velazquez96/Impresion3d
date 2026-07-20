"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FlattenCanvas } from "@/components/image-prep/FlattenCanvas";
import { FlattenControls } from "@/components/image-prep/FlattenControls";
import { FlattenFillPanel } from "@/components/image-prep/FlattenFillPanel";
import type { RequestFn } from "@/components/image-prep/useImagePrepWorker";
import {
  BRUSH_RADIUS_STEP,
  DEFAULT_BRUSH_RADIUS,
  DEFAULT_FLOOD_TOLERANCE,
  MAX_BRUSH_RADIUS,
  MAX_TOLERANCE,
  MIN_BRUSH_RADIUS,
  MIN_TOLERANCE,
  TOLERANCE_STEP,
  brushMask,
  buildFlattenOverlay,
  colorAtPixel,
  maskContains,
  maskPixelCount,
  maskStats,
  parseHexInput,
  subtractMask,
  unionMasks,
  type Mask,
  type MaskMode,
} from "@/lib/flatten-core";
import type { PixelBuffer, Rgb } from "@/lib/image-prep-core";

/**
 * The flatten workspace (12_flatten: R4–R16, R25, R26) — replaces the
 * before/after preview while the flatten stage is active. Owns every
 * TRANSIENT flatten UI state: mask mode + sizes, the selection (disjoint
 * regions by construction, R10), the hover mask, the chosen fill + hex draft
 * + pick mode. Durable stage state (working image, undo history, counter)
 * lives in the island; mutations are posted through the island's single
 * worker `request` and reported up via `onMutated`.
 *
 * Hover pipeline (R4): flood masks are computed in the Web Worker as
 * BACKGROUND requests (never flipping the global busy state, R26) with at
 * most one in flight — pointer/settings changes while a request is pending
 * mark it stale; the stale response is discarded and immediately re-issued
 * with the newest state. Brush masks are O(radius²) and computed
 * synchronously on the main thread.
 */

/** One selected region; regions are disjoint by construction (R10, R11). */
type SelectedRegion = { id: number; mask: Mask };

/** Copy pixels into a fresh transferable ArrayBuffer (state stays intact). */
function copyPixels(pixels: PixelBuffer): ArrayBuffer {
  return pixels.data.slice().buffer as ArrayBuffer;
}

/**
 * R8/R20 guard: keys are ignored while focus is in a TEXT-entry control.
 * Radios/checkboxes/buttons don't consume letter keys, so they stay live.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return (
    target instanceof HTMLInputElement &&
    target.type !== "radio" &&
    target.type !== "checkbox" &&
    target.type !== "range" &&
    target.type !== "button"
  );
}

export function FlattenWorkspace({
  current,
  fileName,
  request,
  busy,
  regionsFlattened,
  canUndo,
  onMutated,
  onUndo,
  onResetAll,
}: {
  /** The flatten working image (island state). */
  current: PixelBuffer;
  /** Original upload name for Download (R27). */
  fileName: string;
  /** The island's single worker request function (one worker total, R26). */
  request: RequestFn;
  busy: boolean;
  /** Regions collapsed since stage entry (R22). */
  regionsFlattened: number;
  /** Whether the flatten undo history has a prior state (R20). */
  canUndo: boolean;
  /** Report a completed mutation: the new image + regions collapsed (R16). */
  onMutated: (pixels: PixelBuffer, regionsCollapsed: number) => void;
  onUndo: () => void;
  onResetAll: () => void;
}) {
  const [mode, setMode] = useState<MaskMode>("flood");
  const [tolerance, setTolerance] = useState(DEFAULT_FLOOD_TOLERANCE);
  const [brushRadius, setBrushRadius] = useState(DEFAULT_BRUSH_RADIUS);
  const [regions, setRegions] = useState<SelectedRegion[]>([]);
  const [hover, setHover] = useState<Mask | null>(null);
  const [hoverSeed, setHoverSeed] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [fillOverride, setFillOverride] = useState<Rgb | null>(null);
  const [hexDraft, setHexDraft] = useState("");
  const [hexError, setHexError] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRegionIdRef = useRef(0);
  const hoverInFlightRef = useRef(false);

  // Replacing the working image (fill, undo, reset) invalidates the selection
  // and any hover mask — stale masks over changed pixels are never shown (R12).
  useEffect(() => {
    setRegions([]);
    setHover(null);
    setHoverSeed(null);
  }, [current]);

  // The chosen fill resets to the suggested color whenever the selection
  // changes (R13); the hex draft and its error reset with it.
  useEffect(() => {
    setFillOverride(null);
    setHexDraft("");
    setHexError(false);
  }, [regions]);

  // Derived selection state, memoized on exactly (regions, image) (R10, R13).
  const combined = useMemo(
    () =>
      unionMasks(
        regions.map((region) => region.mask),
        current.width,
        current.height,
      ),
    [regions, current],
  );
  const selectedPx = useMemo(() => maskPixelCount(combined), [combined]);
  const stats = useMemo(
    () => maskStats(current, combined),
    [current, combined],
  );
  const suggested = stats.length > 0 ? stats[0] : null;
  const chosenFill = fillOverride ?? suggested?.color ?? null;

  // Hover pipeline (R4): recompute whenever the pointer or the mask inputs
  // change. Brush is synchronous; flood posts a BACKGROUND worker request
  // with at most one in flight — a stale response re-triggers this effect by
  // refreshing the seed identity so the newest pointer state wins.
  useEffect(() => {
    if (hoverSeed === null || pickMode || busy) {
      setHover(null);
      return;
    }
    if (mode === "brush") {
      setHover(
        brushMask(
          current.width,
          current.height,
          hoverSeed.x,
          hoverSeed.y,
          brushRadius,
        ),
      );
      return;
    }
    if (hoverInFlightRef.current) {
      return; // the in-flight completion re-runs this effect with fresh state
    }
    hoverInFlightRef.current = true;
    let stale = false;
    const source = current;
    request(
      {
        op: "mask",
        buffer: copyPixels(source),
        width: source.width,
        height: source.height,
        seedX: hoverSeed.x,
        seedY: hoverSeed.y,
        mode,
        tolerance,
        catchStrays: false,
      },
      { background: true },
    )
      .then((result) => {
        hoverInFlightRef.current = false;
        if (stale) {
          // Inputs changed while in flight — discard, re-issue with newest.
          setHoverSeed((seed) => (seed === null ? null : { ...seed }));
          return;
        }
        setHover({
          width: source.width,
          height: source.height,
          data: new Uint8Array(result.mask),
        });
      })
      .catch(() => {
        hoverInFlightRef.current = false; // silent — the next move retries
      });
    return () => {
      stale = true;
    };
  }, [hoverSeed, pickMode, busy, mode, brushRadius, tolerance, current, request]);

  const handleHoverPixel = useCallback(
    (pixel: { x: number; y: number } | null) => {
      setHoverSeed(pixel);
    },
    [],
  );

  // Canvas click (R10, R11, R15): eyedropper picks the fill; a click on a
  // selected pixel removes its region; otherwise the hovered mask minus the
  // existing selection joins as a new (disjoint) region.
  const handleClickPixel = useCallback(
    (x: number, y: number) => {
      if (pickMode) {
        setFillOverride(colorAtPixel(current, x, y));
        setHexDraft("");
        setHexError(false);
        return;
      }
      if (maskContains(combined, x, y)) {
        setRegions((prev) =>
          prev.filter((region) => !maskContains(region.mask, x, y)),
        );
        return;
      }
      const mask =
        mode === "brush"
          ? brushMask(current.width, current.height, x, y, brushRadius)
          : hover;
      if (mask === null) {
        return; // flood hover still computing — nothing to add yet
      }
      const region = subtractMask(mask, combined);
      if (maskPixelCount(region) === 0) {
        return;
      }
      setRegions((prev) => [
        ...prev,
        { id: nextRegionIdRef.current++, mask: region },
      ]);
    },
    [pickMode, current, combined, mode, brushRadius, hover],
  );

  const clearSelection = useCallback(() => {
    setRegions([]);
  }, []);

  // Flatten selection (R16): fill every selected pixel with the chosen color
  // in the worker; the island replaces the image, bumps the counter by the
  // REGION count, and pushes the undo history. The [current] effect then
  // clears the selection.
  const flattenSelection = useCallback(async () => {
    if (busy || regions.length === 0 || chosenFill === null) {
      return;
    }
    try {
      const result = await request({
        op: "flatten",
        buffer: copyPixels(current),
        width: current.width,
        height: current.height,
        action: {
          kind: "fill",
          mask: combined.data.slice().buffer as ArrayBuffer,
          fill: chosenFill,
        },
      });
      setError(null);
      onMutated(
        {
          width: result.pixels.width,
          height: result.pixels.height,
          data: new Uint8ClampedArray(result.pixels.buffer),
        },
        regions.length,
      );
    } catch {
      setError("Flattening the selection failed — try again.");
    }
  }, [busy, regions.length, chosenFill, current, combined, request, onMutated]);

  // Live hex validation (R14): valid values become the chosen fill; invalid
  // non-empty values show the inline error and change nothing.
  const handleHexChange = useCallback((value: string) => {
    setHexDraft(value);
    if (value.trim() === "") {
      setHexError(false);
      return;
    }
    const parsed = parseHexInput(value);
    if (parsed === null) {
      setHexError(true);
      return;
    }
    setHexError(false);
    setFillOverride(parsed);
  }, []);

  // W/S size stepping, clamped to the exported ranges (R8).
  const stepSize = useCallback(
    (direction: 1 | -1) => {
      if (mode === "brush") {
        setBrushRadius((radius) =>
          Math.min(
            MAX_BRUSH_RADIUS,
            Math.max(MIN_BRUSH_RADIUS, radius + direction * BRUSH_RADIUS_STEP),
          ),
        );
      } else {
        setTolerance((value) =>
          Math.min(
            MAX_TOLERANCE,
            Math.max(MIN_TOLERANCE, value + direction * TOLERANCE_STEP),
          ),
        );
      }
    },
    [mode],
  );

  // Flatten keyboard map (R8, R12, R16, R20) — mounted only while the stage
  // is active (this component unmounts with it). The palette Ctrl/Cmd+Z
  // listener stays inert during flatten (its canUndo needs the quantized
  // stage), so there is no double handling.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if (isTextEntryTarget(event.target)) {
        return;
      }
      if (event.key === "w" || event.key === "W") {
        stepSize(1);
        return;
      }
      if (event.key === "s" || event.key === "S") {
        stepSize(-1);
        return;
      }
      if (event.key === "Enter") {
        if (event.target instanceof HTMLButtonElement) {
          return; // keep Enter-activating focused buttons intact
        }
        event.preventDefault();
        void flattenSelection();
        return;
      }
      const undoKey =
        (event.key === "z" || event.key === "Z") &&
        !event.shiftKey &&
        !event.altKey;
      if (undoKey && canUndo) {
        event.preventDefault();
        onUndo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, stepSize, flattenSelection, canUndo, onUndo]);

  // The overlay repaints only when its actual inputs change; hover is
  // suppressed while picking (R15).
  const overlay = useMemo(
    () =>
      buildFlattenOverlay({
        width: current.width,
        height: current.height,
        hover: pickMode ? null : hover,
        selection: selectedPx > 0 ? combined : null,
      }),
    [current, pickMode, hover, selectedPx, combined],
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Flatten workspace</h2>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <FlattenCanvas
        current={current}
        overlay={overlay}
        pickMode={pickMode}
        fileName={fileName}
        onHoverPixel={handleHoverPixel}
        onClickPixel={handleClickPixel}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <FlattenControls
          mode={mode}
          onModeChange={setMode}
          tolerance={tolerance}
          brushRadius={brushRadius}
          busy={busy}
          canUndo={canUndo}
          onUndo={onUndo}
          onResetAll={onResetAll}
          regionsFlattened={regionsFlattened}
        />

        {selectedPx > 0 && chosenFill !== null ? (
          <FlattenFillPanel
            selectedPx={selectedPx}
            stats={stats}
            chosenFill={chosenFill}
            onChooseFill={setFillOverride}
            hexDraft={hexDraft}
            hexError={hexError}
            onHexChange={handleHexChange}
            pickMode={pickMode}
            onTogglePickMode={() => setPickMode((on) => !on)}
            onFlatten={() => void flattenSelection()}
            onClear={clearSelection}
            busy={busy}
          />
        ) : null}
      </div>
    </section>
  );
}
