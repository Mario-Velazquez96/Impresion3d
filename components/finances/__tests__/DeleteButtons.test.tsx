import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const deleteSaleMock = vi.fn();
vi.mock("@/actions/sales", () => ({
  deleteSaleAction: (...a: unknown[]) => deleteSaleMock(...a),
}));

const deleteWithdrawalMock = vi.fn();
vi.mock("@/actions/withdrawals", () => ({
  deleteWithdrawalAction: (...a: unknown[]) => deleteWithdrawalMock(...a),
}));

import { DeleteSaleButton } from "@/components/finances/DeleteSaleButton";
import { DeleteWithdrawalButton } from "@/components/finances/DeleteWithdrawalButton";

/**
 * The two ledger delete controls (10_sales_and_balance R10, R12). These are
 * Admin-only in the SERVER ACTION; the button merely submits. A rejection must
 * surface rather than fail silently.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteSaleButton (R10)", () => {
  it("submits the sale id to deleteSaleAction", async () => {
    deleteSaleMock.mockResolvedValue({ ok: true });
    render(<DeleteSaleButton id="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteSaleMock).toHaveBeenCalledTimes(1));
    const submitted = deleteSaleMock.mock.calls[0][1] as FormData;
    expect(submitted.get("id")).toBe("s1");
  });

  it("surfaces a 'Not authorized' rejection as an alert", async () => {
    // A non-admin's delete is refused by the action's requireAdmin() with no DB
    // work; the UI must show that rather than appear to succeed.
    deleteSaleMock.mockResolvedValue({ ok: false, error: "Not authorized" });
    render(<DeleteSaleButton id="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not authorized");
  });

  it("renders no alert on success", async () => {
    deleteSaleMock.mockResolvedValue({ ok: true });
    render(<DeleteSaleButton id="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteSaleMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("DeleteWithdrawalButton (R12)", () => {
  it("submits the withdrawal id to deleteWithdrawalAction", async () => {
    deleteWithdrawalMock.mockResolvedValue({ ok: true });
    render(<DeleteWithdrawalButton id="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteWithdrawalMock).toHaveBeenCalledTimes(1));
    const submitted = deleteWithdrawalMock.mock.calls[0][1] as FormData;
    expect(submitted.get("id")).toBe("w1");
  });

  it("surfaces a 'Not authorized' rejection as an alert", async () => {
    deleteWithdrawalMock.mockResolvedValue({
      ok: false,
      error: "Not authorized",
    });
    render(<DeleteWithdrawalButton id="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not authorized");
  });

  it("renders no alert on success", async () => {
    deleteWithdrawalMock.mockResolvedValue({ ok: true });
    render(<DeleteWithdrawalButton id="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteWithdrawalMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
