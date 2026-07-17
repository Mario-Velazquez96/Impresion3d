import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/actions/sales", () => ({
  deleteSaleAction: vi.fn(),
}));

import { SalesTable } from "@/components/finances/SalesTable";
import type { SaleRowView } from "@/components/finances/types";

/** The sales ledger list (10_sales_and_balance R17). */

// Pre-ordered date-DESC, as the service returns them (orderBy date desc).
const rows: SaleRowView[] = [
  {
    id: "s1",
    amount: "1250.00",
    date: "2026-07-10T00:00:00.000Z",
    printName: "Dragon",
    buyer: "Ana",
    notes: "Repeat customer",
  },
  {
    id: "s2",
    amount: "99.95",
    date: "2026-07-05T00:00:00.000Z",
    printName: "Vase",
    buyer: null,
    notes: null,
  },
  {
    id: "s3",
    amount: "0.10",
    date: "2026-07-01T00:00:00.000Z",
    printName: "Keychain",
    buyer: null,
    notes: null,
  },
];

describe("SalesTable — rows (R17)", () => {
  it("renders each sale with its print name and formatted amount", () => {
    render(<SalesTable rows={rows} canDelete={false} />);

    const row = screen.getByRole("row", { name: /Dragon/ });
    expect(within(row).getByText("$1,250.00")).toBeInTheDocument();
    expect(within(row).getByText("Ana")).toBeInTheDocument();
    expect(within(row).getByText("Repeat customer")).toBeInTheDocument();
  });

  it("preserves the service's date-DESCENDING order (most recent first)", () => {
    render(<SalesTable rows={rows} canDelete={false} />);

    const bodyRows = screen.getAllByRole("row").slice(1); // drop the header
    expect(bodyRows[0]).toHaveTextContent("Dragon");
    expect(bodyRows[1]).toHaveTextContent("Vase");
    expect(bodyRows[2]).toHaveTextContent("Keychain");
  });

  it("formats a sub-peso amount exactly ($0.10), no float drift", () => {
    render(<SalesTable rows={rows} canDelete={false} />);
    expect(screen.getByText("$0.10")).toBeInTheDocument();
  });

  it("renders a dash for an absent buyer/notes", () => {
    render(<SalesTable rows={[rows[1]]} canDelete={false} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("SalesTable — empty state (R17)", () => {
  it("shows an empty-state message when there are no sales", () => {
    render(<SalesTable rows={[]} canDelete={false} />);
    expect(screen.getByText("No sales recorded yet.")).toBeInTheDocument();
  });

  it("renders no delete controls in the empty state", () => {
    render(<SalesTable rows={[]} canDelete />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

describe("SalesTable — the delete control is UX-gated (R10)", () => {
  // Hiding the button is UX only; deleteSaleAction's requireAdmin() is the real
  // guarantee (see actions/__tests__/sales.test.ts).
  it("renders a delete control per row when canDelete is true", () => {
    render(<SalesTable rows={rows} canDelete />);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(3);
  });

  it("renders NO delete control when canDelete is false", () => {
    render(<SalesTable rows={rows} canDelete={false} />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
