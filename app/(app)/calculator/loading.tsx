/**
 * Calculator loading skeleton. Renders a header + the input/breakdown two-column
 * shell while the server loads the color catalog and prints, so the layout doesn't
 * jump when the reference data arrives.
 */
export default function CalculatorLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-5 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-4">
          <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
          <div className="h-56 w-full animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-64 w-full animate-pulse rounded-lg bg-muted lg:w-80" />
      </div>
    </div>
  );
}
