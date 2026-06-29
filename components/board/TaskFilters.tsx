"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  PRIORITY_LABELS,
  TASK_STATE_LABELS,
  type CategoryOption,
  type UserOption,
} from "@/components/board/board-types";
import { PRIORITIES, TASK_STATES } from "@/lib/validation/task";

/**
 * Board filters (Client island). Owner/category/state <select>s write to the URL
 * search params via router.push (R7) — the page is a Server Component, so changing
 * the URL re-fetches the filtered tasks on the server. State lives entirely in the
 * URL (shareable / back-button friendly); no local state to drift out of sync.
 */

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function TaskFilters({
  categories,
  users,
}: {
  categories: CategoryOption[];
  users: UserOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const owner = searchParams.get("owner") ?? "";
  const category = searchParams.get("category") ?? "";
  const state = searchParams.get("state") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const hasFilters = Boolean(owner || category || state || priority);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-owner" className="text-xs font-medium">
          Owner
        </label>
        <select
          id="filter-owner"
          value={owner}
          onChange={(e) => setParam("owner", e.target.value)}
          className={selectClass}
        >
          <option value="">All owners</option>
          <option value="none">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-category" className="text-xs font-medium">
          Category
        </label>
        <select
          id="filter-category"
          value={category}
          onChange={(e) => setParam("category", e.target.value)}
          className={selectClass}
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-state" className="text-xs font-medium">
          State
        </label>
        <select
          id="filter-state"
          value={state}
          onChange={(e) => setParam("state", e.target.value)}
          className={selectClass}
        >
          <option value="">All states</option>
          {TASK_STATES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATE_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-priority" className="text-xs font-medium">
          Priority
        </label>
        <select
          id="filter-priority"
          value={priority}
          onChange={(e) => setParam("priority", e.target.value)}
          className={selectClass}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p] ?? p}
            </option>
          ))}
        </select>
      </div>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="h-9 rounded-md border px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
