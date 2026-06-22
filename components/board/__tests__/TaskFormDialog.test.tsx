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
vi.mock("@/actions/tasks", () => ({
  createTaskAction: (...a: unknown[]) => createMock(...a),
  updateTaskAction: (...a: unknown[]) => updateMock(...a),
}));

import { TaskFormDialog } from "@/components/board/TaskFormDialog";

const categories = [
  { id: "c1", name: "Purchases" },
  { id: "c2", name: "Repairs" },
];
const users = [
  { id: "u1", name: "Ada" },
  { id: "u2", name: "Linus" },
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

describe("TaskFormDialog — create (R4)", () => {
  it("submits title, category, and the chosen column/state to createTaskAction", async () => {
    createMock.mockResolvedValue({ ok: true });
    render(
      <TaskFormDialog mode="create" categories={categories} users={users} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    const dialog = screen.getByRole("dialog", { name: "New task" });

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Buy filament" },
    });
    fireEvent.change(within(dialog).getByLabelText("Category"), {
      target: { value: "c1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Column (state)"), {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const submitted = createMock.mock.calls[0][1] as FormData;
    expect(submitted.get("title")).toBe("Buy filament");
    expect(submitted.get("categoryId")).toBe("c1");
    expect(submitted.get("state")).toBe("IN_PROGRESS");
  });

  it("renders all six state options in the column select (R8)", () => {
    render(
      <TaskFormDialog mode="create" categories={categories} users={users} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    const select = screen.getByLabelText("Column (state)") as HTMLSelectElement;
    expect(select.options).toHaveLength(6);
  });

  it("shows a field error returned by the action (R10 bad category)", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "Category or assignee no longer exists",
      fieldErrors: [
        {
          field: "categoryId",
          message: "Category or assignee no longer exists",
        },
      ],
    });
    render(
      <TaskFormDialog mode="create" categories={categories} users={users} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    const dialog = screen.getByRole("dialog", { name: "New task" });
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "X" },
    });
    fireEvent.change(within(dialog).getByLabelText("Category"), {
      target: { value: "c1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /no longer exists/i,
    );
  });
});

describe("TaskFormDialog — edit (R5)", () => {
  const task = {
    id: "t1",
    title: "Old title",
    description: "desc",
    categoryId: "c1",
    state: "TODO",
    assigneeId: "u1",
    dueDate: "2026-07-01T00:00:00.000Z",
  };

  it("prefills fields and submits the id + new state to updateTaskAction", async () => {
    updateMock.mockResolvedValue({ ok: true });
    render(
      <TaskFormDialog
        mode="edit"
        categories={categories}
        users={users}
        task={task}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit task" });

    expect(
      (within(dialog).getByLabelText("Title") as HTMLInputElement).value,
    ).toBe("Old title");
    // Move the card to another column via the state field (R5/R8).
    fireEvent.change(within(dialog).getByLabelText("Column (state)"), {
      target: { value: "DONE" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const submitted = updateMock.mock.calls[0][1] as FormData;
    expect(submitted.get("id")).toBe("t1");
    expect(submitted.get("state")).toBe("DONE");
  });
});
