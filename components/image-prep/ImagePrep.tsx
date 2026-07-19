"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdjustPanel } from "@/components/image-prep/AdjustPanel";
import { BeforeAfterPreview } from "@/components/image-prep/BeforeAfterPreview";
import { HistogramChart } from "@/components/image-prep/HistogramChart";
import { ImageDropzone } from "@/components/image-prep/ImageDropzone";
import { PalettePanel } from "@/components/image-prep/PalettePanel";
import { PosterizePanel } from "@/components/image-prep/PosterizePanel";
import type { DecodedImage } from "@/components/image-prep/decode";
import type {
  ColorView,
  LoadedImageInfo,
} from "@/components/image-prep/types";
import { useImagePrepWorker } from "@/components/image-prep/useImagePrepWorker";
import {
  deserializeIndexedImage,
  serializeIndexedImage,
  type PaletteAction,
  type PixelPayload,
} from "@/components/image-prep/worker-messages";
import {
  paletteIndexAt,
  type AdjustSettings,
  type IndexedImage,
  type PixelBuffer,
} from "@/lib/image-prep-core";

/**
 * The image-prep Client island (11_image_prep: R2–R18). Owns the whole
 * pipeline as STAGE state — `empty → loaded → adjusted → quantized` — so
 * upstream changes structurally discard downstream results (R16): Apply
 * builds a fresh `adjusted` stage with no `quantized` fields to survive it,
 * and loading a file builds a fresh `loaded` stage. Stale palettes are
 * unrepresentable.
 *
 * Nothing recomputes on slider movement; only the explicit Apply / Posterize /
 * merge / snap buttons post work to the Web Worker (R5, R7, R18). NOTHING is
 * ever persisted — the image enters via the dropzone and leaves only via the
 * Download button (R19).
 */

type LoadedFields = {
  original: PixelBuffer;
  fileName: string;
  fileBytes: number;
  originalDims: { width: number; height: number };
  downscaled: boolean;
};

/**
 * One palette state in the undo history (R20): the image + preview pair a
 * fresh posterize or a palette-cleanup action produces. Undo is a pure pop of
 * this client-only stack — it never re-posts work to the worker.
 */
type PaletteState = { image: IndexedImage; preview: PixelBuffer };

/**
 * Cap the palette undo history so memory stays bounded on large images
 * (R20). Older states beyond the cap are dropped from the front.
 */
const MAX_PALETTE_HISTORY = 20;

type Stage =
  | { kind: "empty" }
  | ({ kind: "loaded" } & LoadedFields)
  | ({ kind: "adjusted" } & LoadedFields & {
      adjusted: PixelBuffer;
      histogram: Uint32Array;
    })
  | ({ kind: "quantized" } & LoadedFields & {
      adjusted: PixelBuffer;
      /** Null when the user posterized without ever applying adjustments. */
      histogram: Uint32Array | null;
      image: IndexedImage;
      preview: PixelBuffer;
      /**
       * Palette-cleanup undo stack (R20). The last entry mirrors the current
       * `image`/`preview`; the fresh-posterize baseline is the sole entry, so
       * Undo is available only once a cleanup action has pushed onto it. The
       * whole stack lives inside the quantized stage, so Apply / load (which
       * build a fresh loaded/adjusted stage) structurally discard it (R16).
       */
      history: PaletteState[];
    });

/** Copy pixels into a fresh transferable ArrayBuffer (state stays intact). */
function copyPixels(pixels: PixelBuffer): ArrayBuffer {
  return pixels.data.slice().buffer as ArrayBuffer;
}

function payloadToPixels(payload: PixelPayload): PixelBuffer {
  return {
    width: payload.width,
    height: payload.height,
    data: new Uint8ClampedArray(payload.buffer),
  };
}

