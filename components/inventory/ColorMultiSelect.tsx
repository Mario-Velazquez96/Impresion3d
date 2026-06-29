"use client";

import { useState } from "react";

/**
 * Multi-select of catalog colors with hex swatches (Client island, R11). Renders a
 * checkbox per color (each emits a `colorIds` form field when checked) so the set
 * posts as repeated `colorIds` entries the action collects via getAll. Controlled
 * local state drives the visual selected count; the actual submitted values are the
 * checked inputs (no hidden duplication). Fully keyboard operable (native
 * checkboxes + labels).
 */

export type ColorOption = { id: string; name: string; hex: string };

export function ColorMultiSelect({
  colors,
  defaultSelectedIds = [],
  error,
  idPrefix,
}: {
  colors: ColorOption[];
  defaultSelectedIds?: string[];
  error?: string;
  idPrefix: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelectedIds),
  );

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">
        Colors{" "}
        <span className="text-xs text-muted-foreground">
          ({selected.size} selected)
        </span>
      </legend>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
        {colors.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No colors in the catalog yet.
          </span>
        ) : (
          colors.map((color) => {
            const inputId = `${idPrefix}-color-${color.id}`;
            const isChecked = selected.has(color.id);
            return (
              <label
                key={color.id}
                htmlFor={inputId}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  name="colorIds"
                  value={color.id}
                  defaultChecked={isChecked}
                  onChange={(e) => toggle(color.id, e.target.checked)}
                  className="size-3.5"
                />
                <span
                  aria-hidden="true"
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: color.hex }}
                />
                {color.name}
              </label>
            );
          })
        )}
      </div>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}
