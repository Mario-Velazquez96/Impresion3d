"use client";

import { useEffect, useRef, type MouseEvent } from "react";

import { mapClickToPixel } from "@/components/image-prep/BeforeAfterPreview";
import { paint } from "@/components/image-prep/canvas-paint";
import { useCanvasView } from "@/components/image-prep/use-canvas-view";
import { downloadFileName, type PixelBuffer } from "@/lib/image-prep-core";

/**
 * The interactive flatten canvas (12_flatten: R4, R23, R24, R25, R27): the
 * flatten working image with an overlay canvas for the hover/selection
 * outlines, scroll zoom + drag pan + an Expand toggle, the keyboard-hints
 * strip, and Download PNG. Pointer positions resolve to image pixels by reusing
 * the R21 geometry (`mapClickToPixel`) against the canvas's own
 * `getBoundingClientRect()` — which already reflects the CSS zoom/pan transform,
 * so the same math works at any view and letterbox positions resolve to `null`
 * (R24).
 *
 * The view (zoom/pan/expand) is local to this canvas: it needs the live DOM
 * viewport box for focal-point zoom and pan clamping, and it resets to the
 * identity view whenever the flatten stage (re)mounts this component (R1, R23).
 * A non-passive `wheel` listener lets us `preventDefault` the page scroll;
 * panning is middle-button drag or Space-held left drag. That whole glue —
 * viewport ref, ResizeObserver content measurement, wheel zoom, Space tracking,
 * drag pan, Expand, and the class/transform derivation — now lives in the
 * shared `useCanvasView` hook (13_crop), extracted from here VERBATIM and also
 * consumed by the crop canvas. Behavior is unchanged.
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

  const {
    viewportRef,
    expanded,
    toggleExpanded,
    handlePanStart,
    spaceHeldRef,
    capClass,
    fitClass,
    transformStyle,
  } = useCanvasView({ contentRef: baseRef, resetKey: current });

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

  // DOM glue stays thin: read the canvas box (already transformed by the CSS
  // zoom/pan), defer the math to the pure `mapClickToPixel`, report the pixel.
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
    // While Space is held the left button pans, so it must not also select.
    if (spaceHeldRef.current) {
      return;
    }
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
      <div className="flex justify-end">
        <button
          type="button"
          aria-pressed={expanded}
          onClick={toggleExpanded}
          className={`h-8 rounded-md border px-2 text-xs hover:bg-accent ${
            expanded ? "bg-accent ring-2 ring-ring" : ""
          }`}
        >
          Expand
        </button>
      </div>

      {/* Viewport clips the zoomed/panned content; the wrapper carries the
          CSS transform so the canvas box reflects the current view (R23, R24). */}
      <div
        ref={viewportRef}
        data-testid="flatten-viewport"
        onMouseDown={handlePanStart}
        className={`relative overflow-hidden rounded-md border ${capClass}`}
      >
        <div
          data-testid="flatten-transform"
          className="origin-top-left"
          style={transformStyle}
        >
          <canvas
            ref={baseRef}
            aria-label="Flatten canvas"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => onHoverPixel(null)}
            onClick={handleClick}
            className={`${fitClass} ${pickMode ? "cursor-crosshair" : ""}`}
          />
          {overlay ? (
            <canvas
              ref={overlayRef}
              aria-hidden="true"
              data-testid="flatten-overlay"
              // Sized by the SAME rules as the base canvas (same intrinsic
              // ratio, same containing block) so the outlines stay registered
              // with the pixels once the height cap can shrink the canvas.
              className={`pointer-events-none absolute left-0 top-0 ${fitClass}`}
            />
          ) : null}
        </div>
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
