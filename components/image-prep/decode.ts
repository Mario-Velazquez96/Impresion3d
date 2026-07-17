"use client";

/**
 * DOM-bound decode glue for the image-prep island (R2, R4): File →
 * createImageBitmap → white-filled canvas draw (flattens alpha, downscales
 * oversized images to the working size in the same draw) → PixelBuffer.
 * Kept in its own module so component tests can mock it (jsdom has no real
 * 2D context); the REAL path is exercised by E2E.
 */

import {
  MAX_WORKING_DIMENSION,
  fitWithin,
  type PixelBuffer,
} from "@/lib/image-prep-core";

/** Client-side allow-list checked BEFORE decoding (R2, R3). */
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type DecodedImage = {
  pixels: PixelBuffer;
  originalWidth: number;
  originalHeight: number;
  downscaled: boolean;
};

/** Decode a raster file into an opaque, working-size PixelBuffer. */
export async function decodeImageFile(file: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const target = fitWithin(
      originalWidth,
      originalHeight,
      MAX_WORKING_DIMENSION,
    );
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is unavailable");
    }
    // Flatten any alpha over white — HueForge prints have no alpha, and
    // translucent pixels would poison quantization means (R2, design.md).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const imageData = ctx.getImageData(0, 0, target.width, target.height);
    return {
      pixels: {
        width: target.width,
        height: target.height,
        data: imageData.data,
      },
      originalWidth,
      originalHeight,
      downscaled:
        target.width !== originalWidth || target.height !== originalHeight,
    };
  } finally {
    bitmap.close();
  }
}
