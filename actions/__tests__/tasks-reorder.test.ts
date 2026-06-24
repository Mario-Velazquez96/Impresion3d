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

const reorderTaskMock = vi.fn();
// The actions module imports several service fns; stub all referenced ones.
vi.mock("@/lib/services/tasks", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  addSubtask: vi.fn(),
  toggleSubtask: vi.fn(),
  removeSubtask: vi.fn(),
  reorderTask: (...a: unknown[]) => reorderTaskMock(...a),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

import { reorderTaskAction } from "@/actions/tasks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reorderTaskAction (R1, R2, R5)", () => {
  it("rejects an unauthenticated caller with NO service call or revalidate (R5)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));

    const result = await reorderTaskAction({
      taskId: "t1",
      toState: "DONE",
      toIndex: 0,
    });

    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(reorderTaskMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid toState with no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await reorderTaskAction({
      taskId: "t1",
      toState: "NOPE",
      toIndex: 0,
    });
    expect(result.ok).toBe(false);
    expect(reorderTaskMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects a negative toIndex with no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await reorderTaskAction({
      taskId: "t1",
      toState: "TODO",
      toIndex: -1,
    });
    expect(result.ok).toBe(false);
    expect(reorderTaskMock).not.toHaveBeenCalled();
  });

  it("rejects a non-integer toIndex with no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await reorderTaskAction({
      taskId: "t1",
      toState: "TODO",
      toIndex: 1.5,
    });
    expect(result.ok).toBe(false);
    expect(reorderTaskMock).not.toHaveBeenCalled();
  });

  it("rejects a missing taskId with no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await reorderTaskAction({ toState: "TODO", toIndex: 0 });
    expect(result.ok).toBe(false);
    expect(reorderTaskMock).not.toHaveBeenCalled();
  });

  it("persists and revalidates /board on success (R1, R2)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    reorderTaskMock.mockResolvedValue(undefined);

    const result = await reorderTaskAction({
      taskId: "t1",
      toState: "IN_PROGRESS",
      toIndex: 2,
    });

    expect(reorderTaskMock).toHaveBeenCalledWith({
      taskId: "t1",
      toState: "IN_PROGRESS",
      toIndex: 2,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/board");
    expect(result).toEqual({ ok: true });
  });

  it("surfaces a generic failure when the service throws (e.g. missing task)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    reorderTaskMock.mockRejectedValue({ code: "P2025" });

    const result = await reorderTaskAction({
      taskId: "missing",
      toState: "TODO",
      toIndex: 0,
    });

    expect(result).toEqual({ ok: false, error: "Failed to reorder task" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
