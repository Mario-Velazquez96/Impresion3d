"use client";

import { Button } from "@/components/ui/button";

/**
 * Board error boundary. Catches errors thrown while rendering the board (e.g. a
 * failed data fetch) and offers a retry. Must be a Client Component per the App
 * Router error-boundary contract.
 */
export default function BoardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Board</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong loading the board.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