export function ImagePrep({ catalogColors }: { catalogColors: ColorView[] }) {
  const { request, busy } = useImagePrepWorker();
  const [stage, setStage] = useState<Stage>({ kind: "empty" });
  const [opError, setOpError] = useState<string | null>(null);
  // The palette MULTI-selection (R22) lives here (lifted from PalettePanel)
  // so "Pick from image" (R21) can toggle membership from a canvas click.
  // Tapping a swatch toggles it in/out; the merges act on the whole set.
  // `pickMode` toggles the eyedropper.
  const [selected, setSelected] = useState<number[]>([]);
  const [pickMode, setPickMode] = useState(false);

  const hasImage = stage.kind !== "empty";
  const quantizedImage: IndexedImage | null =
    stage.kind === "quantized" ? stage.image : null;

  // A new palette (merge/snap/undo/fresh quantize) or leaving the quantized
  // stage invalidates any selection — stale indices would point at the wrong
  // entries. This preserves PalettePanel's old `[image]` reset after lifting.
  useEffect(() => {
    setSelected([]);
  }, [quantizedImage]);

  // Selection highlight (R23): while the quantized stage holds a non-empty
  // selection, the Preview canvas dims every pixel NOT belonging to a selected
  // entry (union semantics). Memoized on exactly (image, selection) so the
  // preview rebuilds its mask only when either actually changes — a pure
  // render-layer effect; the working image / pipeline data never change.
  const highlight = useMemo(
    () =>
      quantizedImage && selected.length > 0
        ? { image: quantizedImage, selected }
        : null,
    [quantizedImage, selected],
  );

  // Toggle one entry in/out of the multi-selection (R22) — used by both the
  // swatch taps and the eyedropper (R21).
  const toggleSelected = useCallback((index: number) => {
    setSelected((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index],
    );
  }, []);

  const info: LoadedImageInfo | null = hasImage
    ? {
        width: stage.original.width,
        height: stage.original.height,
        fileBytes: stage.fileBytes,
        downscaled: stage.downscaled,
        originalWidth: stage.originalDims.width,
        originalHeight: stage.originalDims.height,
      }
    : null;

  // The newest completed stage feeds both the "after" pane and Download (R15, R17).
  const workingImage: PixelBuffer | null =
    stage.kind === "quantized"
      ? stage.preview
      : stage.kind === "adjusted"
        ? stage.adjusted
        : stage.kind === "loaded"
          ? stage.original
          : null;

  function handleLoaded(decoded: DecodedImage, file: File) {
    setOpError(null);
    // A fresh `loaded` stage: every downstream result is discarded (R16).
    setStage({
      kind: "loaded",
      original: decoded.pixels,
      fileName: file.name,
      fileBytes: file.size,
      originalDims: {
        width: decoded.originalWidth,
        height: decoded.originalHeight,
      },
      downscaled: decoded.downscaled,
    });
  }

  async function handleApply(settings: AdjustSettings) {
    if (stage.kind === "empty") {
      return;
    }
    const loaded: LoadedFields = {
      original: stage.original,
      fileName: stage.fileName,
      fileBytes: stage.fileBytes,
      originalDims: stage.originalDims,
      downscaled: stage.downscaled,
    };
    try {
      const result = await request({
        op: "adjust",
        buffer: copyPixels(stage.original),
        width: stage.original.width,
        height: stage.original.height,
        settings,
      });
      setOpError(null);
      // Fresh `adjusted` stage — any quantized result is discarded (R16).
      setStage({
        kind: "adjusted",
        ...loaded,
        adjusted: payloadToPixels(result.pixels),
        histogram: new Uint32Array(result.histogram),
      });
    } catch {
      setOpError("Adjusting the image failed — try again.");
    }
  }

  async function handlePosterize(colors: number, dither: boolean) {
    if (stage.kind === "empty") {
      return;
    }
    // Posterize always consumes the adjusted image; without an Apply the
    // original IS the adjusted image (adjustments are optional).
    const source = stage.kind === "loaded" ? stage.original : stage.adjusted;
    const histogram = stage.kind === "loaded" ? null : stage.histogram;
    const loaded: LoadedFields = {
      original: stage.original,
      fileName: stage.fileName,
      fileBytes: stage.fileBytes,
      originalDims: stage.originalDims,
      downscaled: stage.downscaled,
    };
    try {
      const result = await request({
        op: "quantize",
        buffer: copyPixels(source),
        width: source.width,
        height: source.height,
        colors,
        dither,
      });
      setOpError(null);
      const image = deserializeIndexedImage(result.image);
      const preview = payloadToPixels(result.preview);
      // Fresh posterize = a new baseline: the history holds just this result,
      // so Undo is disabled until a cleanup action pushes onto it (R20).
      setStage({
        kind: "quantized",
        ...loaded,
        adjusted: source,
        histogram,
        image,
        preview,
        history: [{ image, preview }],
      });
    } catch {
      setOpError("Posterizing the image failed — try again.");
    }
  }

  async function handlePaletteAction(action: PaletteAction) {
    if (stage.kind !== "quantized") {
      return;
    }
    const current = stage;
    try {
      const result = await request({
        op: "palette",
        image: serializeIndexedImage(current.image),
        action,
      });
      setOpError(null);
      const image = deserializeIndexedImage(result.image);
      const preview = payloadToPixels(result.preview);
      // Push the new state so Undo can return to the prior one (R20), keeping
      // the stack bounded by dropping the oldest state beyond the cap.
      const history = [...current.history, { image, preview }];
      setStage({
        ...current,
        image,
        preview,
        history:
          history.length > MAX_PALETTE_HISTORY
            ? history.slice(history.length - MAX_PALETTE_HISTORY)
            : history,
      });
    } catch {
      setOpError("Updating the palette failed — try again.");
    }
  }

  // Undo is a pure client-state pop (R20): revert to the previous palette
  // state without recomputing anything. Restoring the prior `image` reference
  // also resets PalettePanel's in-progress selection (its effect keys on it).
  const canUndo =
    stage.kind === "quantized" && !busy && stage.history.length > 1;

  const handleUndo = useCallback(() => {
    setStage((current) => {
      if (current.kind !== "quantized" || current.history.length <= 1) {
        return current;
      }
      const history = current.history.slice(0, -1);
      const previous = history[history.length - 1];
      return {
        ...current,
        image: previous.image,
        preview: previous.preview,
        history,
      };
    });
  }, []);

  // Ctrl/Cmd+Z reverts the last palette action while the quantized stage is
  // active and idle. We only preventDefault when Undo actually applies, so the
  // shortcut never interferes elsewhere in the tool (R20).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const undoCombo =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        (event.key === "z" || event.key === "Z");
      if (!undoCombo || !canUndo) {
        return;
      }
      event.preventDefault();
      handleUndo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, handleUndo]);

  // "Pick from image" (R21): a click on the Preview canvas resolves to the
  // palette entry that pixel maps to, then TOGGLES it in the multi-selection
  // (R22) — picking a pixel whose entry is already selected deselects it.
  // Pick mode stays on for repeated picking; the toolbar button toggles it
  // off.
  function handlePick(x: number, y: number) {
    if (stage.kind !== "quantized") {
      return;
    }
    toggleSelected(paletteIndexAt(stage.image, x, y));
  }

  return (
    <div className="flex flex-col gap-4">
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          Processing…
        </p>
      ) : null}

      {opError ? (
        <p role="alert" className="text-sm text-destructive">
          {opError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
          <ImageDropzone onLoaded={handleLoaded} info={info} busy={busy} />

          <AdjustPanel
            onApply={(settings) => void handleApply(settings)}
            disabled={!hasImage}
            busy={busy}
          />

          {stage.kind !== "empty" &&
          stage.kind !== "loaded" &&
          stage.histogram ? (
            <HistogramChart bins={stage.histogram} />
          ) : null}

          <PosterizePanel
            onPosterize={(colors, dither) =>
              void handlePosterize(colors, dither)
            }
            disabled={!hasImage}
            busy={busy}
          />

          {stage.kind === "quantized" ? (
            <PalettePanel
              image={stage.image}
              catalogEmpty={catalogColors.length === 0}
              busy={busy}
              canUndo={canUndo}
              onUndo={handleUndo}
              selected={selected}
              onToggleSelected={toggleSelected}
              onClearSelection={() => setSelected([])}
              pickMode={pickMode}
              onTogglePickMode={() => setPickMode((on) => !on)}
              onMergeMany={(from, into) =>
                void handlePaletteAction({ kind: "mergeMany", from, into })
              }
              onMergeAverage={(indices) =>
                void handlePaletteAction({ kind: "mergeAverage", indices })
              }
              onMergeSimilar={(threshold) =>
                void handlePaletteAction({ kind: "mergeSimilar", threshold })
              }
              onMergeTiny={(coveragePercent) =>
                void handlePaletteAction({ kind: "mergeTiny", coveragePercent })
              }
              onSnap={() =>
                void handlePaletteAction({
                  kind: "snap",
                  catalog: catalogColors,
                })
              }
            />
          ) : null}
        </div>

        {hasImage && workingImage ? (
          <div className="w-full flex-1 lg:sticky lg:top-4 lg:self-start">
            <BeforeAfterPreview
              original={stage.original}
              working={workingImage}
              fileName={stage.fileName}
              pickMode={stage.kind === "quantized" && pickMode}
              onPick={handlePick}
              highlight={highlight}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
