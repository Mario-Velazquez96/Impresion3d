import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MainNav } from "@/components/layout/MainNav";

describe("MainNav", () => {
  it("always renders the core links", () => {
    render(<MainNav showAdmin={false} />);
    expect(screen.getByRole("link", { name: "Tower Layers" })).toHaveAttribute(
      "href",
      "/board",
    );
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "/inventory",
    );
    expect(screen.getByRole("link", { name: "Planning" })).toHaveAttribute(
      "href",
      "/planning",
    );
    expect(screen.getByRole("link", { name: "Expenses" })).toHaveAttribute(
      "href",
      "/expenses",
    );
    expect(screen.getByRole("link", { name: "Calculator" })).toHaveAttribute(
      "href",
      "/calculator",
    );
    expect(screen.getByRole("link", { name: "Finances" })).toHaveAttribute(
      "href",
      "/finances",
    );
  });

  // The calculator is open to EVERY authenticated user, so its link lives outside
  // the showAdmin block and must render in both navs (09_price_calculator R1).
  it.each([false, true])(
    "renders the Calculator link when showAdmin is %s (not admin-only)",
    (showAdmin) => {
      render(<MainNav showAdmin={showAdmin} />);
      expect(screen.getByRole("link", { name: "Calculator" })).toHaveAttribute(
        "href",
        "/calculator",
      );
    },
  );

  // /finances is open to EVERY authenticated user — an employee views the balance
  // and both ledgers — so its link lives outside the showAdmin block and must
  // render in both navs (10_sales_and_balance R1).
  it.each([false, true])(
    "renders the Finances link when showAdmin is %s (not admin-only)",
    (showAdmin) => {
      render(<MainNav showAdmin={showAdmin} />);
      expect(screen.getByRole("link", { name: "Finances" })).toHaveAttribute(
        "href",
        "/finances",
      );
    },
  );

  it("hides admin links when showAdmin is false", () => {
    render(<MainNav showAdmin={false} />);
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Catalogs" })).toBeNull();
  });

  it("shows admin links when showAdmin is true", () => {
    render(<MainNav showAdmin />);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.getByRole("link", { name: "Catalogs" })).toHaveAttribute(
      "href",
      "/admin/catalogs",
    );
  });
});
