import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    subtask: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

// The tasks service registers a TaskCategory reference counter at import time;
// capture that registration to assert it wires up correctly. Hoisted so it is
// initialized before the (hoisted) module-mock factory and the service import.
const { registerCatalogReferenceMock } = vi.hoisted(() => ({
  registerCatalogReferenceMock: vi.fn(),
}));
vi.mock("@/lib/services/catalogs", () => ({
  registerCatalogReference: (...a: unknown[]) =>
    registerCatalogReferenceMock(...a),
}));

import {
  addSubtask,
  buildTaskWhere,
  createTask,
  deleteTask,
  listTasks,
  removeSubtask,
  toggleSubtask,
  updateTask,
} from "@/lib/services/tasks";

// Capture the import-time registration BEFORE any beforeEach clears the mock.
const registrationCall = registerCatalogReferenceMock.mock.calls[0];
const registeredCounter = registrationCall?.[1] as
  | ((id: string) => Promise<number>)
  | undefined;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerCatalogReference wiring (02 delete-guard)", () => {
  it("registers a taskCategory counter at import time", () => {
    expect(registrationCall?.[0]).toBe("taskCategory");
    expect(typeof registeredCounter).toBe("function");
  });

  it("the registered counter counts tasks by categoryId", async () => {
    dbMock.task.count.mockResolvedValue(2);
    const result = await registeredCounter!("cat-1");
    expect(dbMock.task.count).toHaveBeenCalledWith({
      where: { categoryId: "cat-1" },
    });
    expect(result).toBe(2);
  });
});

describe("buildTaskWhere (R7 filter composition)", () => {
  it("is empty when no filters are set", () => {
    expect(buildTaskWhere({})).toEqual({});
  });

  it("includes only the assignee when only owner is set", () => {
    expect(buildTaskWhere({ assigneeId: "u1" })).toEqual({ assigneeId: "u1" });
  });

  it("includes only the category when only category is set", () => {
    expect(buildTaskWhere({ categoryId: "c1" })).toEqual({ categoryId: "c1" });
  });

  it("includes only the state when only state is set", () => {
    expect(buildTaskWhere({ state: "BLOCKER" })).toEqual({ state: "BLOCKER" });
  });

  it("composes all three (AND of every active filter)", () => {
    expect(
      buildTaskWhere({ assigneeId: "u1", categoryId: "c1", state: "DONE" }),
    ).toEqual({ assigneeId: "u1", categoryId: "c1", state: "DONE" });
  });

  it("includes only the priority when only priority is set (08 — R5)", () => {
    expect(buildTaskWhere({ priority: "HIGH" })).toEqual({ priority: "HIGH" });
  });

  it("omits priority when absent (08 — R5)", () => {
    expect(buildTaskWhere({ categoryId: "c1" })).not.toHaveProperty("priority");
  });

  it("composes priority (AND) with owner/category/state (08 — R5)", () => {
    expect(
      buildTaskWhere({
        assigneeId: "u1",
        categoryId: "c1",
        state: "DONE",
        priority: "LOW",
      }),
    ).toEqual({
      assigneeId: "u1",
      categoryId: "c1",
      state: "DONE",
      priority: "LOW",
    });
  });
});

