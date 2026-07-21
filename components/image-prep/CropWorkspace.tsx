"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CropCanvas } from "@/components/image-prep/CropCanvas";
import { CropSizePanel, formatMm } from "@/components/image-prep/CropSizePanel";
import {
  DEFAULT_PRINT_SIZE,
  NUDGE_COARSE_PX,
  NUDGE_PX,
  aspectRatio,
  fillRect,
  fitRect,
  moveRect,
  parseMmInput,
  refitRect,
  swapOrientation,
  type CropPreset,
  type CropRect,
  type PrintSize,
} from "@/lib/crop-core";
import type { PixelBuffer } from "@/lib/image-prep-core";

/**
 * The crop workspace (13_crop: R2–R12, R14, R19, R20) — replaces the
 * before/after preview while the crop stage is active.
 *
 * It owns every TRANSIENT crop state (the target size, the two millimetre
 * drafts and their per-field errors, the rectangle) exactly as
 * `FlattenWorkspace` owns the transient flatten state; the DURABLE stage state
 * lives in the island. The crop stage holds NO image edits, so there is nothing
 * to undo here beyond Reset and there is no Redo — Cancel is a pure stage
 * restore in the island (R14).
 *
 * The stage is entered fresh every time (R1), so the "entry" target size that
 * Reset restores is always `DEFAULT_PRINT_SIZE`.
 */

/**
 * The feature-12 text-entry guard, repeated here (it is private to
 * `FlattenWorkspace`, which this feature does not modify): keys are ignored
 * while focus is in a TEXT-entry control, so typing `5` in a millimetre field
 * never nudges the rectangle (R19).
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

export function CropWorkspace({
  working,
  busy,
  onApply,
  onCancel,
}: {
  /** The framing reference: the newest completed stage's image (R1). */
  working: PixelBuffer;
  busy: boolean;
  /** Commit the crop — the island crops the pipeline SOURCE with it (R13). */
  onApply: (rect: CropRect) => void;
  /** Leave the stage with nothing changed (R14). */
  onCancel: () => void;
}) {
  const [size, setSize] = useState<PrintSize>(DEFAULT_PRINT_SIZE);
  const [widthDraft, setWidthDraft] = useState(
    formatMm(DEFAULT_PRINT_SIZE.widthMm),
  );
  const [heightDraft, setHeightDraft] = useState(
    formatMm(DEFAULT_PRINT_SIZE.heightMm),
  );
  const [widthError, setWidthError] = useState(false);
  const [heightError, setHeightError] = useState(false);
  const [rect, setRect] = useState<CropRect>(() =>
    fitRect(working.width, working.height, aspectRatio(DEFAULT_PRINT_SIZE)),
  );

  const ratio = aspectRatio(size);

  // Mirror the current size for the [working] effect below, which must NOT
  // re-run when the size changes (that path re-locks, it does not re-fit).
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // A replaced reference image invalidates the rectangle — re-Fit it.
  useEffect(() => {
    setRect(
      fitRect(working.width, working.height, aspectRatio(sizeRef.current)),
    );
  }, [working]);

  /** Adopt a new VALID target size: re-lock the rectangle to its ratio (R2). */
  const adoptSize = useCallback(
    (next: PrintSize) => {
      setSize(next);
      setWidthDraft(formatMm(next.widthMm));
      setHeightDraft(formatMm(next.heightMm));
      setWidthError(false);
      setHeightError(false);
      setRect((current) =>
        refitRect(current, aspectRatio(next), working.width, working.height),
      );
    },
    [working],
  );

  /**
   * One millimetre field changed (R2, R3). An invalid draft shows the inline
   * error and leaves the size, the ratio and the rectangle UNTOUCHED — it only
   * blocks Apply.
   */
  const handleDraft = useCallback(
    (axis: "width" | "height", value: string) => {
      const setDraft = axis === "width" ? setWidthDraft : setHeightDraft;
      const setError = axis === "width" ? setWidthError : setHeightError;
      setDraft(value);
      const parsed = parseMmInput(value);
      if (parsed === null) {
        setError(true);
        return;
      }
      setError(false);
      const next =
        axis === "width"
          ? { ...size, widthMm: parsed }
          : { ...size, heightMm: parsed };
      setSize(next);
      setRect((currentRect) =>
        refitRect(currentRect, aspectRatio(next), working.width, working.height),
      );
    },
    [size, working],
  );

  const handlePreset = useCallback(
    (preset: CropPreset) => {
      adoptSize({ widthMm: preset.widthMm, heightMm: preset.heightMm });
    },
    [adoptSize],
  );

  const handleSwap = useCallback(() => {
    adoptSize(swapOrientation(size));
  }, [adoptSize, size]);

  const handleFit = useCallback(() => {
    setRect(fitRect(working.width, working.height, ratio));
  }, [working, ratio]);

  const handleFill = useCallback(() => {
    setRect((current) =>
      fillRect(current, ratio, working.width, working.height),
    );
  }, [working, ratio]);

  /** Reset (R9): the stage-entry target size AND the default Fit rectangle. */
  const handleReset = useCallback(() => {
    setSize(DEFAULT_PRINT_SIZE);
    setWidthDraft(formatMm(DEFAULT_PRINT_SIZE.widthMm));
    setHeightDraft(formatMm(DEFAULT_PRINT_SIZE.heightMm));
    setWidthError(false);
    setHeightError(false);
    setRect(
      fitRect(working.width, working.height, aspectRatio(DEFAULT_PRINT_SIZE)),
    );
  }, [working]);

  // Crop keyboard map (R19), mounted only while the stage is active (this
  // component unmounts with it): arrows nudge, Shift+arrows nudge coarsely,
  // Esc cancels. The palette Ctrl/Cmd+Z listener is inert here (its canUndo
  // needs the quantized stage) and the flatten map is unmounted with its
  // workspace, so there is no double handling.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      if (isTextEntryTarget(event.target)) {
        return;
      }
      const step = event.shiftKey ? NUDGE_COARSE_PX : NUDGE_PX;
      const delta =
        event.key === "ArrowLeft"
          ? { dx: -step, dy: 0 }
          : event.key === "ArrowRight"
            ? { dx: step, dy: 0 }
            : event.key === "ArrowUp"
              ? { dx: 0, dy: -step }
              : event.key === "ArrowDown"
                ? { dx: 0, dy: step }
                : null;
      if (delta === null) {
        return;
      }
      event.preventDefault();
      setRect((current) =>
        moveRect(current, delta.dx, delta.dy, working.width, working.height),
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, working]);

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Crop workspace</h2>

      <CropCanvas
        working={working}
        rect={rect}
        ratio={ratio}
        onRectChange={setRect}
      />

      <CropSizePanel
        size={size}
        widthDraft={widthDraft}
        heightDraft={heightDraft}
        widthError={widthError}
        heightError={heightError}
        rect={rect}
        imgW={working.width}
        imgH={working.height}
        busy={busy}
        onWidthDraftChange={(value) => handleDraft("width", value)}
        onHeightDraftChange={(value) => handleDraft("height", value)}
        onPreset={handlePreset}
        onSwap={handleSwap}
        onFit={handleFit}
        onFill={handleFill}
        onReset={handleReset}
        onApply={() => onApply(rect)}
        onCancel={onCancel}
      />
    </section>
  );
}
