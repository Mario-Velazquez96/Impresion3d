import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireUserMock = vi.fn();
vi.mock("@/lib/auth", () => {
  class UnauthenticatedError extends Error {}
  return {
    requireUser: () => requireUserMock(),
    UnauthenticatedError,
  };
});

const createTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const addSubtaskMock = vi.fn();
const toggleSubtaskMock = vi.fn();
const removeSubtaskMock = vi.fn();
vi.mock("@/lib/services/tasks", () => ({
  createTask: (...a: unknown[]) => createTaskMock(...a),
  updateTask: (...a: unknown[]) => updateTaskMock(...a),
  deleteTask: (...a: unknown[]) => deleteTaskMock(...a),
  addSubtask: (...a: unknown[]) => addSubtaskMock(...a),
  toggleSubtask: (...a: unknown[]) => toggleSubtaskMock(...a),
  removeSubtask: (...a: unknown[]) => removeSubtaskMock(...a),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

import {
  addSubtaskAction,
  createTaskAction,
  deleteTaskAction,
  removeSubtaskAction,
  toggleSubtaskAction,
  updateTaskAction,
} from "@/actions/tasks";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTaskAction (R4, R9, R10)", () => {
  it("rejects an unauthenticated caller with NO service call or revalidate (R9)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));

    const result = await createTaskAction(
      null,
      fd({ title: "T", categoryId: "c1", state: "TODO" }),
    );

    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(createTaskMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects an empty title with a field error and no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await createTaskAction(
      null,
      fd({ title: "  ", categoryId: "c1", state: "TODO" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.some((e) => e.field === "title")).toBe(true);
    }
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid state with no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await createTaskAction(
      null,
      fd({ title: "T", categoryId: "c1", state: "NOPE" }),
    );
    expect(result.ok).toBe(false);
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("maps a Prisma P2003 (bad category/assignee FK) to a validation error, no revalidate (R10)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    createTaskMock.mockRejectedValue({ code: "P2003" });

    const result = await createTaskAction(
      null,
      fd({ title: "T", categoryId: "missing", state: "TODO" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no longer exists/i);
      expect(result.fieldErrors?.[0]?.field).toBe("categoryId");
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("creates and revalidates /board on success (R4)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    createTaskMock.mockResolvedValue({ id: "t1" });

    const result = await createTaskAction(
      null,
      fd({
        title: "Print",
        categoryId: "c1",
        state: "TODO",
        assigneeId: "u2",
      }),
    );

    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Print",
        categoryId: "c1",
        state: "TODO",
        assigneeId: "u2",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/board");
    expect(result).toEqual({ ok: true });
  });

  it("passes the chosen priority through to createTask (08 — R2)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    createTaskMock.mockResolvedValue({ id: "t1" });

    await createTaskAction(
      null,
      fd({ title: "T", categoryId: "c1", state: "TODO", priority: "HIGH" }),
    );

    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "HIGH" }),
    );
  });

  it("defaults priority to MEDIUM when the form omits it (08 — R2)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    createTaskMock.mockResolvedValue({ id: "t1" });

    await createTaskAction(
      null,
      fd({ title: "T", categoryId: "c1", state: "TODO" }),
    );

    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "MEDIUM" }),
    );
  });

  it("rejects an invalid priority with no write (08 — R6)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await createTaskAction(
      null,
      fd({ title: "T", categoryId: "c1", state: "TODO", priority: "URGENT" }),
    );
    expect(result.ok).toBe(false);
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("surfaces a generic failure on a non-FK service error", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    createTaskMock.mockRejectedValue(new Error("db down"));
    const result = await createTaskAction(
      null,
      fd({ title: "T", categoryId: "c1", state: "TODO" }),
    );
    expect(result).toEqual({ ok: false, error: "Failed to create task" });
  });
});

