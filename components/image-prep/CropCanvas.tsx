"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import { mapClickToPixel } from "@/components/image-prep/BeforeAfterPreview";
import { paint } from "@/components/image-prep/canvas-paint";
import { useCanvasView } from "@/components/image-prep/use-canvas-view";
import {
  HANDLE_HIT_SCREEN_PX,
  boxPointToImage,
  contentBoxOf,
  handleCursor,
  hitTestHandle,
  imageRectToBoxFractions,
  moveRect,
  resizeRect,
  type CropRect,
  type Handle,
} from "@/lib/crop-core";
import type { PixelBuffer } from "@/lib/image-prep-core";

/**
 * The interactive crop canvas (13_crop: R6, R7, R8, R17, R18, R20): the working
 * image painted with the shared jsdom-guarded `paint`, a DOM crop overlay, the
 * shared `useCanvasView` viewport (scroll zoom, middle-/Space-drag pan, Expand),
 * and the keyboard/mouse hints strip.
 *
 * Pointer geometry is reused, never re-derived: the PRESS goes through the
 * 11/R21 `mapClickToPixel` against the canvas's own `getBoundingClientRect()`
 * (already multiplied by the CSS zoom/pan transform), so a press in the
 * `object-contain` letterbox returns `null` and starts no drag; a CONTINUING
 * drag goes through the pure `boxPointToImage`, the documented clamped sibling,
 * so the drag survives the pointer leaving the image (R18).
 *
 * WHY THE OVERLAY IS DOM, NOT A REPAINTED BUFFER: the rectangle changes on
 * every mousemove of a drag; rebuilding an image-sized RGBA buffer per frame
 * would drop frames and blur under zoom. Two style updates per frame instead,
 * positioned from the pure `imageRectToBoxFractions`. The handles are
 * `pointer-events-none` decorations — hit-testing happens in IMAGE space via
 * the pure `hitTestHandle`, which keeps the interaction logic unit-testable.
 *
 * NO Download button here: the crop stage is a decision, not an export, and
 * Download lives one Cancel/Apply away on the normal preview.
 */

/** The in-progress drag; a ref, so pointer moves never re-render through it. */
type ActiveDrag = {
  target: Handle | "inside";
  /** Pointer offset inside the rect at grab time — only used by "inside". */
  grabDx: number;
  grabDy: number;
};

/** The 8 decorative handle squares, centred on their corner/edge midpoint. */
const HANDLE_POSITIONS: { handle: Handle; position: string }[] = [
  { handle: "nw", position: "left-0 top-0" },
  { handle: "n", position: "left-1/2 top-0" },
  { handle: "ne", position: "left-full top-0" },
  { handle: "e", position: "left-full top-1/2" },
  { handle: "se", position: "left-full top-full" },
  { handle: "s", position: "left-1/2 top-full" },
  { handle: "sw", position: "left-0 top-full" },
  { handle: "w", position: "left-0 top-1/2" },
];

