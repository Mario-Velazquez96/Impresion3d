import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const createMock = vi.fn();
vi.mock("@/actions/withdrawals", () => ({
  createWithdrawalAction: (...a: unknown[]) => createMock(...a),
}));

import { WithdrawalFormDialog } from "@/components/finances/WithdrawalFormDialog";

/** Record-a-withdrawal dialog (10_sales_and_balance R11, R14, R15). */

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Record withdrawal" }));
  return screen.getByRole("dialog", { name: "Record withdrawal" });
}

function fillValid(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText("Amount"), {
    target: { value: "500.00" },
  });
  fireEvent.change(within(dialog).getByLabelText("Date"), {
    target: { value: "2026-07-02" },
  });
  fireEvent.change(within(dialog).getByLabelText("Reason"), {
    target: { value: "Owner draw" },
  });
}

describe("WithdrawalFormDialog — fields (R14, R15)", () => {
  it("renders amount, date and reason", () => {
    render(<WithdrawalFormDialog />);
    const dialog = openDialog();

    expect(within(dialog).getByLabelText("Amount")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Date")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Reason")).toBeInTheDocument();
  });

  it("renders NO recordedBy input — the audit trail is server-assigned (R15)", () => {
    render(<WithdrawalFormDialog />);
    const dialog = openDialog();

    // Who took the money out comes from the session in createWithdrawalAction,
    // never from client input, so there is nothing to render or forge here.
    expect(within(dialog).queryByLabelText(/recorded/i)).toBeNull();
    expect(
      dialog.querySelector('[name="recordedById"]'),
    ).toBeNull();
  });

  it("requires the reason (a withdrawal with no stated reason is not auditable)", () => {
    render(<WithdrawalFormDialog />);
    const dialog = openDialog();

    expect(within(dialog).getByLabelText("Reason")).toBeRequired();
  });

  it("refuses negative amounts at the input level (min=0, step=0.01)", () => {
    render(<WithdrawalFormDialog />);
    const dialog = openDialog();

    const amount = within(dialog).getByLabelText("Amount");
    expect(amount).toHaveAttribute("type", "number");
    expect(amount).toHaveAttribute("min", "0");
    expect(amount).toHaveAttribute("step", "0.01");
  });
});

describe("WithdrawalFormDialog — submission", () => {
  it("submits amount, date and reason — and NO recordedById", async () => {
    createMock.mockResolvedValue({ ok: true });
    render(<WithdrawalFormDialog />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.get("amount")).toBe("500.00");
    expect(submitted.get("date")).toBe("2026-07-02");
    expect(submitted.get("reason")).toBe("Owner draw");
    expect(submitted.get("recordedById")).toBeNull();
  });
});

describe("WithdrawalFormDialog — server rejections surface (R11)", () => {
  it("shows 'Not authorized' as an alert when a non-admin's submit is rejected", async () => {
    // The page hides this dialog from employees, but THAT IS UX. The server's
    // requireAdmin() is the requirement; if its rejection ever reaches the UI, it
    // must be visible rather than silently swallowed.
    createMock.mockResolvedValue({ ok: false, error: "Not authorized" });
    render(<WithdrawalFormDialog />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Not authorized",
    );
  });

  it("shows a reason field error from the action on the field (R14)", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "Reason is required",
      fieldErrors: [{ field: "reason", message: "Reason is required" }],
    });
    render(<WithdrawalFormDialog />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Reason is required",
    );
  });
});
