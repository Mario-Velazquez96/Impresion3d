"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from "react";

import {
  clampView,
  IDENTITY_VIEW,
  panBy,
  zoomAt,
  type ViewTransform,
} from "@/lib/flatten-core";

/**
 * Shared canvas-view glue (13_crop, extracted VERBATIM from `FlattenCanvas`):
 * the clipping viewport, the `ResizeObserver` content measurement, the
 * non-passive wheel-zoom listener, Space tracking, middle-/Space-drag panning,
 * the Expand toggle, and the `capClass`/`fitClass`/`transformStyle` derivation.
 * The math itself stays in `lib/flatten-core` (`zoomAt`/`panBy`/`clampView`) —
 * imported, never re-derived (12/R23, 13/R17).
 *
 * Consumed by BOTH `FlattenCanvas` (mechanical refactor, zero behavior change:
 * its Phase-C navigation tests pass unmodified) and `CropCanvas`.
 *
 * The view is LOCAL to the canvas that owns it: it needs the live DOM viewport
 * box for focal-point zoom and pan clamping, and it starts at the identity view
 * whenever the consuming component mounts (12/R1, R23; 13/R1).
 */
export function useCanvasView({
  contentRef,
  resetKey,
}: {
  /** The UNTRANSFORMED element to measure — the base canvas. */
  contentRef: RefObject<HTMLCanvasElement | null>;
  /** Changing it re-measures the content box (a new image). */
  resetKey: unknown;
}): {
  viewportRef: RefObject<HTMLDivElement | null>;
  view: ViewTransform;
  expanded: boolean;
  toggleExpanded: () => void;
  handlePanStart: (event: MouseEvent<HTMLDivElement>) => void;
  spaceHeldRef: RefObject<boolean>;
  capClass: string;
  fitClass: string;
  transformStyle: CSSProperties;
} {
  const viewportRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState(IDENTITY_VIEW);
  const [expanded, setExpanded] = useState(false);

  // Drag-pan bookkeeping: the last pointer position while a pan is active, and
  // whether Space is held (Space + left drag pans instead of selecting). Refs,
  // not state, so the fast-moving pointer path never re-renders.
  const panFromRef = useRef<{ x: number; y: number } | null>(null);
  const spaceHeldRef = useRef(false);

  // The content's UNTRANSFORMED layout size, which is what the pan bounds must
  // be derived from — the viewport is not a stand-in for it, since the canvas
  // is fitted (`object-contain`) and can be smaller than the box in one axis.
  // Deliberately a ref: no render reads it, only the view math does.
  const contentSizeRef = useRef({ w: 0, h: 0 });

  /**
   * The content size the view math should use. Before the first measurement
   * lands (pre-layout, or environments without layout at all) it falls back to
   * the viewport box — i.e. the old "content exactly fills the box" assumption,
   * which locks the pan rather than letting it run unbounded.
   */
  const contentBox = useCallback((fallbackW: number, fallbackH: number) => {
    const { w, h } = contentSizeRef.current;
    return { w: w || fallbackW, h: h || fallbackH };
  }, []);

  // Measure the content box and keep it fresh (R23). `offsetWidth/Height` are
  // LAYOUT pixels — unlike `getBoundingClientRect`, they are not multiplied by
  // the CSS zoom transform, so they stay a stable basis for the pan bounds.
  // A ResizeObserver covers container resizes; the effect deps cover a new
  // image and the Expand toggle. ResizeObserver is a browser API absent in
  // jsdom, hence the guard.
  useEffect(() => {
    const canvas = contentRef.current;
    if (!canvas) {
      return;
    }
    function measure() {
      const el = contentRef.current;
      const box = viewportRef.current;
      if (!el || !box) {
        return;
      }
      contentSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };
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
  }, [contentRef, resetKey, expanded]);

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
  }, [contentBox]);

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
  }, [contentBox]);

  // A middle-button press, or a left press while Space is held, begins a pan
  // rather than a hover/select/crop interaction (R23, 13/R17).
  const handlePanStart = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button === 1 || (event.button === 0 && spaceHeldRef.current)) {
      event.preventDefault();
      panFromRef.current = { x: event.clientX, y: event.clientY };
    }
  }, []);

  const toggleExpanded = useCallback(() => setExpanded((on) => !on), []);

  // The viewport's height cap, applied to the canvases too so the WHOLE image
  // is fitted inside the box at zoom 1 (R23): width-driven sizing alone lets a
  // tall image overflow the clipped viewport, hiding its bottom. Expand only
  // raises the cap. Literal class names keep them visible to the Tailwind JIT.
  const capClass = expanded ? "max-h-[85vh]" : "max-h-[60vh]";
  const fitClass = `h-auto w-full max-w-full object-contain ${capClass}`;
  const transformStyle: CSSProperties = {
    transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
  };

  return {
    viewportRef,
    view,
    expanded,
    toggleExpanded,
    handlePanStart,
    spaceHeldRef,
    capClass,
    fitClass,
    transformStyle,
  };
}
