"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { ColorOption } from "@/components/inventory/ColorMultiSelect";
import type { PrintTypeOption } from "@/components/inventory/PrintFormDialog";

/**
 * Inventory filters (Client island, R8). A debounced name search plus print-type
 * and color <select>s write to the URL search params — the page is a Server
 * Component, so changing the URL re-fetches the filtered prints on the server.
 * State lives in the URL (shareable / back-button friendly); only the search box
 * keeps a small local value so typing feels instant before the debounce fires.
 */

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function InventoryFilters({
  printTypes,
  colors,
}: {
  printTypes: PrintTypeOption[];
  colors: ColorOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const type = searchParams.get("type") ?? "";
  const color = searchParams.get("color") ?? "";
  const [search, setSearch] = useState(q);

  // Keep the local box in sync when the URL changes elsewhere (e.g. Clear).
  useEffect(() => {
    setSearch(q);
  }, [q]);

  function pushParams(next: URLSearchParams) {
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    pushParams(params);
  }

  // Debounce the name search so each keystroke doesn't trigger a navigation.
  useEffect(() => {
    if (search === q) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) params.set("q", search);
      else params.delete("q");
      pushParams(params);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(q || type || color);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="inventory-search" className="text-xs font-medium">
          Search
        </label>
        <input
          id="inventory-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name…"
          className={`${selectClass} w-48`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="inventory-type" className="text-xs font-medium">
          Print type
        </label>
        <select
          id="inventory-type"
          value={type}
          onChange={(e) => setParam("type", e.target.value)}
          className={selectClass}
        >
          <option value="">All types</option>
          {printTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="inventory-color" className="text-xs font-medium">
          Color
        </label>
        <select
          id="inventory-color"
          value={color}
          onChange={(e) => setParam("color", e.target.value)}
          className={selectClass}
        >
          <option value="">All colors</option>
          {colors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
