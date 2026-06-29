import { redirect } from "next/navigation";

import { signOut } from "@/actions/users";
import { MainNav } from "@/components/layout/MainNav";
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
        <MainNav showAdmin={user.role === "ADMIN"} />
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
