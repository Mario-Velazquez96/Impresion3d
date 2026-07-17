import Link from "next/link";

/**
 * Shared primary navigation used by both the (app) layout and the admin layout
 * so the same links always appear and the two navs cannot drift apart. The
 * admin-only links (Users, Catalogs) render only when `showAdmin` is true.
 *
 * Calculator and Finances sit deliberately OUTSIDE the `showAdmin` block:
 * /calculator (09 R1) and /finances (10 R1) are open to every authenticated user,
 * so both links must appear in both navs. On /finances an employee views the
 * balance and both ledgers; only the Admin-only controls inside the page are
 * gated (by the server actions — the UI hiding is UX).
 */
export function MainNav({ showAdmin }: { showAdmin: boolean }) {
  return (
    <nav className="flex items-center gap-4">
      <Link href="/board" className="text-sm font-semibold">
        Tower Layers
      </Link>
      <Link
        href="/inventory"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Inventory
      </Link>
      <Link
        href="/planning"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Planning
      </Link>
      <Link
        href="/expenses"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Expenses
      </Link>
      <Link
        href="/calculator"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Calculator
      </Link>
      <Link
        href="/finances"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Finances
      </Link>
      {showAdmin ? (
        <>
          <Link
            href="/admin/users"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Users
          </Link>
          <Link
            href="/admin/catalogs"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Catalogs
          </Link>
        </>
      ) : null}
    </nav>
  );
}
