"use client";

import { Button } from "@/components/ui/button";

/**
 * Expenses error boundary. Catches errors thrown while rendering the expenses page
 * (e.g. a failed data fetch) and offers a retry. Must be a Client Component per the
 * App Router error-boundary contract.
 */
export default function ExpensesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong loading expenses.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
