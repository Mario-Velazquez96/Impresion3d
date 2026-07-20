"use client";

/**
 * Left-column entry card for the flatten stage (12_flatten: R1, R3).
 * Inactive: a **Start flatten** button, enabled whenever an image is loaded
 * and no worker operation is running. Active: a status notice plus **Exit
 * flatten**, whose copy warns that exiting discards every flatten edit (the
 * island restores the exact pre-flatten stage).
 */
export function FlattenStartCard({
  active,
  canStart,
  busy,
  onStart,
  onExit,
}: {
  /** Whether the flatten stage is currently active. */
  active: boolean;
  /** An image is loaded (any of loaded/adjusted/quantized) (R1). */
  canStart: boolean;
  busy: boolean;
  onStart: () => void;
  onExit: () => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Flatten</h2>
      {active ? (
        <>
          <p className="text-xs text-muted-foreground">
            Flatten is active — hover the workspace canvas to preview a
            region, click to select, then collapse the selection to one color.
          </p>
          <p className="text-xs text-muted-foreground">
            Exiting discards all flatten edits and restores the previous
            stage exactly as you left it.
          </p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={onExit}
              className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              Exit flatten
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Manual cleanup for the working image: select regions and collapse
            each to a single color — best after posterizing.
          </p>
          <div>
            <button
              type="button"
              disabled={!canStart || busy}
              onClick={onStart}
              className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              Start flatten
            </button>
          </div>
        </>
      )}
    </section>
  );
}
