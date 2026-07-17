/**
 * Client-safe view types for the image-prep island (11_image_prep). Declared
 * HERE rather than imported from server code so the client bundle never pulls
 * a `server-only` guard — the same pattern as `components/calculator/types.ts`.
 * Re-declaring `ColorView` (structurally identical to the calculator's) keeps
 * the two islands independent instead of coupling them through a shared
 * import.
 */

/** A `Color` catalog row as the page passes it down (R13). */
export type ColorView = { id: string; name: string; hex: string };

/** What the dropzone shows about the currently loaded image (R2, R4). */
export type LoadedImageInfo = {
  /** Working dimensions (after any downscale). */
  width: number;
  height: number;
  fileBytes: number;
  downscaled: boolean;
  originalWidth: number;
  originalHeight: number;
};
