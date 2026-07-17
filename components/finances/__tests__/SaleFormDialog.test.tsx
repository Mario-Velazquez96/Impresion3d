import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const createMock = vi.fn();
vi.mock("@/actions/sales", () => ({
  createSaleAction: (...a: unknown[]) => createMock(...a),
}));

import { SaleFormDialog } from "@/components/finances/SaleFormDialog";

/** Record-a-sale dialog (10_sales_and_balance R8, R10, R14). */

const prints = [
  { id: "p1", name: "Dragon" },
  { id: "p2", name: "Vase" },
];

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
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
  return screen.getByRole("dialog", { name: "Record sale" });
}

function fillValid(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText("Amount"), {
    target: { value: "1250.00" },
  });
  fireEvent.change(within(dialog).getByLabelText("Date"), {
    target: { value: "2026-07-01" },
  });
  fireEvent.change(within(dialog).getByLabelText("Print"), {
    target: { value: "p1" },
  });
}

describe("SaleFormDialog — the REQUIRED print select (R8)", () => {
  it("lists the whole inventory as options", () => {
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();

    const select = within(dialog).getByLabelText("Print");
    expect(within(select).getByRole("option", { name: "Dragon" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Vase" })).toBeInTheDocument();
  });

  it("marks the print select as required", () => {
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();

    expect(within(dialog).getByLabelText("Print")).toBeRequired();
  });

  it("defaults to no print chosen (a sale must name one deliberately)", () => {
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();

    expect(
      (within(dialog).getByLabelText("Print") as HTMLSelectElement).value,
    ).toBe("");
  });

  it("surfaces a printId field error from the action on the field", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "That print no longer exists",
      fieldErrors: [
        { field: "printId", message: "That print no longer exists" },
      ],
    });
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /no longer exists/i,
    );
  });
});

describe("SaleFormDialog — submission (R10)", () => {
  it("submits amount, date and printId to createSaleAction", async () => {
    createMock.mockResolvedValue({ ok: true });
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.get("amount")).toBe("1250.00");
    expect(submitted.get("date")).toBe("2026-07-01");
    expect(submitted.get("printId")).toBe("p1");
  });

  it("submits the optional buyer and notes when filled", async () => {
    createMock.mockResolvedValue({ ok: true });
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.change(within(dialog).getByLabelText("Buyer (optional)"), {
      target: { value: "Ana" },
    });
    fireEvent.change(within(dialog).getByLabelText("Notes (optional)"), {
      target: { value: "Repeat customer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.get("buyer")).toBe("Ana");
    expect(submitted.get("notes")).toBe("Repeat customer");
  });
});

describe("SaleFormDialog — amount input (R14)", () => {
  it("refuses negatives at the input level (min=0, step=0.01)", () => {
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();

    const amount = within(dialog).getByLabelText("Amount");
    expect(amount).toHaveAttribute("type", "number");
    expect(amount).toHaveAttribute("min", "0");
    expect(amount).toHaveAttribute("step", "0.01");
    expect(amount).toBeRequired();
  });

  it("surfaces an amount field error from the action on the field", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "Amount must be greater than zero",
      fieldErrors: [
        { field: "amount", message: "Amount must be greater than zero" },
      ],
    });
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /greater than zero/i,
    );
  });

  it("surfaces a non-field failure as a form-level alert", async () => {
    createMock.mockResolvedValue({ ok: false, error: "Failed to record sale" });
    render(<SaleFormDialog prints={prints} />);
    const dialog = openDialog();
    fillValid(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Failed to record sale",
    );
  });
});
