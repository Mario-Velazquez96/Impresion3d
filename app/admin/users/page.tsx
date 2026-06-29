import type { Metadata } from "next";

import { InviteUserDialog } from "@/components/admin/InviteUserDialog";
import { UsersTable } from "@/components/admin/UsersTable";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/services/users";

export const metadata: Metadata = {
  title: "Users — Tower Layers",
};

/**
 * Admin user management page (R8, R10). The admin layout already guards the
 * route; requireAdmin() here is a second server-layer check before any data
 * read, and the action handlers re-check on every mutation (R9).
 */
export default async function UsersPage() {
  await requireAdmin();
  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <InviteUserDialog />
      </div>
      <UsersTable
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
        }))}
      />
    </div>
  );
}
