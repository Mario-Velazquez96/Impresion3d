/**
 * Renders a print's colors as hex swatches with accessible labels (Server
 * Component, R11). Shared by the grid card and the detail view so the swatch
 * rendering lives in one place. Each swatch is a small circle filled from the
 * color's `hex`, with the color name as its title/aria-label.
 */

export type SwatchColor = { id: string; name: string; hex: string };

export function ColorSwatches({
  colors,
  showNames = false,
}: {
  colors: SwatchColor[];
  showNames?: boolean;
}) {
  if (colors.length === 0) {
    return <span className="text-xs text-muted-foreground">No colors</span>;
  }

  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {colors.map((color) => (
        <li
          key={color.id}
          className="flex items-center gap-1 text-xs"
          title={color.name}
        >
          <span
            aria-hidden="true"
            className="inline-block size-4 rounded-full border"
            style={{ backgroundColor: color.hex }}
          />
          <span className={showNames ? "" : "sr-only"}>{color.name}</span>
        </li>
      ))}
    </ul>
  );
}
