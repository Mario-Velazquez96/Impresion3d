"use client";

import { useEffect, useRef, type MouseEvent } from "react";

import { mapClickToPixel } from "@/components/image-prep/BeforeAfterPreview";
import { paint } from "@/components/image-prep/canvas-paint";
import { downloadFileName, type PixelBuffer } from "@/lib/image-prep-core";

/**
 * The interactive flatten canvas (12_flatten: R4, R24, R25, R27): the flatten
 * working image with an overlay canvas for the hover/selection outlines, the
 * keyboard-hints strip, and Download PNG. Pointer positions resolve to image
 * pixels by reusing the R21 geometry (`mapClickToPixel`) against the canvas
 * box — letterbox positions resolve to `null` and are reported as such, so
 * the workspace clears the hover mask over the margins (R24).
 *
 * Phase A renders at the identity view; scroll zoom, panning, and the Expand
 * toggle arrive in Phase C (R23).
 */
export function FlattenCanvas({
  current,
  overlay,
  pickMode,
  fileName,
  onHoverPixel,
  onClickPixel,
}: {
  /** The flatten working image. */
  current: PixelBuffer;
  /** RGBA overlay buffer (hover/selection outlines) or null for none (R4). */
  overlay: Uint8ClampedArray | null;
  /** Eyedropper pick mode — crosshair cursor (R15). */
  pickMode: boolean;
  /** Original upload name — Download suggests `<base>-prepped.png` (R27). */
  fileName: string;
  /** The image pixel under the pointer, or null over the letterbox (R4). */
  onHoverPixel: (pixel: { x: number; y: number } | null) => void;
  /** A click resolved to an image pixel (letterbox clicks are dropped). */
  onClickPixel: (x: number, y: number) => void;
}) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    paint(baseRef.current, current);
  }, [current]);

  useEffect(() => {
    if (overlay) {
      paint(overlayRef.current, {
        width: current.width,
        height: current.height,
        data: overlay,
      });
    }
  }, [overlay, current]);

  // DOM glue stays thin: read the box, defer the math to the pure
  // `mapClickToPixel` (unit-tested in the R21 suite), report the pixel.
  function resolvePixel(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return mapClickToPixel({
      rectW: rect.width,
      rectH: rect.height,
      imgW: current.width,
      imgH: current.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    onHoverPixel(resolvePixel(event));
  }

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const mapped = resolvePixel(event);
    if (mapped) {
      onClickPixel(mapped.x, mapped.y);
    }
  }

  // Same offscreen-canvas → toBlob → <a download> flow as BeforeAfterPreview:
  // entirely client-side, no upload, no network request (R27).
  function handleDownload() {
    const canvas = document.createElement("canvas");
    canvas.width = current.width;
    canvas.height = current.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const imageData = ctx.createImageData(current.width, current.height);
    imageData.data.set(current.data);
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
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={baseRef}
          aria-label="Flatten canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => onHoverPixel(null)}
          onClick={handleClick}
          className={`mx-auto h-auto max-h-[60vh] w-full max-w-full rounded-md border object-contain ${
            pickMode ? "cursor-crosshair" : ""
          }`}
        />
        {overlay ? (
          <canvas
            ref={overlayRef}
            aria-hidden="true"
            data-testid="flatten-overlay"
            className="pointer-events-none absolute inset-0 h-full w-full rounded-md border border-transparent object-contain"
          />
        ) : null}
      </div>

      {/* Keyboard-hints strip (R25). */}
      <p className="text-xs text-muted-foreground">
        Click add region · Click selected = remove · W/S resize · Enter
        flatten · Esc clear · Scroll zoom · Z undo
      </p>

      <div>
        <button
          type="button"
          onClick={handleDownload}
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}
