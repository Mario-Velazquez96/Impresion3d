import { TASK_STATES } from "@/lib/validation/task";

/**
 * Board loading skeleton. Renders the six fixed-order column shells (R8) while the
 * server fetches filtered tasks, so the layout doesn't jump when data arrives.
 */
export default function BoardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATES.map((state) => (
          <div
            key={state}
            className="flex min-w-64 flex-1 flex-col gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
