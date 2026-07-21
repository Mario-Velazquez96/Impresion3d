"use client";

/**
 * Left-column entry card for the crop stage (13_crop: R1, R13, R15).
 *
 * Inactive: explanatory copy + **Start crop** (disabled with no image or while
 * a worker operation runs). Inactive AND already cropped: also the
 * "Cropped to W × H px — from W₀ × H₀" line and **Revert to uncropped**, which
 * restores the as-uploaded image and then disappears (R15). Active: the notice
 * that applying restarts the pipeline — Apply and Cancel live in the size panel
 * so the decision and its controls sit together.
 */
export function CropStartCard({
  active,
  canStart,
  busy,
  cropped,
  onStart,
  onRevert,
}: {
  /** Whether the crop stage is currently active. */
  active: boolean;
  /** An image is loaded (any non-empty stage) (R1). */
  canStart: boolean;
  busy: boolean;
  /**
   * Present only when the current pipeline source IS a crop of the upload
   * (`original !== uploaded`) — carries both sizes for the notice (R15).
   */
  cropped: {
    width: number;
    height: number;
    uploadedWidth: number;
    uploadedHeight: number;
  } | null;
  onStart: () => void;
  onRevert: () => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Crop to print size</h2>

      {active ? (
        <>
          <p className="text-xs text-muted-foreground">
            Crop is active — set the target print size in millimetres, frame the
            ratio-locked rectangle, then apply.
          </p>
          <p className="text-xs text-muted-foreground">
            Applying restarts the pipeline from the cropped image: adjustments,
            the palette, and any flatten edits are discarded. Cancel leaves
            everything exactly as it is.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Crop the image to an exact physical print size. The millimetre
            values set the aspect ratio only — the crop keeps the maximum
            available pixels and never resamples.
          </p>
          {cropped ? (
            <p className="text-xs text-muted-foreground">
              Cropped to {cropped.width} × {cropped.height} px — from{" "}
              {cropped.uploadedWidth} × {cropped.uploadedHeight}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canStart || busy}
              onClick={onStart}
              className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              Start crop
            </button>
            {cropped ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRevert}
                className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
              >
                Revert to uncropped
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
