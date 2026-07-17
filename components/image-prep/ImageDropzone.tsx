"use client";

import { useRef, useState, type DragEvent } from "react";

import {
  ACCEPTED_IMAGE_TYPES,
  decodeImageFile,
  type DecodedImage,
} from "@/components/image-prep/decode";
import type { LoadedImageInfo } from "@/components/image-prep/types";
import { MAX_FILE_BYTES, formatByteSize } from "@/lib/image-prep-core";

/**
 * File picker + drag/drop intake for the image-prep pipeline (R2, R3, R4).
 * Type and size guards run BEFORE decoding; every failure (wrong type,
 * oversize, undecodable) surfaces as a user-safe message in the `role="alert"`
 * region and reports NOTHING upward — the island's pipeline state stays
 * untouched. Only a successful decode calls `onLoaded`.
 */
export function ImageDropzone({
  onLoaded,
  info,
  busy,
}: {
  onLoaded: (decoded: DecodedImage, file: File) => void;
  info: LoadedImageInfo | null;
  busy: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const accepted: readonly string[] = ACCEPTED_IMAGE_TYPES;
    if (!accepted.includes(file.type)) {
      setError("That file type is not supported — use a PNG, JPEG, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        `That file is too large (${formatByteSize(file.size)}) — the limit is ${formatByteSize(MAX_FILE_BYTES)}.`,
      );
      return;
    }
    try {
      const decoded = await decodeImageFile(file);
      setError(null);
      onLoaded(decoded, file);
    } catch {
      setError("That image could not be decoded — try a different file.");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Image</h2>

      <div
        data-testid="image-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="flex flex-col items-start gap-2 rounded-md border border-dashed p-4"
      >
        <label htmlFor="image-file" className="text-xs font-medium">
          Source image (PNG, JPEG, or WebP)
        </label>
        <input
          ref={inputRef}
          id="image-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
            // Allow re-selecting the same file to reload it.
            event.target.value = "";
          }}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Drop a file here or pick one — it never leaves your browser.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {info ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            {info.width} × {info.height} px · {formatByteSize(info.fileBytes)}
          </p>
          {info.downscaled ? (
            <p className="text-xs text-muted-foreground">
              Downscaled from {info.originalWidth} × {info.originalHeight} px to
              the {info.width} × {info.height} px working size.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
