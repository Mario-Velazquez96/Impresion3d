import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { ForbiddenError, requireAdmin, UnauthenticatedError } from "@/lib/auth";

/**
 * Layout for the admin area (R9). Unauthenticated requests go to /login;
 * authenticated non-admins are shown a 403 and never reach admin pages.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let adminEmail: string;
  try {
    const admin = await requireAdmin();
    adminEmail = admin.email;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-3xl font-bold">403 — Forbidden</h1>
          <p className="text-muted-foreground">
            You do not have permission to access this area.
          </p>
          <Button asChild variant="outline">
            <Link href="/board">Back to board</Link>
          </Button>
        </main>
      );
    }
    throw error;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-4">
          <Link href="/board" className="text-sm font-semibold">
            Tower Layers
          </Link>
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
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{adminEmail}</span>
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
