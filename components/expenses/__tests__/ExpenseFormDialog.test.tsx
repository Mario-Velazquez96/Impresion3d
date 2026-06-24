import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/actions/expenses", () => ({
  createExpenseAction: (...a: unknown[]) => createMock(...a),
  updateExpenseAction: (...a: unknown[]) => updateMock(...a),
}));

import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";

const supplyTypes = [
  { id: "st1", name: "PLA" },
  { id: "st2", name: "ABS" },
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

describe("ExpenseFormDialog — create (R3)", () => {
  it("submits cost, reason, date, and supply type to createExpenseAction", async () => {
    createMock.mockResolvedValue({ ok: true });
    render(<ExpenseFormDialog mode="create" supplyTypes={supplyTypes} />);

    fireEvent.click(screen.getByRole("button", { name: "New expense" }));
    const dialog = screen.getByRole("dialog", { name: "New expense" });

    fireEvent.change(within(dialog).getByLabelText("Cost"), {
      target: { value: "12.50" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "PLA filament" },
    });
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Supply type"), {
      target: { value: "st1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.get("cost")).toBe("12.50");
    expect(submitted.get("reason")).toBe("PLA filament");
    expect(submitted.get("date")).toBe("2026-06-01");
    expect(submitted.get("supplyTypeId")).toBe("st1");
  });

  it("shows a field error returned by the action (R8 bad cost)", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "Cost must be a number with at most two decimal places",
      fieldErrors: [
        {
          field: "cost",
          message: "Cost must be a number with at most two decimal places",
        },
      ],
    });
    render(<ExpenseFormDialog mode="create" supplyTypes={supplyTypes} />);
    fireEvent.click(screen.getByRole("button", { name: "New expense" }));
    const dialog = screen.getByRole("dialog", { name: "New expense" });
    // Fill every required field so native form validation lets the submit reach
    // the (mocked) action, which returns the server-side cost field error.
    fireEvent.change(within(dialog).getByLabelText("Cost"), {
      target: { value: "1.234" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "PLA" },
    });
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Supply type"), {
      target: { value: "st1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /two decimal/i,
    );
  });
});

describe("ExpenseFormDialog — edit (R4)", () => {
  const expense = {
    id: "e1",
    cost: "20.00",
    reason: "ABS spool",
    date: "2026-07-01T00:00:00.000Z",
    purchaseUrl: "https://example.com",
    supplyTypeId: "st2",
  };

  it("prefills fields and submits the id + updated values to updateExpenseAction", async () => {
    updateMock.mockResolvedValue({ ok: true });
    render(
      <ExpenseFormDialog
        mode="edit"
        supplyTypes={supplyTypes}
        expense={expense}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit expense" });

    expect(
      (within(dialog).getByLabelText("Cost") as HTMLInputElement).value,
    ).toBe("20.00");
    expect(
      (within(dialog).getByLabelText("Reason") as HTMLInputElement).value,
    ).toBe("ABS spool");

    fireEvent.change(within(dialog).getByLabelText("Cost"), {
      target: { value: "25.99" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const submitted = updateMock.mock.calls[0][1] as FormData;
    expect(submitted.get("id")).toBe("e1");
    expect(submitted.get("cost")).toBe("25.99");
    expect(submitted.get("supplyTypeId")).toBe("st2");
  });
});
