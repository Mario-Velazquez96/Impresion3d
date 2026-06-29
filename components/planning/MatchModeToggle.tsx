"use client";

import { cn } from "@/lib/utils";

/**
 * Filter mode toggle (Client island, R4/R5). "Full" (default) lists only fully
 * producible prints; "Partial" adds prints sharing ≥1 color and shows the missing
 * ones. Switching re-derives the list from data already in the client (no refetch).
 */
export type MatchMode = "full" | "partial";

export function MatchModeToggle({
  mode,
  onChange,
}: {
  mode: MatchMode;
  onChange: (mode: MatchMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Match mode"
      className="inline-flex rounded-md border p-0.5"
    >
      {(["full", "partial"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "h-8 rounded px-3 text-sm font-medium capitalize",
            mode === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value} match
        </button>
      ))}
    </div>
  );
}