describe("updateTaskAction (R5, R9, R10)", () => {
  it("rejects an unauthenticated caller (R9)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await updateTaskAction(
      null,
      fd({ id: "t1", title: "T", categoryId: "c1", state: "DONE" }),
    );
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(updateTaskMock).not.toHaveBeenCalled();
  });

  it("updates (incl. state change → moves column on reload) and revalidates (R5)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    updateTaskMock.mockResolvedValue({ id: "t1" });

    const result = await updateTaskAction(
      null,
      fd({ id: "t1", title: "T", categoryId: "c1", state: "IN_PROGRESS" }),
    );

    expect(updateTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", state: "IN_PROGRESS" }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/board");
    expect(result).toEqual({ ok: true });
  });

  it("passes the chosen priority through to updateTask (08 — R3)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    updateTaskMock.mockResolvedValue({ id: "t1" });

    await updateTaskAction(
      null,
      fd({
        id: "t1",
        title: "T",
        categoryId: "c1",
        state: "TODO",
        priority: "LOW",
      }),
    );

    expect(updateTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "LOW" }),
    );
  });

  it("maps P2003 to a validation error (R10)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    updateTaskMock.mockRejectedValue({ code: "P2003" });
    const result = await updateTaskAction(
      null,
      fd({ id: "t1", title: "T", categoryId: "bad", state: "TODO" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no longer exists/i);
  });
});

describe("deleteTaskAction (R9)", () => {
  it("rejects an unauthenticated caller (R9)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await deleteTaskAction(null, fd({ id: "t1" }));
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(deleteTaskMock).not.toHaveBeenCalled();
  });

  it("rejects a missing id", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await deleteTaskAction(null, fd({}));
    expect(result).toEqual({ ok: false, error: "Missing id" });
    expect(deleteTaskMock).not.toHaveBeenCalled();
  });

  it("deletes and revalidates on success", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    deleteTaskMock.mockResolvedValue({ id: "t1" });
    const result = await deleteTaskAction(null, fd({ id: "t1" }));
    expect(deleteTaskMock).toHaveBeenCalledWith("t1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/board");
    expect(result).toEqual({ ok: true });
  });
});

describe("addSubtaskAction (R6, R9, R10)", () => {
  it("rejects an unauthenticated caller (R9)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await addSubtaskAction(
      null,
      fd({ taskId: "t1", title: "Step" }),
    );
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(addSubtaskMock).not.toHaveBeenCalled();
  });

  it("rejects an empty title with no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await addSubtaskAction(
      null,
      fd({ taskId: "t1", title: "  " }),
    );
    expect(result.ok).toBe(false);
    expect(addSubtaskMock).not.toHaveBeenCalled();
  });

  it("adds and revalidates on success (R6)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    addSubtaskMock.mockResolvedValue({ id: "s1" });
    const result = await addSubtaskAction(
      null,
      fd({ taskId: "t1", title: "Step 1" }),
    );
    expect(addSubtaskMock).toHaveBeenCalledWith({
      taskId: "t1",
      title: "Step 1",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/board");
    expect(result).toEqual({ ok: true });
  });

  it("maps a bad taskId FK (P2003) to a friendly error (R10)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    addSubtaskMock.mockRejectedValue({ code: "P2003" });
    const result = await addSubtaskAction(
      null,
      fd({ taskId: "missing", title: "Step" }),
    );
    expect(result).toEqual({ ok: false, error: "That task no longer exists" });
  });
});

describe("toggleSubtaskAction (R6, R9)", () => {
  it("rejects an unauthenticated caller (R9)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await toggleSubtaskAction(
      null,
      fd({ subtaskId: "s1", done: "true" }),
    );
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(toggleSubtaskMock).not.toHaveBeenCalled();
  });

  it("parses done='true' to boolean true and persists (R6)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    toggleSubtaskMock.mockResolvedValue({ id: "s1" });
    const result = await toggleSubtaskAction(
      null,
      fd({ subtaskId: "s1", done: "true" }),
    );
    expect(toggleSubtaskMock).toHaveBeenCalledWith({
      subtaskId: "s1",
      done: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/board");
    expect(result).toEqual({ ok: true });
  });

  it("parses anything other than 'true' to false", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    toggleSubtaskMock.mockResolvedValue({ id: "s1" });
    await toggleSubtaskAction(null, fd({ subtaskId: "s1", done: "false" }));
    expect(toggleSubtaskMock.mock.calls[0][0].done).toBe(false);
  });
});

describe("removeSubtaskAction (R9)", () => {
  it("rejects an unauthenticated caller (R9)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await removeSubtaskAction(null, fd({ subtaskId: "s1" }));
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(removeSubtaskMock).not.toHaveBeenCalled();
  });

  it("removes and revalidates on success", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    removeSubtaskMock.mockResolvedValue({ id: "s1" });
    const result = await removeSubtaskAction(null, fd({ subtaskId: "s1" }));
    expect(removeSubtaskMock).toHaveBeenCalledWith("s1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/board");
    expect(result).toEqual({ ok: true });
  });
});
