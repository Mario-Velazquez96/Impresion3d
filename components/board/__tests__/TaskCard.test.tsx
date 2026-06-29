import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// TaskCard -> TaskFormDialog/SubtaskList -> @/actions/tasks ("use server").
vi.mock("@/actions/tasks", () => ({
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  addSubtaskAction: vi.fn(),
  toggleSubtaskAction: vi.fn(),
  removeSubtaskAction: vi.fn(),
}));

import { TaskCard, type TaskCardView } from "@/components/board/TaskCard";

const categories = [{ id: "c1", name: "Purchases" }];
const users = [{ id: "u1", name: "Ada" }];

function makeTask(partial: Partial<TaskCardView> = {}): TaskCardView {
  return {
    id: "t1",
    title: "Order spool",
    description: null,
    categoryId: "c1",
    state: "TODO",
    priority: "MEDIUM",
    assigneeId: null,
    dueDate: null,
    position: 0,
    subtasks: [],
    ...partial,
  };
}

// The badges live in the card's badge row (a div with flex-wrap). Restrict text
// queries to that row so they don't collide with the embedded edit dialog's
// <option> labels.
function badgeRow(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Order spool" });
  // The card root is the nearest bordered card container; the badge row is its
  // flex-wrap div. (04 changed the card root from <li> to <div> so a sortable
  // wrapper can own the list-item semantics.)
  const card = heading.closest("div.rounded-md")!;
  return card.querySelector<HTMLElement>("div.flex-wrap")!;
}

describe("TaskCard", () => {
  it("renders the title and the category badge", () => {
    render(
      <TaskCard task={makeTask()} categories={categories} users={users} />,
    );
    expect(
      screen.getByRole("heading", { name: "Order spool" }),
    ).toBeInTheDocument();
    expect(badgeRow().textContent).toContain("Purchases");
  });

  it("renders an assignee badge, a due-date badge, and subtask progress", () => {
    render(
      <TaskCard
        task={makeTask({
          description: "Need 1kg PLA",
          assigneeId: "u1",
          dueDate: "2026-07-01T00:00:00.000Z",
          subtasks: [
            { id: "s1", title: "a", done: true },
            { id: "s2", title: "b", done: false },
          ],
        })}
        categories={categories}
        users={users}
      />,
    );
    // Description renders in a <p> on the card (the dialog textarea also holds it
    // as a default value, so scope to the paragraph).
    expect(
      screen.getByText("Need 1kg PLA", { selector: "p" }),
    ).toBeInTheDocument();
    const row = badgeRow();
    expect(row.textContent).toContain("Ada");
    expect(row.textContent).toMatch(/Due /);
    expect(row.textContent).toContain("1/2 done");
  });

  it.each([
    ["HIGH", "High", "text-destructive"],
    ["MEDIUM", "Medium", "text-amber-400"],
    ["LOW", "Low", "text-muted-foreground"],
  ])(
    "renders the %s priority badge with label %s and its tone (08 — R4)",
    (priority, label, toneClass) => {
      render(
        <TaskCard
          task={makeTask({ priority })}
          categories={categories}
          users={users}
        />,
      );
      const row = badgeRow();
      const badge = within(row).getByText(label);
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain(toneClass);
    },
  );

  it("falls back to 'Uncategorized' when the category is unknown", () => {
    render(
      <TaskCard
        task={makeTask({ categoryId: "missing" })}
        categories={categories}
        users={users}
      />,
    );
    expect(badgeRow().textContent).toContain("Uncategorized");
  });

  it("omits assignee/due/progress badges when absent", () => {
    render(
      <TaskCard task={makeTask()} categories={categories} users={users} />,
    );
    const row = badgeRow();
    expect(row.textContent).not.toMatch(/Due /);
    expect(row.textContent).not.toContain("done");
  });
});
