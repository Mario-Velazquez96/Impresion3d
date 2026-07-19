/**
 * Typed request/response protocol shared by the Web Worker and the client
 * hook (11_image_prep: R5–R8, R10–R13, R18). Types plus the two tiny
 * (de)serialization helpers for IndexedImage — kept HERE so the worker and
 * the island cannot drift apart on the wire shape. Pixel data crosses the
 * boundary as raw ArrayBuffers so both directions can use the transfer list
 * (zero-copy).
 */

import type {
  AdjustSettings,
  IndexedImage,
  PaletteEntry,
} from "@/lib/image-prep-core";

/** IndexedImage with its indices as a transferable ArrayBuffer. */
export type SerializedIndexedImage = {
  width: number;
  height: number;
  indices: ArrayBuffer;
  entries: PaletteEntry[];
};

/** Raw RGBA pixels + dimensions, transferable. */
export type PixelPayload = {
  width: number;
  height: number;
  buffer: ArrayBuffer;
};

export type PaletteAction =
  | { kind: "mergeMany"; from: number[]; into: number }
  | { kind: "mergeAverage"; indices: number[] }
  | { kind: "mergeSimilar"; threshold: number }
  | { kind: "mergeTiny"; coveragePercent: number }
  | { kind: "snap"; catalog: { id: string; name: string; hex: string }[] };

export type WorkerRequestBody =
  | {
      op: "adjust";
      buffer: ArrayBuffer;
      width: number;
      height: number;
      settings: AdjustSettings;
    }
  | {
      op: "quantize";
      buffer: ArrayBuffer;
      width: number;
      height: number;
      colors: number;
      dither: boolean;
    }
  | { op: "palette"; image: SerializedIndexedImage; action: PaletteAction };

export type WorkerRequest = WorkerRequestBody & { id: number };

/** `adjust` answers with the adjusted pixels AND their histogram (R5 + R6). */
export type AdjustResult = {
  pixels: PixelPayload;
  /** Uint32Array(256) backing buffer. */
  histogram: ArrayBuffer;
};

/** `quantize` and `palette` ops answer with the image and its preview (R15). */
export type PipelineResult = {
  image: SerializedIndexedImage;
  preview: PixelPayload;
};

export type WorkerResponse =
  | { id: number; ok: true; op: "adjust"; result: AdjustResult }
  | { id: number; ok: true; op: "quantize" | "palette"; result: PipelineResult }
  | { id: number; ok: false; error: string };

/** Copying serialize — safe to transfer without detaching the live state. */
export function serializeIndexedImage(
  image: IndexedImage,
): SerializedIndexedImage {
  const indices = image.indices.slice();
  return {
    width: image.width,
    height: image.height,
    indices: indices.buffer as ArrayBuffer,
    entries: image.entries.map((entry) => ({
      color: { ...entry.color },
      count: entry.count,
      catalog: entry.catalog ? { ...entry.catalog } : null,
    })),
  };
}

export function deserializeIndexedImage(
  s: SerializedIndexedImage,
): IndexedImage {
  return {
    width: s.width,
    height: s.height,
    indices: new Uint8Array(s.indices),
    entries: s.entries.map((entry) => ({
      color: { ...entry.color },
      count: entry.count,
      catalog: entry.catalog ? { ...entry.catalog } : null,
    })),
  };
}
