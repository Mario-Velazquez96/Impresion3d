"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { mapClickToPixel } from "@/components/image-prep/BeforeAfterPreview";
import { paint } from "@/components/image-prep/canvas-paint";
import { clampView, IDENTITY_VIEW, panBy, zoomAt } from "@/lib/flatten-core";
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
 * panning is middle-button drag or Space-held left drag.
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
  const viewportRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState(IDENTITY_VIEW);
  const [expanded, setExpanded] = useState(false);

  // Drag-pan bookkeeping: the last pointer position while a pan is active, and
  // whether Space is held (Space + left drag pans instead of selecting). Refs,
  // not state, so the fast-moving pointer path never re-renders.
  const panFromRef = useRef<{ x: number; y: number } | null>(null);
  const spaceHeldRef = useRef(false);

  // The base canvas's UNTRANSFORMED layout size, which is what the pan bounds
  // must be derived from — the viewport is not a stand-in for it, since the
  // canvas is fitted (`object-contain`) and can be smaller than the box in one
  // axis. Deliberately a ref: no render reads it, only the view math does.
  const contentRef = useRef({ w: 0, h: 0 });

  /**
   * The content size the view math should use. Before the first measurement
   * lands (pre-layout, or environments without layout at all) it falls back to
   * the viewport box — i.e. the old "content exactly fills the box" assumption,
   * which locks the pan rather than letting it run unbounded.
   */
  function contentBox(fallbackW: number, fallbackH: number) {
    const { w, h } = contentRef.current;
    return { w: w || fallbackW, h: h || fallbackH };
  }

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

  // Measure the content box and keep it fresh (R23). `offsetWidth/Height` are
  // LAYOUT pixels — unlike `getBoundingClientRect`, they are not multiplied by
  // the CSS zoom transform, so they stay a stable basis for the pan bounds.
  // A ResizeObserver covers container resizes; the effect deps cover a new
  // image and the Expand toggle. ResizeObserver is a browser API absent in
  // jsdom, hence the guard.
  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas) {
      return;
    }
    function measure() {
      const el = baseRef.current;
      const box = viewportRef.current;
      if (!el || !box) {
        return;
      }
      contentRef.current = { w: el.offsetWidth, h: el.offsetHeight };
      // A resize can leave the current pan out of bounds (e.g. Expand grows
      // the box); re-clamp, but only replace the view when it actually moves.
      setView((v) => {
        const next = clampView(
          v,
          box.offsetWidth,
          box.offsetHeight,
          el.offsetWidth,
          el.offsetHeight,
        );
        return next.zoom === v.zoom &&
          next.panX === v.panX &&
          next.panY === v.panY
          ? v
          : next;
      });
    }
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    if (viewportRef.current) {
      observer.observe(viewportRef.current);
    }
    return () => observer.disconnect();
  }, [current, expanded]);

  // Scroll zoom (R23): non-passive so `preventDefault` stops the page from
  // scrolling; zoom toward the cursor within [MIN_ZOOM, MAX_ZOOM].
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = el!.getBoundingClientRect();
      const direction = event.deltaY < 0 ? 1 : -1;
      const content = contentBox(rect.width, rect.height);
      setView((v) =>
        zoomAt(
          v,
          direction,
          event.clientX - rect.left,
          event.clientY - rect.top,
          rect.width,
          rect.height,
          content.w,
          content.h,
        ),
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Space tracking for Space + left-drag panning (R23); guarded against text
  // inputs and stopping the page from scrolling while held.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }
      spaceHeldRef.current = true;
      event.preventDefault();
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        spaceHeldRef.current = false;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Drag-pan move/end live on the window so the drag survives the pointer
  // leaving the viewport (R23).
  useEffect(() => {
    function onMove(event: globalThis.MouseEvent) {
      const from = panFromRef.current;
      if (!from) {
        return;
      }
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      panFromRef.current = { x: event.clientX, y: event.clientY };
      const content = contentBox(rect.width, rect.height);
      setView((v) =>
        panBy(v, dx, dy, rect.width, rect.height, content.w, content.h),
      );
    }
    function onUp() {
      panFromRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // A middle-button press, or a left press while Space is held, begins a pan
  // rather than a hover/select interaction (R23).
  function handlePanStart(event: MouseEvent<HTMLDivElement>) {
    if (event.button === 1 || (event.button === 0 && spaceHeldRef.current)) {
      event.preventDefault();
      panFromRef.current = { x: event.clientX, y: event.clientY };
    }
  }

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

  // The viewport's height cap, applied to the canvases too so the WHOLE image
  // is fitted inside the box at zoom 1 (R23): width-driven sizing alone lets a
  // tall image overflow the clipped viewport, hiding its bottom. Expand only
  // raises the cap. Literal class names keep them visible to the Tailwind JIT.
  const capClass = expanded ? "max-h-[85vh]" : "max-h-[60vh]";
  const fitClass = `h-auto w-full max-w-full object-contain ${capClass}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          aria-pressed={expanded}
          onClick={() => setExpanded((on) => !on)}
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
          style={{
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
          }}
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
