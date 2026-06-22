import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/actions/catalogs", () => ({
  createCatalog: (...a: unknown[]) => createMock(...a),
  updateCatalog: (...a: unknown[]) => updateMock(...a),
  deleteCatalog: (...a: unknown[]) => deleteMock(...a),
}));

import { CatalogTable } from "@/components/catalogs/CatalogTable";

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

const colorRows = [{ id: "c1", name: "Blue", hex: "#0000FF" }];
const nameRows = [{ id: "p1", name: "frame" }];

describe("CatalogTable — colors (R8)", () => {
  it("renders a swatch and the hex string per color row", () => {
    render(
      <CatalogTable catalog="color" label="Colors" hasHex rows={colorRows} />,
    );
    expect(screen.getByText("Blue")).toBeInTheDocument();
    expect(screen.getByText("#0000FF")).toBeInTheDocument();
    // The swatch is an aria-hidden span coloured from the hex.
    const swatch = document.querySelector('span[aria-hidden="true"]');
    expect(swatch).not.toBeNull();
    expect((swatch as HTMLElement).style.backgroundColor).toBe(
      "rgb(0, 0, 255)",
    );
  });

  it("includes a hex input in the add dialog (R8)", () => {
    render(
      <CatalogTable catalog="color" label="Colors" hasHex rows={colorRows} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    const dialog = screen.getByRole("dialog", { name: "Add color" });
    expect(within(dialog).getByLabelText("Hex (#RRGGBB)")).toBeInTheDocument();
  });
});

describe("CatalogTable — create (R4)", () => {
  it("submits catalog + name to createCatalog", async () => {
    createMock.mockResolvedValue({ ok: true });
    render(
      <CatalogTable
        catalog="printType"
        label="Print types"
        hasHex={false}
        rows={nameRows}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add print type" }));
    const dialog = screen.getByRole("dialog", { name: "Add print type" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "deckbox" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.get("catalog")).toBe("printType");
    expect(submitted.get("name")).toBe("deckbox");
  });
});

describe("CatalogTable — edit (R4)", () => {
  it("submits the id + new name to updateCatalog", async () => {
    updateMock.mockResolvedValue({ ok: true });
    render(
      <CatalogTable
        catalog="printType"
        label="Print types"
        hasHex={false}
        rows={nameRows}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit print type" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "renamed" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const submitted = updateMock.mock.calls[0][1] as FormData;
    expect(submitted.get("id")).toBe("p1");
    expect(submitted.get("name")).toBe("renamed");
  });

  it("shows a name field error returned by the action (R5)", async () => {
    updateMock.mockResolvedValue({
      ok: false,
      error: "That name is already in use",
      fieldErrors: [{ field: "name", message: "That name is already in use" }],
    });
    render(
      <CatalogTable
        catalog="printType"
        label="Print types"
        hasHex={false}
        rows={nameRows}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit print type" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "dup" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /already in use/i,
    );
  });
});

describe("CatalogTable — delete-guard (R6)", () => {
  it("submits the id to deleteCatalog", async () => {
    deleteMock.mockResolvedValue({ ok: true });
    render(
      <CatalogTable
        catalog="taskCategory"
        label="Task categories"
        hasHex={false}
        rows={[{ id: "t1", name: "Purchases" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    const submitted = deleteMock.mock.calls[0][1] as FormData;
    expect(submitted.get("catalog")).toBe("taskCategory");
    expect(submitted.get("id")).toBe("t1");
  });

  it("renders the in-use block message returned by the action (R6)", async () => {
    deleteMock.mockResolvedValue({
      ok: false,
      error: "This value is in use and cannot be deleted",
    });
    render(
      <CatalogTable
        catalog="taskCategory"
        label="Task categories"
        hasHex={false}
        rows={[{ id: "t1", name: "Purchases" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/in use/i);
  });
});

describe("CatalogTable — empty state", () => {
  it("shows an empty message when there are no rows", () => {
    render(
      <CatalogTable
        catalog="supplyType"
        label="Supply types"
        hasHex={false}
        rows={[]}
      />,
    );
    expect(screen.getByText("No values yet.")).toBeInTheDocument();
  });
});