export function CropCanvas({
  working,
  rect,
  ratio,
  onRectChange,
}: {
  /** The framing reference image — the newest completed stage (R1). */
  working: PixelBuffer;
  /** The current crop rectangle, in image pixels. */
  rect: CropRect;
  /** The target aspect ratio the rectangle is locked to. */
  ratio: number;
  /** Report a dragged/resized rectangle up to the workspace. */
  onRectChange: (rect: CropRect) => void;
}) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const [cursor, setCursor] = useState("default");
  // The canvas element's LAYOUT box, used only to place the overlay's
  // content-box wrapper. Zero before layout (and always in jsdom), where the
  // wrapper falls back to the full canvas box.
  const [layout, setLayout] = useState({ w: 0, h: 0 });

  const {
    viewportRef,
    expanded,
    toggleExpanded,
    handlePanStart,
    spaceHeldRef,
    capClass,
    fitClass,
    transformStyle,
  } = useCanvasView({ contentRef: baseRef, resetKey: working });

  useEffect(() => {
    paint(baseRef.current, working);
  }, [working]);

  // Measure the canvas box for the overlay (the same `offsetWidth/Height`
  // layout-pixel basis the view hook uses; ResizeObserver is absent in jsdom).
  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas) {
      return;
    }
    function measure() {
      const el = baseRef.current;
      if (!el) {
        return;
      }
      setLayout((current) =>
        current.w === el.offsetWidth && current.h === el.offsetHeight
          ? current
          : { w: el.offsetWidth, h: el.offsetHeight },
      );
    }
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [working, expanded]);

  /**
   * The canvas's live screen box — already transformed by the CSS zoom/pan, so
   * the same `object-contain` math works at any view (R18).
   */
  const screenBoxOf = useCallback((canvas: HTMLCanvasElement) => {
    const box = canvas.getBoundingClientRect();
    return { rectW: box.width, rectH: box.height, left: box.left, top: box.top };
  }, []);

  /** Grab slop stays constant on SCREEN at any zoom (R8). */
  const toleranceFor = useCallback(
    (rectW: number, rectH: number) => {
      const content = contentBoxOf({
        rectW,
        rectH,
        imgW: working.width,
        imgH: working.height,
      });
      return content === null
        ? HANDLE_HIT_SCREEN_PX
        : HANDLE_HIT_SCREEN_PX / content.scale;
    },
    [working],
  );

  // Press: resolve the pixel with the R21 geometry (letterbox → null → no
  // drag), hit-test it in image space, and begin the matching drag. Middle
  // button and Space-held presses belong to the view hook's pan and never crop.
  function handleMouseDown(event: MouseEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || spaceHeldRef.current) {
      return;
    }
    const box = screenBoxOf(event.currentTarget);
    const point = mapClickToPixel({
      rectW: box.rectW,
      rectH: box.rectH,
      imgW: working.width,
      imgH: working.height,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
    });
    if (point === null) {
      return; // the object-contain letterbox margin (R18)
    }
    const target = hitTestHandle(
      rect,
      point.x,
      point.y,
      toleranceFor(box.rectW, box.rectH),
    );
    if (target === null) {
      return; // outside the rectangle — nothing to drag
    }
    event.preventDefault();
    dragRef.current = {
      target,
      grabDx: point.x - rect.x,
      grabDy: point.y - rect.y,
    };
  }

  // Hover: the cursor advertises what the press would do (R8).
  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    if (dragRef.current !== null) {
      return; // the drag owns the cursor until it ends
    }
    const box = screenBoxOf(event.currentTarget);
    const point = mapClickToPixel({
      rectW: box.rectW,
      rectH: box.rectH,
      imgW: working.width,
      imgH: working.height,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
    });
    setCursor(
      handleCursor(
        point === null
          ? null
          : hitTestHandle(
              rect,
              point.x,
              point.y,
              toleranceFor(box.rectW, box.rectH),
            ),
      ),
    );
  }

  // Move/end live on the window so a drag survives the pointer leaving the
  // canvas — coordinates are CLAMPED into the image rather than lost (R7, R18).
  useEffect(() => {
    function onMove(event: globalThis.MouseEvent) {
      const drag = dragRef.current;
      if (drag === null) {
        return;
      }
      const canvas = baseRef.current;
      if (canvas === null) {
        return;
      }
      const box = canvas.getBoundingClientRect();
      const point = boxPointToImage({
        rectW: box.width,
        rectH: box.height,
        imgW: working.width,
        imgH: working.height,
        offsetX: event.clientX - box.left,
        offsetY: event.clientY - box.top,
      });
      if (point === null) {
        return; // degenerate box (no layout) — nothing sensible to do
      }
      if (drag.target === "inside") {
        onRectChange(
          moveRect(
            rect,
            point.x - drag.grabDx - rect.x,
            point.y - drag.grabDy - rect.y,
            working.width,
            working.height,
          ),
        );
        return;
      }
      onRectChange(
        resizeRect({
          rect,
          handle: drag.target,
          pointerX: point.x,
          pointerY: point.y,
          ratio,
          imgW: working.width,
          imgH: working.height,
        }),
      );
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [rect, ratio, working, onRectChange]);

  // The drawn content box inside the canvas element's box, as percentages, so
  // the dim never spills into the letterbox. Before layout lands the wrapper
  // covers the whole canvas box (the no-letterbox assumption).
  const content = contentBoxOf({
    rectW: layout.w,
    rectH: layout.h,
    imgW: working.width,
    imgH: working.height,
  });
  const contentStyle =
    content === null
      ? { left: "0%", top: "0%", width: "100%", height: "100%" }
      : {
          left: `${(content.offsetX / layout.w) * 100}%`,
          top: `${(content.offsetY / layout.h) * 100}%`,
          width: `${(content.drawnW / layout.w) * 100}%`,
          height: `${(content.drawnH / layout.h) * 100}%`,
        };

  const fractions = imageRectToBoxFractions(rect, working.width, working.height);

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

      {/* Viewport clips the zoomed/panned content; the wrapper carries the CSS
          transform so the canvas box reflects the current view (R17, R18). */}
      <div
        ref={viewportRef}
        data-testid="crop-viewport"
        onMouseDown={handlePanStart}
        className={`relative overflow-hidden rounded-md border ${capClass}`}
      >
        <div
          data-testid="crop-transform"
          className="relative origin-top-left"
          style={transformStyle}
        >
          <canvas
            ref={baseRef}
            aria-label="Crop canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setCursor("default")}
            className={`block ${fitClass}`}
            style={{ cursor }}
          />

          {/* Content-box wrapper: clips the dim to the drawn image. */}
          <div
            aria-hidden="true"
            data-testid="crop-content-box"
            className="pointer-events-none absolute overflow-hidden"
            style={contentStyle}
          >
            <div
              data-testid="crop-rect"
              className="absolute ring-2 ring-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{
                left: `${fractions.left * 100}%`,
                top: `${fractions.top * 100}%`,
                width: `${fractions.width * 100}%`,
                height: `${fractions.height * 100}%`,
              }}
            >
              {HANDLE_POSITIONS.map(({ handle, position }) => (
                <span
                  key={handle}
                  data-testid={`crop-handle-${handle}`}
                  className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-black bg-white ${position}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard/mouse hints strip (R20). */}
      <p className="text-xs text-muted-foreground">
        Drag to move · Handles to resize · Arrows nudge (Shift ×10) · Scroll
        zoom · Space-drag pan · Esc cancel
      </p>
    </div>
  );
}
