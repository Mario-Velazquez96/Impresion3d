import { describe, expect, it } from "vitest";

import {
  PRIORITIES,
  TASK_STATES,
  createTaskSchema,
  prioritySchema,
  subtaskSchema,
  taskFiltersSchema,
  taskStateSchema,
  toggleSchema,
  updateTaskSchema,
} from "@/lib/validation/task";

describe("taskStateSchema (R1, R8)", () => {
  it("accepts every one of the six states", () => {
    for (const s of TASK_STATES) {
      expect(taskStateSchema.safeParse(s).success).toBe(true);
    }
  });

  it("exposes the six states in fixed render order", () => {
    expect(TASK_STATES).toEqual([
      "BACKLOG",
      "TODO",
      "IN_PROGRESS",
      "PENDING",
      "BLOCKER",
      "DONE",
    ]);
  });

  it("rejects an unknown state", () => {
    expect(taskStateSchema.safeParse("ARCHIVED").success).toBe(false);
  });
});

describe("createTaskSchema (R4, R10)", () => {
  it("accepts a minimal valid task and trims the title", () => {
    const parsed = createTaskSchema.safeParse({
      title: "  Print spool  ",
      categoryId: "cat1",
      state: "TODO",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("Print spool");
      expect(parsed.data.description).toBeUndefined();
      expect(parsed.data.assigneeId).toBeUndefined();
      expect(parsed.data.dueDate).toBeUndefined();
      // priority defaults to MEDIUM when absent (R2).
      expect(parsed.data.priority).toBe("MEDIUM");
    }
  });

  it("rejects an empty/whitespace title", () => {
    const parsed = createTaskSchema.safeParse({
      title: "   ",
      categoryId: "cat1",
      state: "TODO",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Title is required");
    }
  });

  it("rejects a missing categoryId (R10 — bad category)", () => {
    const parsed = createTaskSchema.safeParse({
      title: "X",
      categoryId: "",
      state: "TODO",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === "categoryId")).toBe(
        true,
      );
    }
  });

  it("rejects an invalid state value (R10 — bad enum)", () => {
    const parsed = createTaskSchema.safeParse({
      title: "X",
      categoryId: "cat1",
      state: "NOPE",
    });
    expect(parsed.success).toBe(false);
  });

  it("normalizes assigneeId 'none' and '' to undefined (unassigned)", () => {
    for (const value of ["none", ""]) {
      const parsed = createTaskSchema.safeParse({
        title: "X",
        categoryId: "cat1",
        state: "TODO",
        assigneeId: value,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.assigneeId).toBeUndefined();
    }
  });

  it("keeps a real assigneeId", () => {
    const parsed = createTaskSchema.safeParse({
      title: "X",
      categoryId: "cat1",
      state: "TODO",
      assigneeId: "user-9",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.assigneeId).toBe("user-9");
  });

  it("parses a yyyy-mm-dd dueDate into a Date", () => {
    const parsed = createTaskSchema.safeParse({
      title: "X",
      categoryId: "cat1",
      state: "TODO",
      dueDate: "2026-07-01",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dueDate).toBeInstanceOf(Date);
      expect(parsed.data.dueDate?.getUTCFullYear()).toBe(2026);
    }
  });

  it("treats an empty dueDate as undefined", () => {
    const parsed = createTaskSchema.safeParse({
      title: "X",
      categoryId: "cat1",
      state: "TODO",
      dueDate: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.dueDate).toBeUndefined();
  });

  it("rejects an unparseable dueDate", () => {
    const parsed = createTaskSchema.safeParse({
      title: "X",
      categoryId: "cat1",
      state: "TODO",
      dueDate: "not-a-date",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("prioritySchema (08 — R1, R6)", () => {
  it("exposes LOW/MEDIUM/HIGH in render order", () => {
    expect(PRIORITIES).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });

  it("accepts every member", () => {
    for (const p of PRIORITIES) {
      expect(prioritySchema.safeParse(p).success).toBe(true);
    }
  });

  it("rejects an unknown priority", () => {
    expect(prioritySchema.safeParse("URGENT").success).toBe(false);
  });
});

describe("createTaskSchema priority (08 — R2, R6)", () => {
  it("accepts each valid priority and keeps it", () => {
    for (const p of PRIORITIES) {
      const parsed = createTaskSchema.safeParse({
        title: "X",
        categoryId: "cat1",
        state: "TODO",
        priority: p,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.priority).toBe(p);
    }
  });

  it("defaults an absent / empty priority to MEDIUM (R2)", () => {
    for (const priority of [undefined, ""]) {
      const parsed = createTaskSchema.safeParse({
        title: "X",
        categoryId: "cat1",
        state: "TODO",
        priority,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.priority).toBe("MEDIUM");
    }
  });

  it("rejects an invalid priority value (R6)", () => {
    const parsed = createTaskSchema.safeParse({
      title: "X",
      categoryId: "cat1",
      state: "TODO",
      priority: "URGENT",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === "priority")).toBe(
        true,
      );
    }
  });
});

describe("updateTaskSchema (R5)", () => {
  it("requires an id on top of the create shape", () => {
    const base = { title: "X", categoryId: "cat1", state: "DONE" as const };
    expect(updateTaskSchema.safeParse(base).success).toBe(false);
    expect(updateTaskSchema.safeParse({ ...base, id: "t1" }).success).toBe(
      true,
    );
  });
});

describe("subtaskSchema (R6)", () => {
  it("accepts a taskId + non-empty title", () => {
    expect(
      subtaskSchema.safeParse({ taskId: "t1", title: "Buy filament" }).success,
    ).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(subtaskSchema.safeParse({ taskId: "t1", title: " " }).success).toBe(
      false,
    );
  });

  it("rejects a missing taskId", () => {
    expect(subtaskSchema.safeParse({ taskId: "", title: "x" }).success).toBe(
      false,
    );
  });
});

describe("toggleSchema (R6)", () => {
  it("accepts a subtaskId + boolean done", () => {
    expect(
      toggleSchema.safeParse({ subtaskId: "s1", done: true }).success,
    ).toBe(true);
  });

  it("rejects a non-boolean done", () => {
    expect(
      toggleSchema.safeParse({ subtaskId: "s1", done: "yes" }).success,
    ).toBe(false);
  });
});

describe("taskFiltersSchema (R7)", () => {
  it("normalizes all-empty params to an empty filter (no constraints)", () => {
    const parsed = taskFiltersSchema.parse({
      assigneeId: "",
      categoryId: "",
      state: "",
    });
    expect(parsed.assigneeId).toBeUndefined();
    expect(parsed.categoryId).toBeUndefined();
    expect(parsed.state).toBeUndefined();
  });

  it("maps owner 'none' to undefined assignee filter", () => {
    const parsed = taskFiltersSchema.parse({ assigneeId: "none" });
    expect(parsed.assigneeId).toBeUndefined();
  });

  it("keeps concrete filter values", () => {
    const parsed = taskFiltersSchema.parse({
      assigneeId: "u1",
      categoryId: "c1",
      state: "BLOCKER",
    });
    expect(parsed).toEqual({
      assigneeId: "u1",
      categoryId: "c1",
      state: "BLOCKER",
    });
  });

  it("rejects an unknown state filter", () => {
    expect(taskFiltersSchema.safeParse({ state: "GONE" }).success).toBe(false);
  });

  it("normalizes an empty priority param to undefined (08 — R5)", () => {
    expect(taskFiltersSchema.parse({ priority: "" }).priority).toBeUndefined();
  });

  it("keeps a concrete priority filter (08 — R5)", () => {
    expect(taskFiltersSchema.parse({ priority: "HIGH" }).priority).toBe("HIGH");
  });

  it("rejects an unknown priority filter (08 — R5)", () => {
    expect(taskFiltersSchema.safeParse({ priority: "URGENT" }).success).toBe(
      false,
    );
  });
});
