import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// KanbanBoard -> SortableTaskCard/TaskCard -> TaskFormDialog/SubtaskList ->
// @/actions/tasks ("use server", transitively server-only). Stub the actions so
// the client tree renders; reorderTaskAction is the one under test.
const reorderTaskActionMock = vi.fn();
vi.mock("@/actions/tasks", () => ({
  reorderTaskAction: (...a: unknown[]) => reorderTaskActionMock(...a),
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  addSubtaskAction: vi.fn(),
  toggleSubtaskAction: vi.fn(),
  removeSubtaskAction: vi.fn(),
}));

import {
  KanbanBoard,
  applyMove,
  commitDrop,
  resolveDrop,
} from "@/components/board/KanbanBoard";
import { TaskCard, type TaskCardView } from "@/components/board/TaskCard";
import { ToastProvider } from "@/components/ui/toast";

const categories = [{ id: "c1", name: "Purchases" }];
const users = [{ id: "u1", name: "Ada" }];

function card(partial: Partial<TaskCardView> & { id: string }): TaskCardView {
  return {
    title: partial.id,
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

function grouped(map: Record<string, string[]>) {
  const states = [
    "BACKLOG",
    "TODO",
    "IN_PROGRESS",
    "PENDING",
    "BLOCKER",
    "DONE",
  ] as const;
  const out: Record<string, TaskCardView[]> = {};
  for (const s of states) {
    out[s] = (map[s] ?? []).map((id, i) =>
      card({ id, title: id, state: s, position: i }),
    );
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Pure helpers ----------------------------------------------------------

describe("resolveDrop (drop target resolution)", () => {
  it("dropping onto a card targets that card's column + index", () => {
    const g = grouped({ TODO: ["a", "b", "c"], DONE: [] });
    // move 'a' over 'c' -> dest TODO, index of c after removing a = 1.
    expect(resolveDrop(g, "a", "c")).toEqual({ toState: "TODO", toIndex: 1 });
  });

  it("dropping onto an empty column droppable appends at the end", () => {
    const g = grouped({ TODO: ["a", "b"], DONE: [] });
    expect(resolveDrop(g, "a", "DONE")).toEqual({ toState: "DONE", toIndex: 0 });
  });

  it("dropping onto a non-empty column droppable appends after the others", () => {
    const g = grouped({ TODO: ["a"], DONE: ["d1", "d2"] });
    expect(resolveDrop(g, "a", "DONE")).toEqual({ toState: "DONE", toIndex: 2 });
  });

  it("returns null when the active task is unknown", () => {
    const g = grouped({ TODO: ["a"] });
    expect(resolveDrop(g, "ghost", "a")).toBeNull();
  });
});

describe("applyMove (optimistic splice)", () => {
  it("moves a card across columns and updates its state", () => {
    const g = grouped({ TODO: ["a", "b"], DONE: [] });
    const next = applyMove(g, "a", "DONE", 0);
    expect(next.TODO.map((t) => t.id)).toEqual(["b"]);
    expect(next.DONE.map((t) => t.id)).toEqual(["a"]);
    expect(next.DONE[0].state).toBe("DONE");
  });

  it("reorders within a column", () => {
    const g = grouped({ TODO: ["a", "b", "c"] });
    const next = applyMove(g, "a", "TODO", 2);
    expect(next.TODO.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("clamps an out-of-range index", () => {
    const g = grouped({ TODO: ["a", "b"] });
    const next = applyMove(g, "a", "TODO", 99);
    expect(next.TODO.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

// --- Card drag affordance (R6 handle) --------------------------------------

describe("TaskCard drag handle (R6)", () => {
  it("renders a keyboard-focusable drag handle when drag props are provided", () => {
    render(
      <TaskCard
        task={card({ id: "a", title: "Alpha" })}
        categories={categories}
        users={users}
        drag={{ attributes: {}, listeners: {} }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Drag Alpha" }),
    ).toBeInTheDocument();
  });

  it("omits the handle when not draggable (DragOverlay / static use)", () => {
    render(
      <TaskCard
        task={card({ id: "a", title: "Alpha" })}
        categories={categories}
        users={users}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Drag Alpha" }),
    ).not.toBeInTheDocument();
  });
});

// --- Board rendering + accessibility (R6, R7 scaffolding) -------------------

function renderBoard(initial: TaskCardView[]) {
  return render(
    <ToastProvider>
      <KanbanBoard initial={initial} categories={categories} users={users} />
    </ToastProvider>,
  );
}

describe("KanbanBoard rendering (R6, R7)", () => {
  it("renders all six columns with the seeded cards in their state", () => {
    renderBoard([
      card({ id: "a", title: "Alpha", state: "TODO" }),
      card({ id: "z", title: "Zeta", state: "DONE" }),
    ]);
    const todo = screen
      .getByRole("heading", { name: /To do/ })
      .closest("section")!;
    const done = screen.getByRole("heading", { name: /Done/ }).closest("section")!;
    expect(within(todo).getByText("Alpha")).toBeInTheDocument();
    expect(within(done).getByText("Zeta")).toBeInTheDocument();
  });

  it("renders a focusable drag handle per card (R6)", () => {
    renderBoard([card({ id: "a", title: "Alpha", state: "TODO" })]);
    expect(
      screen.getByRole("button", { name: "Drag Alpha" }),
    ).toBeInTheDocument();
  });

  it("exposes ARIA live regions for drag announcements (R6)", () => {
    renderBoard([card({ id: "a", title: "Alpha", state: "TODO" })]);
    // dnd-kit renders aria-live status regions for screen-reader announcements.
    const liveRegions = document.querySelectorAll("[aria-live]");
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  it("reconciles to fresh server props after revalidation (signature re-sync)", () => {
    const { rerender } = render(
      <ToastProvider>
        <KanbanBoard
          initial={[card({ id: "a", title: "Alpha", state: "TODO" })]}
          categories={categories}
          users={users}
        />
      </ToastProvider>,
    );
    expect(
      screen
        .getByRole("heading", { name: /To do/ })
        .closest("section")!
        .textContent,
    ).toContain("Alpha");

    // Server truth now places the card in DONE (e.g. after a successful reorder
    // + revalidate). The board re-syncs from the new props.
    rerender(
      <ToastProvider>
        <KanbanBoard
          initial={[
            card({ id: "a", title: "Alpha", state: "DONE", position: 0 }),
          ]}
          categories={categories}
          users={users}
        />
      </ToastProvider>,
    );
    const done = screen.getByRole("heading", { name: /Done/ }).closest("section")!;
    expect(done.textContent).toContain("Alpha");
  });
});

// --- commitDrop: optimistic + action + rollback + toast (R1, R2, R4) --------
//
// jsdom can't run dnd-kit's pointer/keyboard layout pipeline (getBoundingClient-
// Rect is all zeroes), so the drop-commit pipeline is unit-tested directly via
// the extracted commitDrop. The DndContext handler is a thin wrapper over it.

describe("commitDrop (R1, R2, R4)", () => {
  it("optimistically splices state and calls the action on a real move (R1, R2)", async () => {
    const g = grouped({ TODO: ["a", "b"], DONE: [] });
    const setGrouped = vi.fn();
    const toast = vi.fn();
    const action = vi.fn().mockResolvedValue({ ok: true });

    const result = await commitDrop({
      grouped: g,
      activeId: "a",
      overId: "DONE",
      setGrouped,
      action,
      toast,
    });

    // Optimistic update applied first.
    expect(setGrouped).toHaveBeenCalledTimes(1);
    const optimistic = setGrouped.mock.calls[0][0];
    expect(optimistic.DONE.map((t: TaskCardView) => t.id)).toEqual(["a"]);
    // Action called with the resolved target.
    expect(action).toHaveBeenCalledWith({
      taskId: "a",
      toState: "DONE",
      toIndex: 0,
    });
    expect(toast).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("rolls back to the pre-drag snapshot and toasts when the action rejects (R4)", async () => {
    const g = grouped({ TODO: ["a", "b"], DONE: [] });
    const setGrouped = vi.fn();
    const toast = vi.fn();
    const action = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Failed to reorder task" });

    await commitDrop({
      grouped: g,
      activeId: "a",
      overId: "DONE",
      setGrouped,
      action,
      toast,
    });

    // Two setGrouped calls: optimistic, then rollback to the original snapshot.
    expect(setGrouped).toHaveBeenCalledTimes(2);
    expect(setGrouped.mock.calls[1][0]).toBe(g);
    expect(toast).toHaveBeenCalledWith("Failed to reorder task");
  });

  it("is a no-op (no action, no state change) when dropped in the same slot", async () => {
    const g = grouped({ TODO: ["a", "b"] });
    const setGrouped = vi.fn();
    const toast = vi.fn();
    const action = vi.fn().mockResolvedValue({ ok: true });

    // Drop 'a' over 'b' (its immediate neighbour): with 'a' removed, 'b' sits at
    // index 0, which equals 'a's original index 0 — a same-slot no-op.
    const result = await commitDrop({
      grouped: g,
      activeId: "a",
      overId: "b",
      setGrouped,
      action,
      toast,
    });

    expect(result).toBeNull();
    expect(setGrouped).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  it("is a no-op when there is no drop target", async () => {
    const g = grouped({ TODO: ["a"] });
    const setGrouped = vi.fn();
    const action = vi.fn();
    const result = await commitDrop({
      grouped: g,
      activeId: "a",
      overId: null,
      setGrouped,
      action,
      toast: vi.fn(),
    });
    expect(result).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
});
