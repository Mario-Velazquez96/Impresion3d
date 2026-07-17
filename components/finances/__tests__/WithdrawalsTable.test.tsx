import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/actions/withdrawals", () => ({
  deleteWithdrawalAction: vi.fn(),
}));

import { WithdrawalsTable } from "@/components/finances/WithdrawalsTable";
import type { WithdrawalRowView } from "@/components/finances/types";

/** The withdrawals ledger list (10_sales_and_balance R15, R17). */

// Pre-ordered date-DESC, as the service returns them.
const rows: WithdrawalRowView[] = [
  {
    id: "w1",
    amount: "500.00",
    date: "2026-07-12T00:00:00.000Z",
    reason: "Owner draw",
    recordedByName: "Mario Admin",
  },
  {
    id: "w2",
    amount: "350.25",
    date: "2026-07-03T00:00:00.000Z",
    reason: "Equipment fund",
    recordedByName: "Sofia Admin",
  },
];

describe("WithdrawalsTable — the audit trail (R15)", () => {
  it("shows WHO recorded each withdrawal", () => {
    render(<WithdrawalsTable rows={rows} canDelete={false} />);

    const row = screen.getByRole("row", { name: /Owner draw/ });
    expect(within(row).getByText("Mario Admin")).toBeInTheDocument();
    expect(screen.getByText("Sofia Admin")).toBeInTheDocument();
  });

  it("has a 'Recorded by' column header", () => {
    render(<WithdrawalsTable rows={rows} canDelete={false} />);
    expect(
      screen.getByRole("columnheader", { name: "Recorded by" }),
    ).toBeInTheDocument();
  });
});

describe("WithdrawalsTable — rows (R17)", () => {
  it("renders each withdrawal with its reason and formatted amount", () => {
    render(<WithdrawalsTable rows={rows} canDelete={false} />);

    const row = screen.getByRole("row", { name: /Owner draw/ });
    expect(within(row).getByText("$500.00")).toBeInTheDocument();
    expect(screen.getByText("$350.25")).toBeInTheDocument();
  });

  it("preserves the service's date-DESCENDING order (most recent first)", () => {
    render(<WithdrawalsTable rows={rows} canDelete={false} />);

    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("Owner draw");
    expect(bodyRows[1]).toHaveTextContent("Equipment fund");
  });
});

describe("WithdrawalsTable — empty state (R17)", () => {
  it("shows an empty-state message when there are no withdrawals", () => {
    render(<WithdrawalsTable rows={[]} canDelete={false} />);
    expect(screen.getByText("No withdrawals recorded yet.")).toBeInTheDocument();
  });
});

describe("WithdrawalsTable — the delete control is UX-gated (R12)", () => {
  // Hiding is UX; deleteWithdrawalAction's requireAdmin() is the real guarantee.
  it("renders a delete control per row when canDelete is true", () => {
    render(<WithdrawalsTable rows={rows} canDelete />);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
  });

  it("renders NO delete control when canDelete is false", () => {
    render(<WithdrawalsTable rows={rows} canDelete={false} />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
