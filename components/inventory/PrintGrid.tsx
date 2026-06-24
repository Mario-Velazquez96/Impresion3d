import { PrintCard, type PrintCardView } from "@/components/inventory/PrintCard";

/**
 * The inventory grid (Server Component, R8, R11). Renders a responsive grid of
 * PrintCards, each already carrying a server-generated signed photo URL. Shows an
 * empty state when no print matches the active search/filters.
 */
export function PrintGrid({ prints }: { prints: PrintCardView[] }) {
  if (prints.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No prints match your search.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {prints.map((print) => (
        <PrintCard key={print.id} print={print} />
      ))}
    </div>
  );
}
