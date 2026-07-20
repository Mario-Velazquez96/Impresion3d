"use client";

import { useEffect, useMemo, useRef, type MouseEvent } from "react";

import {
  buildHighlightMask,
  downloadFileName,
  type IndexedImage,
  type PixelBuffer,
} from "@/lib/image-prep-core";

import { paint } from "./canvas-paint";

/**
 * Map a click inside a CSS-scaled, `object-contain` canvas box to an
 * image-pixel coordinate (R21) — the pure geometry behind "Pick from image".
 * `object-contain` scales the intrinsic image uniformly by
 * `min(rectW/imgW, rectH/imgH)` and centers it, letterboxing the excess axis.
 * A click in that letterbox margin (or on a degenerate zero-size box) returns
 * `null`; otherwise the drawn content offset is divided back through the scale
 * and floored to an integer pixel. Kept DOM-free so it is unit-testable
 * without a real layout (jsdom's getBoundingClientRect returns zeros).
 */
export function mapClickToPixel({
  rectW,
  rectH,
  imgW,
  imgH,
  offsetX,
  offsetY,
}: {
  rectW: number;
  rectH: number;
  imgW: number;
  imgH: number;
  offsetX: number;
  offsetY: number;
}): { x: number; y: number } | null {
  if (rectW <= 0 || rectH <= 0 || imgW <= 0 || imgH <= 0) {
    return null;
  }
  const scale = Math.min(rectW / imgW, rectH / imgH);
  const drawnW = imgW * scale;
  const drawnH = imgH * scale;
  const contentX = offsetX - (rectW - drawnW) / 2;
  const contentY = offsetY - (rectH - drawnH) / 2;
  if (contentX < 0 || contentX >= drawnW || contentY < 0 || contentY >= drawnH) {
    return null; // landed in the letterbox margin
  }
  return {
    x: Math.floor(contentX / scale),
    y: Math.floor(contentY / scale),
  };
}

/**
 * Before/after preview + Download (R15, R17): the original beside the newest
 * completed stage, repainted after every pipeline operation. Download renders
 * the working image to an offscreen canvas → `toBlob("image/png")` → a
 * temporary object-URL anchor named `<base>-prepped.png` — entirely
 * client-side; no upload, no network request, no Storage write.
 */
export function BeforeAfterPreview({
  original,
  working,
  fileName,
  pickMode = false,
  onPick,
  highlight = null,
}: {
  original: PixelBuffer;
  working: PixelBuffer;
  fileName: string;
  /** "Pick from image" is active — the Preview canvas is an eyedropper (R21). */
  pickMode?: boolean;
  /** Report the image-pixel coordinate of a pick on the Preview canvas (R21). */
  onPick?: (x: number, y: number) => void;
  /**
   * Selection highlight (R23): the quantized image + selected entry indices.
   * Null (or a selection with no valid entries) means no highlight. This is a
   * RENDER-LAYER effect only — `working` (and thus Download) is untouched.
   */
  highlight?: { image: IndexedImage; selected: number[] } | null;
}) {
  const originalRef = useRef<HTMLCanvasElement>(null);
  const workingRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // The mask recomputes only when the palette image or the selection changes
  // (the island memoizes `highlight` on exactly those two). One O(pixels)
  // pass on the main thread — cheap relative to a worker round trip (R23).
  const highlightMask = useMemo(
    () =>
      highlight ? buildHighlightMask(highlight.image, highlight.selected) : null,
    [highlight],
  );

  // DOM glue is thin: read the box + intrinsic size, defer the math to the
  // pure `mapClickToPixel`, and report the resulting pixel (letterbox = no-op).
  function handleWorkingClick(event: MouseEvent<HTMLCanvasElement>) {
    if (!pickMode || !onPick) {
      return;
    }
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mapped = mapClickToPixel({
      rectW: rect.width,
      rectH: rect.height,
      imgW: canvas.width,
      imgH: canvas.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
    if (mapped) {
      onPick(mapped.x, mapped.y);
    }
  }

  useEffect(() => {
    paint(originalRef.current, original);
  }, [original]);

  useEffect(() => {
    paint(workingRef.current, working);
  }, [working]);

  // Paint the highlight veil whenever a mask exists; with no mask the overlay
  // canvas is unmounted entirely, restoring the plain preview (R23).
  useEffect(() => {
    if (highlight && highlightMask) {
      paint(overlayRef.current, {
        width: highlight.image.width,
        height: highlight.image.height,
        data: highlightMask,
      });
    }
  }, [highlight, highlightMask]);

  function handleDownload() {
    const canvas = document.createElement("canvas");
    canvas.width = working.width;
    canvas.height = working.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const imageData = ctx.createImageData(working.width, working.height);
    imageData.data.set(working.data);
    ctx.putImageData(imageData, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadFileName(fileName);
      anchor.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Preview</h2>

      <div className="flex flex-wrap gap-4">
        <figure className="flex min-w-[16rem] flex-1 basis-72 flex-col gap-1">
          <figcaption className="text-xs font-medium">Original</figcaption>
          <canvas
            ref={originalRef}
            aria-label="Original image"
            className="mx-auto h-auto max-h-[70vh] w-full max-w-full rounded-md border object-contain"
          />
        </figure>
        <figure className="flex min-w-[16rem] flex-1 basis-72 flex-col gap-1">
          <figcaption className="text-xs font-medium">Preview</figcaption>
          {/* The wrapper's box IS the Preview canvas's box (canvas is block +
              w-full), so an inset-0 overlay with the same intrinsic size, a
              transparent border matching the canvas's 1px border, and the same
              object-contain fit aligns pixel-for-pixel. pointer-events-none
              keeps the R21 eyedropper clicks landing on the canvas below. */}
          <div className="relative">
            <canvas
              ref={workingRef}
              aria-label="Working image preview"
              onClick={handleWorkingClick}
              className={`mx-auto h-auto max-h-[70vh] w-full max-w-full rounded-md border object-contain ${
                pickMode ? "cursor-crosshair" : ""
              }`}
            />
            {highlightMask ? (
              <canvas
                ref={overlayRef}
                aria-hidden="true"
                data-testid="selection-highlight-overlay"
                className="pointer-events-none absolute inset-0 h-full w-full rounded-md border border-transparent object-contain"
              />
            ) : null}
          </div>
        </figure>
      </div>

      <div>
        <button
          type="button"
          onClick={handleDownload}
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent"
        >
          Download PNG
        </button>
      </div>
    </section>
  );
}
