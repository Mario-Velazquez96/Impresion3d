import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BalanceCard } from "@/components/finances/BalanceCard";
import type { BalanceView } from "@/components/finances/types";
import { computeBalance } from "@/lib/finances-core";

/**
 * The balance headline (10_sales_and_balance R2, R4, R5, R6, R7).
 *
 * The summaries below are built with the REAL `computeBalance`, so these tests
 * assert the whole derivation → display chain, not a hand-written fixture.
 */

function view(sales: string | null, withdrawals: string | null): BalanceView {
  const s = computeBalance(sales, withdrawals);
  return {
    salesTotal: s.salesTotal,
    withdrawalsTotal: s.withdrawalsTotal,
    balance: s.balance,
    isNegative: s.isNegative,
  };
}

describe("BalanceCard — the REQUIRED label (R4)", () => {
  it("renders 'Sales minus withdrawals — does not include expenses' as real text", () => {
    render(<BalanceCard summary={view("1350.25", "850.25")} />);

    // A requirement, not decoration: the figure must never be misread as a bank
    // balance. Real text (not a title/tooltip), so it is readable AND assertable.
    expect(
      screen.getByText("Sales minus withdrawals — does not include expenses"),
    ).toBeInTheDocument();
  });

  it("renders the label adjacent to the figure, inside the balance card", () => {
    render(<BalanceCard summary={view("1350.25", "850.25")} />);

    const card = screen.getByRole("region", { name: "Account balance" });
    expect(card).toHaveTextContent(
      "Sales minus withdrawals — does not include expenses",
    );
    expect(card).toHaveTextContent("$500.00");
  });

  it("renders the label even when the ledgers are empty", () => {
    render(<BalanceCard summary={view(null, null)} />);
    expect(
      screen.getByText("Sales minus withdrawals — does not include expenses"),
    ).toBeInTheDocument();
  });
});

describe("BalanceCard — the worked example (R2, R7)", () => {
  // sales 1250.00 + 0.10 + 0.20 + 99.95 = 1350.25; withdrawals 500.00 + 350.25 =
  // 850.25; balance 500.00. An Expense of $2,000.00 exists in that scenario and
  // is deliberately absent from every figure here (R3).
  it("renders sales $1,350.25, withdrawals $850.25 and the balance $500.00", () => {
    render(<BalanceCard summary={view("1350.25", "850.25")} />);

    expect(screen.getByTestId("sales-total")).toHaveTextContent("$1,350.25");
    expect(screen.getByTestId("withdrawals-total")).toHaveTextContent("$850.25");
    expect(screen.getByTestId("balance-figure")).toHaveTextContent("$500.00");
  });

  it("formats through formatCurrency exactly once — no drift, no extra decimals", () => {
    render(<BalanceCard summary={view("1350.25", "850.25")} />);
    const figure = screen.getByTestId("balance-figure");
    expect(figure.textContent).toBe("$500.00");
    expect(figure.textContent).not.toContain("500.0000");
  });

  it("does not mark a positive balance as negative", () => {
    render(<BalanceCard summary={view("1350.25", "850.25")} />);

    expect(screen.queryByText("Negative balance")).toBeNull();
    expect(screen.getByTestId("balance-figure")).not.toHaveClass(
      "text-destructive",
    );
  });
});

describe("BalanceCard — empty ledgers (R5)", () => {
  it("renders $0.00 and never 'NaN'", () => {
    render(<BalanceCard summary={view(null, null)} />);

    expect(screen.getByTestId("balance-figure")).toHaveTextContent("$0.00");
    expect(screen.getByTestId("sales-total")).toHaveTextContent("$0.00");
    expect(screen.getByTestId("withdrawals-total")).toHaveTextContent("$0.00");
    expect(
      screen.getByRole("region", { name: "Account balance" }),
    ).not.toHaveTextContent("NaN");
  });

  it("renders $0.00 rather than a blank figure", () => {
    render(<BalanceCard summary={view(null, null)} />);
    expect(screen.getByTestId("balance-figure").textContent?.trim()).toBe(
      "$0.00",
    );
  });
});

describe("BalanceCard — a negative balance (R6)", () => {
  // Sales 100.00 − withdrawals 250.50 = -150.50.
  it("renders -$150.50 exactly — not clamped, not hidden, not absolute", () => {
    render(<BalanceCard summary={view("100.00", "250.50")} />);

    const figure = screen.getByTestId("balance-figure");
    expect(figure).toHaveTextContent("-$150.50");
    expect(figure.textContent).not.toBe("$0.00");
    expect(figure.textContent).not.toBe("$150.50");
  });

  it("applies the destructive style", () => {
    render(<BalanceCard summary={view("100.00", "250.50")} />);
    expect(screen.getByTestId("balance-figure")).toHaveClass("text-destructive");
  });

  it("announces the negative state textually (colour/sign alone is not accessible)", () => {
    render(<BalanceCard summary={view("100.00", "250.50")} />);
    expect(screen.getByText("Negative balance")).toBeInTheDocument();
  });

  it("shows a one-cent overdraw as -$0.01", () => {
    render(<BalanceCard summary={view("0", "0.01")} />);
    expect(screen.getByTestId("balance-figure")).toHaveTextContent("-$0.01");
    expect(screen.getByText("Negative balance")).toBeInTheDocument();
  });
});
