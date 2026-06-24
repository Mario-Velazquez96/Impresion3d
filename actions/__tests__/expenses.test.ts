import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireUserMock = vi.fn();
const requireAdminMock = vi.fn();
vi.mock("@/lib/auth", () => {
  class ForbiddenError extends Error {}
  class UnauthenticatedError extends Error {}
  return {
    requireUser: () => requireUserMock(),
    requireAdmin: () => requireAdminMock(),
    ForbiddenError,
    UnauthenticatedError,
  };
});

const createServiceMock = vi.fn();
const updateServiceMock = vi.fn();
const deleteServiceMock = vi.fn();
vi.mock("@/lib/services/expenses", () => ({
  createExpense: (...a: unknown[]) => createServiceMock(...a),
  updateExpense: (...a: unknown[]) => updateServiceMock(...a),
  deleteExpense: (...a: unknown[]) => deleteServiceMock(...a),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

import { ForbiddenError, UnauthenticatedError } from "@/lib/auth";
import {
  createExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
} from "@/actions/expenses";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validForm = {
  cost: "12.50",
  reason: "PLA filament",
  date: "2026-06-01",
  supplyTypeId: "st-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createExpenseAction (R3, R8, R9)", () => {
  it("rejects an unauthenticated caller with NO write or revalidate", async () => {
    requireUserMock.mockRejectedValue(new UnauthenticatedError());
    const result = await createExpenseAction(null, fd(validForm));
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(createServiceMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("creates a valid expense and revalidates /expenses", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createServiceMock.mockResolvedValue({ id: "e1" });

    const result = await createExpenseAction(null, fd(validForm));
    expect(result).toEqual({ ok: true });
    expect(createServiceMock).toHaveBeenCalledTimes(1);
    // The validated cost reaches the service as the exact string (no float).
    expect(createServiceMock.mock.calls[0][0].cost).toBe("12.50");
    expect(revalidatePathMock).toHaveBeenCalledWith("/expenses");
  });

  it("rejects an invalid cost with a field error, no write (R8)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    const result = await createExpenseAction(
      null,
      fd({ ...validForm, cost: "1.234" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]?.field).toBe("cost");
    }
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("rejects a present-but-invalid purchaseUrl with a field error (R9)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    const result = await createExpenseAction(
      null,
      fd({ ...validForm, purchaseUrl: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]?.field).toBe("purchaseUrl");
    }
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("maps a P2003 FK violation to a supply-type field error", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createServiceMock.mockRejectedValue({ code: "P2003" });
    const result = await createExpenseAction(null, fd(validForm));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]?.field).toBe("supplyTypeId");
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("updateExpenseAction (R4)", () => {
  it("requires the id and updates a valid expense", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    updateServiceMock.mockResolvedValue({ id: "e1" });

    const result = await updateExpenseAction(
      null,
      fd({ ...validForm, id: "e1" }),
    );
    expect(result).toEqual({ ok: true });
    expect(updateServiceMock.mock.calls[0][0].id).toBe("e1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/expenses");
  });

  it("rejects an unauthenticated caller with no write", async () => {
    requireUserMock.mockRejectedValue(new UnauthenticatedError());
    const result = await updateExpenseAction(
      null,
      fd({ ...validForm, id: "e1" }),
    );
    expect(result.ok).toBe(false);
    expect(updateServiceMock).not.toHaveBeenCalled();
  });
});

describe("deleteExpenseAction — Admin-only (R5, R7)", () => {
  it("rejects a NON-admin (employee) with NO DB write or revalidate (R7)", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    const result = await deleteExpenseAction(null, fd({ id: "e1" }));

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(deleteServiceMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with no write", async () => {
    requireAdminMock.mockRejectedValue(new UnauthenticatedError());
    const result = await deleteExpenseAction(null, fd({ id: "e1" }));
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(deleteServiceMock).not.toHaveBeenCalled();
  });

  it("lets an Admin delete and revalidates /expenses (R5)", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    deleteServiceMock.mockResolvedValue({ id: "e1" });

    const result = await deleteExpenseAction(null, fd({ id: "e1" }));
    expect(result).toEqual({ ok: true });
    expect(deleteServiceMock).toHaveBeenCalledWith("e1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/expenses");
  });

  it("rejects a missing id even for an Admin", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const result = await deleteExpenseAction(null, fd({}));
    expect(result).toEqual({ ok: false, error: "Missing id" });
    expect(deleteServiceMock).not.toHaveBeenCalled();
  });
});
