import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// BoardColumns -> TaskCard -> TaskFormDialog/SubtaskList -> @/actions/tasks
// ("use server", which transitively imports server-only). Stub the actions so the
// tree renders client-side without crossing the server boundary.
vi.mock("@/actions/tasks", () => ({
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  addSubtaskAction: vi.fn(),
  toggleSubtaskAction: vi.fn(),
  removeSubtaskAction: vi.fn(),
}));

import { BoardColumns } from "@/components/board/BoardColumns";
import type { TaskCardView } from "@/components/board/TaskCard";

const categories = [{ id: "c1", name: "Purchases" }];
const users = [{ id: "u1", name: "Ada" }];

function card(partial: Partial<TaskCardView> & { id: string }): TaskCardView {
  return {
    title: partial.id,
    description: null,
    categoryId: "c1",
    state: "BACKLOG",
    priority: "MEDIUM",
    assigneeId: null,
    dueDate: null,
    position: 0,
    subtasks: [],
    ...partial,
  };
}

describe("BoardColumns (R8 — six fixed-order columns)", () => {
  it("renders all six columns even when there are no tasks", () => {
    render(<BoardColumns tasks={[]} categories={categories} users={users} />);
    for (const label of [
      "Backlog",
      "To do",
      "In progress",
      "Pending",
      "Blocker",
      "Done",
    ]) {
      expect(
        screen.getByRole("heading", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
  });

  it("places each task under its state column", () => {
    const tasks = [
      card({ id: "a", title: "Alpha", state: "BACKLOG" }),
      card({ id: "b", title: "Bravo", state: "DONE" }),
    ];
    render(
      <BoardColumns tasks={tasks} categories={categories} users={users} />,
    );

    const backlog = screen
      .getByRole("heading", { name: /Backlog/ })
      .closest("section")!;
    const done = screen
      .getByRole("heading", { name: /Done/ })
      .closest("section")!;

    expect(backlog).toHaveTextContent("Alpha");
    expect(done).toHaveTextContent("Bravo");
    expect(backlog).not.toHaveTextContent("Bravo");
  });

  it("renders columns in the fixed TaskState order", () => {
    render(<BoardColumns tasks={[]} categories={categories} users={users} />);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Backlog0",
      "To do0",
      "In progress0",
      "Pending0",
      "Blocker0",
      "Done0",
    ]);
  });
});
