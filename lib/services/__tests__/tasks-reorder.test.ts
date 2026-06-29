import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $transaction: vi.fn(),
    task: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/services/catalogs", () => ({
  registerCatalogReference: vi.fn(),
}));

import {
  renumberColumn,
  renumberColumnWithInsert,
  reorderTask,
  type OrderedTaskRef,
} from "@/lib/services/tasks";

beforeEach(() => {
  vi.clearAllMocks();
});

/** Build ordered refs from a list of ids (positions = their index). */
function refs(ids: string[]): OrderedTaskRef[] {
  return ids.map((id, position) => ({ id, position }));
}

/** Map assignments back to an id-ordered list for readable assertions. */
function order(assignments: { id: string; position: number }[]): string[] {
  return [...assignments]
    .sort((a, b) => a.position - b.position)
    .map((a) => a.id);
}

describe("renumberColumnWithInsert (R3 — contiguous, clamped, idempotent)", () => {
  it("inserts the moved card from another column at the requested index", () => {
    // dest had [a, b, c]; moved 'x' arrives at index 1.
    const result = renumberColumnWithInsert(refs(["a", "b", "c"]), "x", 1);
    expect(order(result)).toEqual(["a", "x", "b", "c"]);
    expect(result.map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it("inserts into an empty column at position 0", () => {
    const result = renumberColumnWithInsert([], "x", 0);
    expect(result).toEqual([{ id: "x", position: 0 }]);
  });

  it("reorders within a column (moved card present in dest) without duplication", () => {
    // Within [a, b, c, d]; move 'a' to index 2 -> [b, c, a, d].
    const result = renumberColumnWithInsert(refs(["a", "b", "c", "d"]), "a", 2);
    expect(order(result)).toEqual(["b", "c", "a", "d"]);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it("clamps a too-large index to the end", () => {
    const result = renumberColumnWithInsert(refs(["a", "b"]), "x", 99);
    expect(order(result)).toEqual(["a", "b", "x"]);
    expect(result.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it("clamps a negative index to the start", () => {
    const result = renumberColumnWithInsert(refs(["a", "b"]), "x", -5);
    expect(order(result)).toEqual(["x", "a", "b"]);
  });

  it("normalizes gapped/unsorted input to contiguous 0..n-1", () => {
    const gapped: OrderedTaskRef[] = [
      { id: "b", position: 10 },
      { id: "a", position: 3 },
      { id: "c", position: 99 },
    ];
    const result = renumberColumnWithInsert(gapped, "x", 1);
    // current order by position: a(3), b(10), c(99); insert x at 1.
    expect(order(result)).toEqual(["a", "x", "b", "c"]);
    expect(result.map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it("is idempotent: replaying the same target yields the same order", () => {
    const first = renumberColumnWithInsert(refs(["a", "b", "c"]), "x", 1);
    // Feed the result back in (x now at index 1) and replay the same target.
    const second = renumberColumnWithInsert(first, "x", 1);
    expect(order(second)).toEqual(order(first));
    expect(second.map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it("stays contiguous across many sequential reorders (no drift)", () => {
    let col: OrderedTaskRef[] = refs(["a", "b", "c", "d", "e"]);
    for (const target of [0, 4, 2, 1, 3, 0]) {
      const out = renumberColumnWithInsert(col, "c", target);
      expect(out.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(out.map((r) => r.id)).size).toBe(5);
      col = out;
    }
  });
});

describe("renumberColumn (source column after a cross-column move)", () => {
  it("drops the excluded id and renumbers the rest contiguously", () => {
    const result = renumberColumn(refs(["a", "b", "c"]), "b");
    expect(order(result)).toEqual(["a", "c"]);
    expect(result.map((r) => r.position)).toEqual([0, 1]);
  });

  it("returns an empty list when the column only held the moved card", () => {
    expect(renumberColumn(refs(["a"]), "a")).toEqual([]);
  });

  it("is a no-op-shaped renumber when the id is absent", () => {
    const result = renumberColumn(refs(["a", "b"]), "z");
    expect(order(result)).toEqual(["a", "b"]);
    expect(result.map((r) => r.position)).toEqual([0, 1]);
  });
});

describe("reorderTask (R1, R2, R3 — transactional persistence)", () => {
  // Run the transaction callback against the mocked tx (= dbMock.task).
  function runTx() {
    dbMock.$transaction.mockImplementation(
      async (cb: (tx: typeof dbMock) => Promise<void>) => cb(dbMock),
    );
  }

  it("within a column: updates only positions, no state write", async () => {
    runTx();
    dbMock.task.findUniqueOrThrow.mockResolvedValue({
      id: "a",
      state: "TODO",
    });
    dbMock.task.findMany.mockResolvedValueOnce([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
    dbMock.task.update.mockResolvedValue({});

    await reorderTask({ taskId: "a", toState: "TODO", toIndex: 2 });

    // No state-change update (state unchanged), only position updates.
    const positionUpdates = dbMock.task.update.mock.calls.map((c) => c[0]);
    expect(positionUpdates).toEqual([
      { where: { id: "b" }, data: { position: 0 } },
      { where: { id: "c" }, data: { position: 1 } },
      { where: { id: "a" }, data: { position: 2 } },
    ]);
    // Only one findMany (destination), no source pass for a same-column move.
    expect(dbMock.task.findMany).toHaveBeenCalledTimes(1);
  });

  it("across columns: sets new state, renumbers dest AND source", async () => {
    runTx();
    dbMock.task.findUniqueOrThrow.mockResolvedValue({
      id: "x",
      state: "TODO",
    });
    // dest (DONE) read, then source (TODO) read.
    dbMock.task.findMany
      .mockResolvedValueOnce([
        { id: "d1", position: 0 },
        { id: "x", position: 1 },
      ])
      .mockResolvedValueOnce([
        { id: "t1", position: 0 },
        { id: "t2", position: 1 },
      ]);
    dbMock.task.update.mockResolvedValue({});

    await reorderTask({ taskId: "x", toState: "DONE", toIndex: 0 });

    // First update is the state change.
    expect(dbMock.task.update.mock.calls[0][0]).toEqual({
      where: { id: "x" },
      data: { state: "DONE" },
    });
    // Source renumber happened (two reads).
    expect(dbMock.task.findMany).toHaveBeenCalledTimes(2);
    // Dest got x at index 0.
    const dataById = new Map(
      dbMock.task.update.mock.calls
        .map((c) => c[0])
        .filter((u) => "position" in u.data)
        .map((u) => [u.where.id, u.data.position]),
    );
    expect(dataById.get("x")).toBe(0);
    expect(dataById.get("d1")).toBe(1);
    // Source renumbered to contiguous.
    expect(dataById.get("t1")).toBe(0);
    expect(dataById.get("t2")).toBe(1);
  });

  it("propagates a not-found task (P2025) from the initial read", async () => {
    runTx();
    dbMock.task.findUniqueOrThrow.mockRejectedValue({ code: "P2025" });
    await expect(
      reorderTask({ taskId: "missing", toState: "TODO", toIndex: 0 }),
    ).rejects.toEqual({ code: "P2025" });
  });
});
