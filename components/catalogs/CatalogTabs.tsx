"use client";

import { useRef, useState } from "react";

import { CatalogTable, type CatalogRowView } from "./CatalogTable";
import type { CatalogKey } from "@/lib/validation/catalog";

/**
 * Accessible tab UI for the four catalogs (R4). Implemented with native ARIA tab
 * markup (no @radix-ui/react-tabs runtime dep — it isn't in package.json). The
 * tablist supports Left/Right/Home/End roving focus per the WAI-ARIA Tabs
 * pattern; each panel hosts a CatalogTable. The Colors tab renders hex swatches
 * (R8).
 */

type ColorRowView = CatalogRowView & { hex: string };

type TabDef = {
  key: CatalogKey;
  label: string;
};

const TABS: TabDef[] = [
  { key: "color", label: "Colors" },
  { key: "printType", label: "Print types" },
  { key: "supplyType", label: "Supply types" },
  { key: "taskCategory", label: "Task categories" },
];

export function CatalogTabs({
  colors,
  printTypes,
  supplyTypes,
  taskCategories,
}: {
  colors: ColorRowView[];
  printTypes: CatalogRowView[];
  supplyTypes: CatalogRowView[];
  taskCategories: CatalogRowView[];
}) {
  const [active, setActive] = useState<CatalogKey>("color");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const rowsByKey: Record<CatalogKey, CatalogRowView[]> = {
    color: colors,
    printType: printTypes,
    supplyType: supplyTypes,
    taskCategory: taskCategories,
  };

  function focusTab(index: number) {
    const clamped = (index + TABS.length) % TABS.length;
    const tab = TABS[clamped];
    setActive(tab.key);
    tabRefs.current[tab.key]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(TABS.length - 1);
        break;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Catalogs" className="flex gap-1 border-b">
        {TABS.map((tab, index) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
              onClick={() => setActive(tab.key)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={
                "border-b-2 px-4 py-2 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
                (selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`panel-${tab.key}`}
          aria-labelledby={`tab-${tab.key}`}
          hidden={tab.key !== active}
        >
          {tab.key === active ? (
            <CatalogTable
              catalog={tab.key}
              label={tab.label}
              hasHex={tab.key === "color"}
              rows={rowsByKey[tab.key]}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
