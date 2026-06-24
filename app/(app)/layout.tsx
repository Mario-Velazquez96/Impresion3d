import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";

/**
 * Layout for the authenticated (app) group (R3). Any unauthenticated request is
 * redirected to /login. Admins additionally see a link to user management.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
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
          {user.role === "ADMIN" ? (
            <Link
              href="/admin/users"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Users
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
