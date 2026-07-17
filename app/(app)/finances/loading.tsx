/**
 * Finances loading skeleton. Renders a header, a balance-card shell, and a few row
 * shells while the server derives the balance and fetches the two ledgers, so the
 * layout doesn't jump when data arrives.
 */
export default function FinancesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="h-36 animate-pulse rounded-lg bg-muted" />
      <div className="flex flex-col gap-3">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