describe("listTasks (R7, R8 — single query, ordered, subtasks included)", () => {
  it("queries with the composed where, ordered by position, including subtasks", async () => {
    dbMock.task.findMany.mockResolvedValue([]);
    await listTasks({ categoryId: "c1" });

    expect(dbMock.task.findMany).toHaveBeenCalledTimes(1);
    const args = dbMock.task.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ categoryId: "c1" });
    expect(args.orderBy).toEqual({ position: "asc" });
    expect(args.select.subtasks.orderBy).toEqual({ position: "asc" });
    // priority is selected so the card can render its badge (08 — R4).
    expect(args.select.priority).toBe(true);
  });

  it("composes the priority filter into the where (08 — R5)", async () => {
    dbMock.task.findMany.mockResolvedValue([]);
    await listTasks({ categoryId: "c1", priority: "HIGH" });
    expect(dbMock.task.findMany.mock.calls[0][0].where).toEqual({
      categoryId: "c1",
      priority: "HIGH",
    });
  });

  it("defaults to no filter when called with no args", async () => {
    dbMock.task.findMany.mockResolvedValue([]);
    await listTasks();
    expect(dbMock.task.findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe("createTask (R4 — end-of-column position)", () => {
  it("places the first task in an empty column at position 0", async () => {
    dbMock.task.findFirst.mockResolvedValue(null);
    dbMock.task.create.mockResolvedValue({ id: "t1" });

    await createTask({
      title: "T",
      categoryId: "c1",
      state: "TODO",
      priority: "MEDIUM",
      description: undefined,
      assigneeId: undefined,
      dueDate: undefined,
    });

    expect(dbMock.task.findFirst).toHaveBeenCalledWith({
      where: { state: "TODO" },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    expect(dbMock.task.create.mock.calls[0][0].data.position).toBe(0);
  });

  it("places a new task at (max position in that state) + 1", async () => {
    dbMock.task.findFirst.mockResolvedValue({ position: 4 });
    dbMock.task.create.mockResolvedValue({ id: "t2" });

    await createTask({
      title: "T",
      categoryId: "c1",
      state: "DONE",
      priority: "HIGH",
      description: "d",
      assigneeId: "u1",
      dueDate: new Date("2026-07-01"),
    });

    const data = dbMock.task.create.mock.calls[0][0].data;
    expect(data.position).toBe(5);
    expect(data.assigneeId).toBe("u1");
    expect(data.description).toBe("d");
    expect(data.dueDate).toEqual(new Date("2026-07-01"));
    // priority is persisted as given (08 — R2).
    expect(data.priority).toBe("HIGH");
  });

  it("coerces optional fields to null for Prisma", async () => {
    dbMock.task.findFirst.mockResolvedValue(null);
    dbMock.task.create.mockResolvedValue({ id: "t3" });

    await createTask({
      title: "T",
      categoryId: "c1",
      state: "BACKLOG",
      priority: "MEDIUM",
      description: undefined,
      assigneeId: undefined,
      dueDate: undefined,
    });

    const data = dbMock.task.create.mock.calls[0][0].data;
    expect(data.description).toBeNull();
    expect(data.assigneeId).toBeNull();
    expect(data.dueDate).toBeNull();
  });

  it("propagates a Prisma error (e.g. P2003 bad FK) without writing twice (R10)", async () => {
    dbMock.task.findFirst.mockResolvedValue(null);
    dbMock.task.create.mockRejectedValue({ code: "P2003" });

    await expect(
      createTask({
        title: "T",
        categoryId: "missing",
        state: "TODO",
        priority: "MEDIUM",
        description: undefined,
        assigneeId: undefined,
        dueDate: undefined,
      }),
    ).rejects.toEqual({ code: "P2003" });
  });
});

describe("updateTask (R5 — does not reposition)", () => {
  it("updates fields by id and never touches position", async () => {
    dbMock.task.update.mockResolvedValue({ id: "t1" });

    await updateTask({
      id: "t1",
      title: "New",
      categoryId: "c2",
      state: "PENDING",
      priority: "LOW",
      description: undefined,
      assigneeId: undefined,
      dueDate: undefined,
    });

    const args = dbMock.task.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "t1" });
    expect(args.data.state).toBe("PENDING");
    expect(args.data.priority).toBe("LOW");
    expect(args.data).not.toHaveProperty("position");
  });
});

describe("deleteTask (R2 cascade is at the DB)", () => {
  it("deletes by id", async () => {
    dbMock.task.delete.mockResolvedValue({ id: "t1" });
    await deleteTask("t1");
    expect(dbMock.task.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });
});

describe("addSubtask (R6 — end-of-list position)", () => {
  it("appends the first subtask at position 0", async () => {
    dbMock.subtask.findFirst.mockResolvedValue(null);
    dbMock.subtask.create.mockResolvedValue({ id: "s1" });

    await addSubtask({ taskId: "t1", title: "Step 1" });

    const data = dbMock.subtask.create.mock.calls[0][0].data;
    expect(data.position).toBe(0);
    expect(data.done).toBe(false);
    expect(data.taskId).toBe("t1");
  });

  it("appends at (max position) + 1", async () => {
    dbMock.subtask.findFirst.mockResolvedValue({ position: 2 });
    dbMock.subtask.create.mockResolvedValue({ id: "s2" });

    await addSubtask({ taskId: "t1", title: "Step 2" });

    expect(dbMock.subtask.create.mock.calls[0][0].data.position).toBe(3);
  });
});

describe("toggleSubtask (R6)", () => {
  it("persists the new done value by id", async () => {
    dbMock.subtask.update.mockResolvedValue({ id: "s1", done: true });
    await toggleSubtask({ subtaskId: "s1", done: true });
    expect(dbMock.subtask.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { done: true },
    });
  });

  it("can un-check a subtask", async () => {
    dbMock.subtask.update.mockResolvedValue({ id: "s1", done: false });
    await toggleSubtask({ subtaskId: "s1", done: false });
    expect(dbMock.subtask.update.mock.calls[0][0].data.done).toBe(false);
  });
});

describe("removeSubtask", () => {
  it("deletes a subtask by id", async () => {
    dbMock.subtask.delete.mockResolvedValue({ id: "s1" });
    await removeSubtask("s1");
    expect(dbMock.subtask.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });
});
