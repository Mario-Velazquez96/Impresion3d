import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const toggleMock = vi.fn();
const addMock = vi.fn();
const removeMock = vi.fn();
vi.mock("@/actions/tasks", () => ({
  toggleSubtaskAction: (...a: unknown[]) => toggleMock(...a),
  addSubtaskAction: (...a: unknown[]) => addMock(...a),
  removeSubtaskAction: (...a: unknown[]) => removeMock(...a),
}));

import { SubtaskList } from "@/components/board/SubtaskList";

const subtasks = [
  { id: "s1", title: "Step one", done: false },
  { id: "s2", title: "Step two", done: true },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SubtaskList — toggle (R6)", () => {
  it("calls toggleSubtaskAction with the subtask id and the new done value", async () => {
    toggleMock.mockResolvedValue({ ok: true });
    render(<SubtaskList taskId="t1" subtasks={subtasks} />);

    // s1 is currently unchecked; checking it should send done=true.
    fireEvent.click(screen.getByLabelText("Step one"));

    await waitFor(() => expect(toggleMock).toHaveBeenCalledTimes(1));
    const submitted = toggleMock.mock.calls[0][1] as FormData;
    expect(submitted.get("subtaskId")).toBe("s1");
    expect(submitted.get("done")).toBe("true");
  });

  it("sends done=false when un-checking an already-done subtask", async () => {
    toggleMock.mockResolvedValue({ ok: true });
    render(<SubtaskList taskId="t1" subtasks={subtasks} />);

    fireEvent.click(screen.getByLabelText("Step two"));

    await waitFor(() => expect(toggleMock).toHaveBeenCalledTimes(1));
    const submitted = toggleMock.mock.calls[0][1] as FormData;
    expect(submitted.get("subtaskId")).toBe("s2");
    expect(submitted.get("done")).toBe("false");
  });

  it("surfaces an action error", async () => {
    toggleMock.mockResolvedValue({
      ok: false,
      error: "Failed to update subtask",
    });
    render(<SubtaskList taskId="t1" subtasks={subtasks} />);
    fireEvent.click(screen.getByLabelText("Step one"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/failed/i);
  });
});

describe("SubtaskList — add (R6)", () => {
  it("submits the new title and the parent taskId to addSubtaskAction", async () => {
    addMock.mockResolvedValue({ ok: true });
    render(<SubtaskList taskId="t1" subtasks={[]} />);

    fireEvent.change(screen.getByLabelText("New subtask title"), {
      target: { value: "Brand new step" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(addMock).toHaveBeenCalledTimes(1));
    const submitted = addMock.mock.calls[0][1] as FormData;
    expect(submitted.get("taskId")).toBe("t1");
    expect(submitted.get("title")).toBe("Brand new step");
  });
});

describe("SubtaskList — remove", () => {
  it("submits the subtask id to removeSubtaskAction", async () => {
    removeMock.mockResolvedValue({ ok: true });
    render(<SubtaskList taskId="t1" subtasks={subtasks} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove subtask Step one" }),
    );

    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    const submitted = removeMock.mock.calls[0][1] as FormData;
    expect(submitted.get("subtaskId")).toBe("s1");
  });
});
