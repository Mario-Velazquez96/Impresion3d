"use client";

import { useEffect, useRef } from "react";

import { downloadFileName, type PixelBuffer } from "@/lib/image-prep-core";

/** Paint a PixelBuffer onto a canvas; no-ops where jsdom has no 2D context. */
function paint(canvas: HTMLCanvasElement | null, pixels: PixelBuffer) {
  if (!canvas) {
    return;
  }
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const imageData = ctx.createImageData(pixels.width, pixels.height);
  imageData.data.set(pixels.data);
  ctx.putImageData(imageData, 0, 0);
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
}: {
  original: PixelBuffer;
  working: PixelBuffer;
  fileName: string;
}) {
  const originalRef = useRef<HTMLCanvasElement>(null);
  const workingRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    paint(originalRef.current, original);
  }, [original]);

  useEffect(() => {
    paint(workingRef.current, working);
  }, [working]);

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
        <figure className="flex min-w-0 flex-1 flex-col gap-1">
          <figcaption className="text-xs font-medium">Original</figcaption>
          <canvas
            ref={originalRef}
            aria-label="Original image"
            className="w-full rounded-md border"
          />
        </figure>
        <figure className="flex min-w-0 flex-1 flex-col gap-1">
          <figcaption className="text-xs font-medium">Preview</figcaption>
          <canvas
            ref={workingRef}
            aria-label="Working image preview"
            className="w-full rounded-md border"
          />
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
