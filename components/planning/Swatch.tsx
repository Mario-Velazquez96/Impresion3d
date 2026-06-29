import type { ColorView } from "@/components/planning/types";

/**
 * A single color swatch rendered from its `hex`, with the color name as label
 * (R11). Shared across the planning islands so swatch rendering lives in one place.
 */
export function Swatch({
  color,
  showName = true,
}: {
  color: ColorView;
  showName?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      title={color.name}
    >
      <span
        aria-hidden="true"
        className="inline-block size-3 rounded-full border"
        style={{ backgroundColor: color.hex }}
      />
      <span className={showName ? "" : "sr-only"}>{color.name}</span>
    </span>
  );
}

/** A row of swatches; renders nothing-friendly text when empty. */
export function SwatchList({
  colors,
  emptyLabel = "None",
}: {
  colors: ColorView[];
  emptyLabel?: string;
}) {
  if (colors.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {colors.map((color) => (
        <Swatch key={color.id} color={color} />
      ))}
    </span>
  );
}
