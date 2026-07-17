"use client";

/**
 * 256-bin luminance histogram as an inline SVG bar chart (R6). SVG (not
 * canvas) so jsdom component tests can assert on the rendered bars. Bars are
 * normalized to the tallest bin; an all-zero histogram renders an empty
 * baseline instead of dividing by zero.
 */
export function HistogramChart({ bins }: { bins: Uint32Array }) {
  const max = bins.reduce((m, v) => (v > m ? v : m), 0);
  const height = 60;

  return (
    <svg
      role="img"
      aria-label="Luminance histogram"
      viewBox={`0 0 256 ${height}`}
      preserveAspectRatio="none"
      className="h-16 w-full rounded-md border bg-background"
      data-testid="luminance-histogram"
    >
      {Array.from(bins, (count, i) => {
        const barHeight = max === 0 ? 0 : (count / max) * height;
        return (
          <rect
            key={i}
            x={i}
            y={height - barHeight}
            width={1}
            height={barHeight}
            className="fill-muted-foreground"
          />
        );
      })}
    </svg>
  );
}
