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
  });

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
