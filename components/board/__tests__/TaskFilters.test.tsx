import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const pushMock = vi.fn();
let currentParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/board",
  useSearchParams: () => currentParams,
}));

import { TaskFilters } from "@/components/board/TaskFilters";

const categories = [{ id: "c1", name: "Purchases" }];
const users = [{ id: "u1", name: "Ada" }];

beforeEach(() => {
  vi.clearAllMocks();
  currentParams = new URLSearchParams("");
});

describe("TaskFilters (R7 — URL params)", () => {
  it("pushes ?owner=<id> when an owner is selected", () => {
    render(<TaskFilters categories={categories} users={users} />);
    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: "u1" },
    });
    expect(pushMock).toHaveBeenCalledWith("/board?owner=u1");
  });

  it("pushes ?category=<id> when a category is selected", () => {
    render(<TaskFilters categories={categories} users={users} />);
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "c1" },
    });
    expect(pushMock).toHaveBeenCalledWith("/board?category=c1");
  });

  it("pushes ?state=<STATE> when a state is selected", () => {
    render(<TaskFilters categories={categories} users={users} />);
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "BLOCKER" },
    });
    expect(pushMock).toHaveBeenCalledWith("/board?state=BLOCKER");
  });

  it("merges a new filter with existing params", () => {
    currentParams = new URLSearchParams("owner=u1");
    render(<TaskFilters categories={categories} users={users} />);
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "DONE" },
    });
    const arg = pushMock.mock.calls[0][0] as string;
    expect(arg).toContain("owner=u1");
    expect(arg).toContain("state=DONE");
  });

  it("removes a param when its select returns to 'All' (empty value)", () => {
    currentParams = new URLSearchParams("category=c1");
    render(<TaskFilters categories={categories} users={users} />);
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "" },
    });
    expect(pushMock).toHaveBeenCalledWith("/board");
  });

  it("supports the 'Unassigned' owner value (none)", () => {
    render(<TaskFilters categories={categories} users={users} />);
    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: "none" },
    });
    expect(pushMock).toHaveBeenCalledWith("/board?owner=none");
  });

  it("clears all filters via the Clear button", () => {
    currentParams = new URLSearchParams("owner=u1&state=DONE");
    render(<TaskFilters categories={categories} users={users} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(pushMock).toHaveBeenCalledWith("/board");
  });
});
