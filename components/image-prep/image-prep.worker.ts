/**
 * Web Worker entry for 11_image_prep (R18) — a thin, STATELESS dispatcher:
 * deserialize the request → call the pure core → transfer the result back.
 * No logic lives here beyond the wiring, which is why this file is
 * coverage-excluded (browser-only worker shell; exercised by E2E — see
 * design.md). Errors never cross the boundary as throws: they come back as
 * `{ ok: false, error }`.
 *
 * 12_flatten extends the dispatch with the `mask` and `flatten` ops backed by
 * `lib/flatten-core.ts` (R4–R6, R9, R16–R19, R26). Phase A shipped flood masks
 * and `fill`; Phase B added smooth masks, catch-strays, and `recolor`; Phase C
 * adds the `removeSmall` action (Despeckle + the Low/Medium/High presets).
 */

import {
  applyAdjustments,
  indexedToPixels,
  luminanceHistogram,
  mergeEntriesToAverage,
  mergeManyEntries,
  mergeSimilar,
  mergeTiny,
  quantize,
  snapToCatalog,
  type IndexedImage,
  type PixelBuffer,
} from "@/lib/image-prep-core";
import {
  addStrayIslands,
  applyFillToMask,
  colorAtPixel,
  floodMask,
  maskPixelCount,
  recolorExact,
  removeSmallRegions,
  smoothMask,
  type Mask,
} from "@/lib/flatten-core";
import {
  deserializeIndexedImage,
  serializeIndexedImage,
  type PaletteAction,
  type PixelPayload,
  type WorkerRequest,
  type WorkerResponse,
} from "./worker-messages";

// The DOM lib types `self` as Window; narrow to the worker-scope surface we
// use so postMessage takes a transfer list (no `any`, no webworker lib).
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer: Transferable[]) => void;
};

function toPayload(pixels: PixelBuffer): PixelPayload {
  return {
    width: pixels.width,
    height: pixels.height,
    buffer: pixels.data.buffer as ArrayBuffer,
  };
}

function applyPaletteAction(
  image: IndexedImage,
  action: PaletteAction,
): IndexedImage {
  switch (action.kind) {
    case "mergeMany":
      return mergeManyEntries(image, action.from, action.into);
    case "mergeAverage":
      return mergeEntriesToAverage(image, action.indices);
    case "mergeSimilar":
      return mergeSimilar(image, action.threshold);
    case "mergeTiny":
      return mergeTiny(image, action.coveragePercent);
    case "snap":
      return snapToCatalog(image, action.catalog);
  }
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    switch (req.op) {
      case "adjust": {
        const src: PixelBuffer = {
          width: req.width,
          height: req.height,
          data: new Uint8ClampedArray(req.buffer),
        };
        const adjusted = applyAdjustments(src, req.settings);
        const histogram = luminanceHistogram(adjusted);
        const pixels = toPayload(adjusted);
        scope.postMessage(
          {
            id: req.id,
            ok: true,
            op: "adjust",
            result: { pixels, histogram: histogram.buffer as ArrayBuffer },
          },
          [pixels.buffer, histogram.buffer as ArrayBuffer],
        );
        break;
      }
      case "quantize": {
        const src: PixelBuffer = {
          width: req.width,
          height: req.height,
          data: new Uint8ClampedArray(req.buffer),
        };
        const image = quantize(src, req.colors, req.dither);
        const serialized = serializeIndexedImage(image);
        const preview = toPayload(indexedToPixels(image));
        scope.postMessage(
          {
            id: req.id,
            ok: true,
            op: "quantize",
            result: { image: serialized, preview },
          },
          [serialized.indices, preview.buffer],
        );
        break;
      }
      case "palette": {
        const image = applyPaletteAction(
          deserializeIndexedImage(req.image),
          req.action,
        );
        const serialized = serializeIndexedImage(image);
        const preview = toPayload(indexedToPixels(image));
        scope.postMessage(
          {
            id: req.id,
            ok: true,
            op: "palette",
            result: { image: serialized, preview },
          },
          [serialized.indices, preview.buffer],
        );
        break;
      }
      case "mask": {
        const src: PixelBuffer = {
          width: req.width,
          height: req.height,
          data: new Uint8ClampedArray(req.buffer),
        };
        const base =
          req.mode === "smooth"
            ? smoothMask(src, req.seedX, req.seedY, req.tolerance)
            : floodMask(src, req.seedX, req.seedY, req.tolerance);
        const mask = req.catchStrays
          ? addStrayIslands(
              src,
              base,
              colorAtPixel(src, req.seedX, req.seedY),
              req.tolerance,
            )
          : base;
        const buffer = mask.data.buffer as ArrayBuffer;
        scope.postMessage(
          {
            id: req.id,
            ok: true,
            op: "mask",
            result: { mask: buffer, count: maskPixelCount(mask) },
          },
          [buffer],
        );
        break;
      }
      case "flatten": {
        const src: PixelBuffer = {
          width: req.width,
          height: req.height,
          data: new Uint8ClampedArray(req.buffer),
        };
        let result: PixelBuffer;
        if (req.action.kind === "removeSmall") {
          result = removeSmallRegions(src, req.action.maxRegionPx);
        } else if (req.action.kind === "recolor") {
          result = recolorExact(src, req.action.from, req.action.to);
        } else {
          const mask: Mask = {
            width: req.width,
            height: req.height,
            data: new Uint8Array(req.action.mask),
          };
          result = applyFillToMask(src, mask, req.action.fill);
        }
        const pixels = toPayload(result);
        scope.postMessage(
          { id: req.id, ok: true, op: "flatten", result: { pixels } },
          [pixels.buffer],
        );
        break;
      }
    }
  } catch (error) {
    scope.postMessage(
      {
        id: req.id,
        ok: false,
        error:
          error instanceof Error ? error.message : "Image operation failed",
      },
      [],
    );
  }
};
