/**
 * Inventory loading skeleton. Renders a header + filter shell + a grid of card
 * placeholders while the server fetches prints and signs photo URLs, so the layout
 * doesn't jump when data arrives.
 */
export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="h-10 w-28 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-40 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
