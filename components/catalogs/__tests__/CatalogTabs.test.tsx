import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/actions/catalogs", () => ({
  createCatalog: vi.fn(),
  updateCatalog: vi.fn(),
  deleteCatalog: vi.fn(),
}));

import { CatalogTabs } from "@/components/catalogs/CatalogTabs";

const props = {
  colors: [{ id: "c1", name: "Blue", hex: "#0000FF" }],
  printTypes: [{ id: "p1", name: "frame" }],
  supplyTypes: [{ id: "s1", name: "PLA" }],
  taskCategories: [{ id: "t1", name: "Purchases" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

describe("CatalogTabs (R4, R8)", () => {
  it("renders a tablist with all four catalog tabs", () => {
    render(<CatalogTabs {...props} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Colors",
      "Print types",
      "Supply types",
      "Task categories",
    ]);
  });

  it("shows the Colors panel (with a swatch) first", () => {
    render(<CatalogTabs {...props} />);
    expect(screen.getByText("Blue")).toBeInTheDocument();
    expect(screen.getByText("#0000FF")).toBeInTheDocument();
    // Other panels are hidden until selected.
    expect(screen.queryByText("frame")).not.toBeInTheDocument();
  });

  it("switches panels on tab click", () => {
    render(<CatalogTabs {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Print types" }));
    expect(screen.getByText("frame")).toBeInTheDocument();
    expect(screen.queryByText("Blue")).not.toBeInTheDocument();
  });

  it("moves selection with ArrowRight (keyboard operable)", () => {
    render(<CatalogTabs {...props} />);
    const colorsTab = screen.getByRole("tab", { name: "Colors" });
    colorsTab.focus();
    fireEvent.keyDown(colorsTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Print types" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("frame")).toBeInTheDocument();
  });

  it("wraps to the last tab with ArrowLeft from the first (Home/End too)", () => {
    render(<CatalogTabs {...props} />);
    const colorsTab = screen.getByRole("tab", { name: "Colors" });
    colorsTab.focus();
    fireEvent.keyDown(colorsTab, { key: "ArrowLeft" });
    expect(
      screen.getByRole("tab", { name: "Task categories" }),
    ).toHaveAttribute("aria-selected", "true");

    const lastTab = screen.getByRole("tab", { name: "Task categories" });
    fireEvent.keyDown(lastTab, { key: "Home" });
    expect(screen.getByRole("tab", { name: "Colors" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const firstTab = screen.getByRole("tab", { name: "Colors" });
    fireEvent.keyDown(firstTab, { key: "End" });
    expect(
      screen.getByRole("tab", { name: "Task categories" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
