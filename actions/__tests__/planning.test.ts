import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: (...a: unknown[]) => requireUserMock(...a),
}));

const {
  setWeekColorsMock,
  assignPrintToDayMock,
  moveWeekItemMock,
  removeWeekItemMock,
} = vi.hoisted(() => ({
  setWeekColorsMock: vi.fn(),
  assignPrintToDayMock: vi.fn(),
  moveWeekItemMock: vi.fn(),
  removeWeekItemMock: vi.fn(),
}));
vi.mock("@/lib/services/planning", () => ({
  setWeekColors: (...a: unknown[]) => setWeekColorsMock(...a),
  assignPrintToDay: (...a: unknown[]) => assignPrintToDayMock(...a),
  moveWeekItem: (...a: unknown[]) => moveWeekItemMock(...a),
  removeWeekItem: (...a: unknown[]) => removeWeekItemMock(...a),
  // the validation module imports WEEKDAYS from the service; re-export the tuple.
  WEEKDAYS: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
}));

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

import {
  assignItemAction,
  moveItemAction,
  removeItemAction,
  setWeekColorsAction,
} from "@/actions/planning";

const WEEK = "2026-06-22";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

function colorsForm(colorIds: string[]): FormData {
  const fd = new FormData();
  fd.set("weekStartDate", WEEK);
  for (const id of colorIds) fd.append("colorIds", id);
  return fd;
}

describe("setWeekColorsAction (R3, R10)", () => {
  it("rejects an unauthenticated caller and writes nothing (R10)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await setWeekColorsAction(null, colorsForm(["c-1"]));
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(setWeekColorsMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("persists the colors and revalidates on success", async () => {
    const result = await setWeekColorsAction(null, colorsForm(["c-1", "c-2"]));
    expect(result).toEqual({ ok: true });
    expect(setWeekColorsMock).toHaveBeenCalledWith(
      new Date(WEEK),
      ["c-1", "c-2"],
      "user-1",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/planning");
  });

  it("rejects an invalid date with a field error and no write", async () => {
    const fd = new FormData();
    fd.set("weekStartDate", "not-a-date");
    const result = await setWeekColorsAction(null, fd);
    expect(result.ok).toBe(false);
    expect(setWeekColorsMock).not.toHaveBeenCalled();
  });

  it("maps a Prisma FK violation to a friendly reference error", async () => {
    setWeekColorsMock.mockRejectedValue({ code: "P2003" });
    const result = await setWeekColorsAction(null, colorsForm(["bad"]));
    expect(result).toEqual({
      ok: false,
      error: "That color or print no longer exists",
    });
  });
});

describe("assignItemAction (R7, R10)", () => {
  function assignForm(day: string): FormData {
    const fd = new FormData();
    fd.set("weekStartDate", WEEK);
    fd.set("printId", "p-1");
    fd.set("dayOfWeek", day);
    return fd;
  }

  it("rejects an unauthenticated caller and writes nothing (R10)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await assignItemAction(null, assignForm("MON"));
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(assignPrintToDayMock).not.toHaveBeenCalled();
  });

  it("assigns the print to the day and revalidates", async () => {
    const result = await assignItemAction(null, assignForm("WED"));
    expect(result).toEqual({ ok: true });
    expect(assignPrintToDayMock).toHaveBeenCalledWith(
      new Date(WEEK),
      "p-1",
      "WED",
      "user-1",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/planning");
  });

  it("rejects an invalid weekday with no write", async () => {
    const result = await assignItemAction(null, assignForm("FUNDAY"));
    expect(result.ok).toBe(false);
    expect(assignPrintToDayMock).not.toHaveBeenCalled();
  });
});

describe("moveItemAction (R8, R10)", () => {
  function moveForm(day: string, toIndex: string): FormData {
    const fd = new FormData();
    fd.set("itemId", "it-1");
    fd.set("dayOfWeek", day);
    fd.set("toIndex", toIndex);
    return fd;
  }

  it("rejects an unauthenticated caller and writes nothing (R10)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await moveItemAction(null, moveForm("FRI", "0"));
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(moveWeekItemMock).not.toHaveBeenCalled();
  });

  it("moves the item and revalidates", async () => {
    const result = await moveItemAction(null, moveForm("FRI", "2"));
    expect(result).toEqual({ ok: true });
    expect(moveWeekItemMock).toHaveBeenCalledWith("it-1", "FRI", 2);
  });

  it("rejects a negative index with no write", async () => {
    const result = await moveItemAction(null, moveForm("FRI", "-1"));
    expect(result.ok).toBe(false);
    expect(moveWeekItemMock).not.toHaveBeenCalled();
  });
});

describe("removeItemAction (R8, R10)", () => {
  function removeForm(): FormData {
    const fd = new FormData();
    fd.set("itemId", "it-1");
    return fd;
  }

  it("rejects an unauthenticated caller and writes nothing (R10)", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await removeItemAction(null, removeForm());
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(removeWeekItemMock).not.toHaveBeenCalled();
  });

  it("removes the item and revalidates", async () => {
    const result = await removeItemAction(null, removeForm());
    expect(result).toEqual({ ok: true });
    expect(removeWeekItemMock).toHaveBeenCalledWith("it-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/planning");
  });
});
