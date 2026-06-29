import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// The table composes client islands (edit dialog + delete button) that import the
// server actions; mock them so the components import cleanly in jsdom.
vi.mock("@/actions/expenses", () => ({
  createExpenseAction: vi.fn(),
  updateExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
}));

import { ExpensesTable } from "@/components/expenses/ExpensesTable";

const supplyTypes = [{ id: "st1", name: "PLA" }];

const rows = [
  {
    id: "e1",
    cost: "1234.99",
    reason: "Bulk PLA",
    date: "2026-06-15T00:00:00.000Z",
    purchaseUrl: "https://example.com/cart",
    supplyTypeId: "st1",
    supplyTypeName: "PLA",
  },
  {
    id: "e2",
    cost: "0.10",
    reason: "Sample",
    date: "2026-06-10T00:00:00.000Z",
    purchaseUrl: null,
    supplyTypeId: "st1",
    supplyTypeName: "PLA",
  },
];

describe("ExpensesTable (R6 formatting)", () => {
  it("renders formatted currency, reason, supply type, and a purchase link", () => {
    render(
      <ExpensesTable rows={rows} supplyTypes={supplyTypes} canDelete={false} />,
    );

    const first = screen.getByText("Bulk PLA").closest("tr")!;
    // MXN currency with grouping + two decimals.
    expect(within(first).getByText(/\$1,234\.99/)).toBeInTheDocument();
    // The supply-type name appears in the row's cell (and also inside the edit
    // dialog's select options), so assert at least one occurrence in the row.
    expect(within(first).getAllByText("PLA").length).toBeGreaterThan(0);
    expect(
      within(first).getByRole("link", { name: "Link" }),
    ).toHaveAttribute("href", "https://example.com/cart");

    // Trailing-zero precision preserved on the second row.
    const second = screen.getByText("Sample").closest("tr")!;
    expect(within(second).getByText(/\$0\.10/)).toBeInTheDocument();
    // No link cell → em dash.
    expect(within(second).queryByRole("link")).toBeNull();
  });

  it("renders an empty state when there are no expenses", () => {
    render(
      <ExpensesTable rows={[]} supplyTypes={supplyTypes} canDelete={true} />,
    );
    expect(screen.getByText(/no expenses recorded yet/i)).toBeInTheDocument();
  });

  it("hides the Delete control for a non-admin viewer (R7)", () => {
    render(
      <ExpensesTable rows={rows} supplyTypes={supplyTypes} canDelete={false} />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    // Edit is always available.
    expect(
      screen.getAllByRole("button", { name: "Edit" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows the Delete control for an admin viewer (R7)", () => {
    render(
      <ExpensesTable rows={rows} supplyTypes={supplyTypes} canDelete={true} />,
    );
    expect(
      screen.getAllByRole("button", { name: "Delete" }).length,
    ).toBe(rows.length);
  });
});
