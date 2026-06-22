"use client";

import { useActionState, useEffect, useState } from "react";

import { setUserRole, type ActionResult } from "@/actions/users";
import type { Role } from "@/lib/validation/user";

export type UsersTableRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/**
 * Users list with an inline role editor (R10). Each row submits the new role to
 * the setUserRole server action; on success the page is revalidated server-side.
 */
export function UsersTable({ users }: { users: UsersTableRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4 font-medium">Name</th>
          <th className="py-2 pr-4 font-medium">Email</th>
          <th className="py-2 pr-4 font-medium">Role</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
      </tbody>
    </table>
  );
}

function UserRow({ user }: { user: UsersTableRow }) {
  const [role, setRole] = useState<Role>(user.role);
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_prev, formData) => setUserRole(_prev, formData), null);

  // Roll the select back to the persisted value if the action reports failure.
  useEffect(() => {
    if (state && !state.ok) {
      setRole(user.role);
    }
  }, [state, user.role]);

  return (
    <tr className="border-b">
      <td className="py-2 pr-4">{user.name}</td>
      <td className="py-2 pr-4">{user.email}</td>
      <td className="py-2 pr-4">
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <label className="sr-only" htmlFor={`role-${user.id}`}>
            Role for {user.name}
          </label>
          <select
            id={`role-${user.id}`}
            name="role"
            value={role}
            disabled={pending}
            onChange={(event) => setRole(event.target.value as Role)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="EMPLOYEE">Employee</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button
            type="submit"
            disabled={pending || role === user.role}
            className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {state && !state.ok ? (
            <span role="alert" className="text-xs text-destructive">
              {state.error}
            </span>
          ) : null}
        </form>
      </td>
    </tr>
  );
}
