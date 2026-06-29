"use client";

import { Button } from "@/components/ui/button";

/**
 * Inventory error boundary. Catches errors thrown while rendering the inventory
 * page (e.g. a failed data fetch or signing call) and offers a retry. Must be a
 * Client Component per the App Router error-boundary contract.
 */
export default function InventoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong loading the inventory.
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
