/**
 * Planning loading skeleton. Renders a header + color-picker shell + a 7-column
 * week grid placeholder while the server loads the week plan and prints, so the
 * layout doesn't jump when data arrives.
 */
export default function PlanningLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
