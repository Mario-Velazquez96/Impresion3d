import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

/**
 * PrintFormDialog component tests (R5, R6, R10). The server actions are mocked so we
 * exercise the Client island in isolation: the multipart form posts the fields, the
 * photo File, and the repeated `colorIds` entries; a returned field error renders
 * inline; and the zero-color guard holds at the form/schema boundary.
 */

const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/actions/prints", () => ({
  createPrintAction: (...a: unknown[]) => createMock(...a),
  updatePrintAction: (...a: unknown[]) => updateMock(...a),
}));

import { PrintFormDialog } from "@/components/inventory/PrintFormDialog";

const printTypes = [
  { id: "pt1", name: "Mini" },
  { id: "pt2", name: "Terrain" },
];
const colors = [
  { id: "c1", name: "Red", hex: "#ff0000" },
  { id: "c2", name: "Blue", hex: "#0000ff" },
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

describe("PrintFormDialog — create (R5, R10, R11)", () => {
  it("submits fields, the photo file, and the selected colors to createPrintAction", async () => {
    createMock.mockResolvedValue({ ok: true });
    render(
      <PrintFormDialog mode="create" printTypes={printTypes} colors={colors} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New print" }));
    const dialog = screen.getByRole("dialog", { name: "New print" });

    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Dragon" },
    });
    fireEvent.change(within(dialog).getByLabelText("Print time (min)"), {
      target: { value: "120" },
    });
    fireEvent.change(within(dialog).getByLabelText("Filament (g)"), {
      target: { value: "45" },
    });
    fireEvent.change(within(dialog).getByLabelText("Print type"), {
      target: { value: "pt1" },
    });

    // Select two colors from the ColorMultiSelect (each posts a `colorIds` entry).
    fireEvent.click(within(dialog).getByLabelText("Red"));
    fireEvent.click(within(dialog).getByLabelText("Blue"));

    // Attach a photo file to the file input. (jsdom records the File on the input
    // element itself; React's form-action FormData serialization of file inputs is
    // not reliable in jsdom, so we assert on the input's FileList directly.)
    const file = new File(["x"], "dragon.png", { type: "image/png" });
    const photoInput = within(dialog).getByLabelText(
      /Photo/,
    ) as HTMLInputElement;
    fireEvent.change(photoInput, { target: { files: [file] } });
    expect(photoInput.name).toBe("photo");
    expect(photoInput.files?.[0]?.name).toBe("dragon.png");
    expect(photoInput.files?.[0]?.type).toBe("image/png");

    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("Dragon");
    expect(submitted.get("printTimeMinutes")).toBe("120");
    expect(submitted.get("filamentGrams")).toBe("45");
    expect(submitted.get("printTypeId")).toBe("pt1");
    // Repeated colorIds entries are collected by the action via getAll.
    expect(submitted.getAll("colorIds")).toEqual(["c1", "c2"]);
    // The file input is wired with accept restricted to the allowed mime types.
    expect(photoInput.accept).toBe("image/png,image/jpeg,image/webp");
  });

  it("renders a field error returned by the action (R10 — bad photo)", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "Photo must be a PNG, JPEG, or WebP image",
      fieldErrors: [
        {
          field: "photo",
          message: "Photo must be a PNG, JPEG, or WebP image",
        },
      ],
    });
    render(
      <PrintFormDialog mode="create" printTypes={printTypes} colors={colors} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New print" }));
    const dialog = screen.getByRole("dialog", { name: "New print" });

    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Dragon" },
    });
    fireEvent.change(within(dialog).getByLabelText("Print time (min)"), {
      target: { value: "10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Filament (g)"), {
      target: { value: "5" },
    });
    fireEvent.change(within(dialog).getByLabelText("Print type"), {
      target: { value: "pt1" },
    });
    fireEvent.click(within(dialog).getByLabelText("Red"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /PNG, JPEG, or WebP/i,
    );
  });

  it("blocks a zero-color submission at the form/schema boundary (R10)", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "Select at least one color",
      fieldErrors: [
        { field: "colorIds", message: "Select at least one color" },
      ],
    });
    render(
      <PrintFormDialog mode="create" printTypes={printTypes} colors={colors} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New print" }));
    const dialog = screen.getByRole("dialog", { name: "New print" });

    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Dragon" },
    });
    fireEvent.change(within(dialog).getByLabelText("Print time (min)"), {
      target: { value: "10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Filament (g)"), {
      target: { value: "5" },
    });
    fireEvent.change(within(dialog).getByLabelText("Print type"), {
      target: { value: "pt1" },
    });
    // No color checkbox is selected.
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    // No colorIds posted — the schema's min(1) rejects it; the returned error renders.
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.getAll("colorIds")).toEqual([]);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /at least one color/i,
    );
  });
});

describe("PrintFormDialog — edit (R6)", () => {
  const print = {
    id: "p1",
    name: "Dragon",
    printTimeMinutes: 120,
    filamentGrams: 45,
    documentUrl: "https://example.com/doc",
    printTypeId: "pt2",
    colorIds: ["c1"],
  };

  it("prefills fields + the existing color set and submits the id + a swapped color", async () => {
    updateMock.mockResolvedValue({ ok: true });
    render(
      <PrintFormDialog
        mode="edit"
        printTypes={printTypes}
        colors={colors}
        print={print}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit print" });

    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Dragon");
    // The existing color (Red/c1) is pre-checked.
    expect(
      (within(dialog).getByLabelText("Red") as HTMLInputElement).checked,
    ).toBe(true);

    // Swap the color set: uncheck Red, check Blue.
    fireEvent.click(within(dialog).getByLabelText("Red"));
    fireEvent.click(within(dialog).getByLabelText("Blue"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const submitted = updateMock.mock.calls[0][1] as FormData;
    expect(submitted.get("id")).toBe("p1");
    expect(submitted.get("printTypeId")).toBe("pt2");
    expect(submitted.getAll("colorIds")).toEqual(["c2"]);
  });
});
