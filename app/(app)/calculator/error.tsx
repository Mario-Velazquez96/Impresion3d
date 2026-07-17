"use client";

import { Button } from "@/components/ui/button";

/**
 * Calculator error boundary. Catches errors thrown while rendering the page (e.g.
 * a failed reference-data load) and offers a retry. Must be a Client Component per
 * the App Router error-boundary contract.
 */
export default function CalculatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Price calculator</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong loading the calculator.
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
