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

const createWithdrawalMock = vi.fn();
const deleteWithdrawalMock = vi.fn();
vi.mock("@/lib/services/finances", () => ({
  createWithdrawal: (...a: unknown[]) => createWithdrawalMock(...a),
  deleteWithdrawal: (...a: unknown[]) => deleteWithdrawalMock(...a),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

import { ForbiddenError, UnauthenticatedError } from "@/lib/auth";
import {
  createWithdrawalAction,
  deleteWithdrawalAction,
} from "@/actions/withdrawals";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validForm = {
  amount: "500.00",
  date: "2026-07-02",
  reason: "Owner draw",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createWithdrawalAction — Admin-only, NO WRITE on rejection (R11)", () => {
  it("rejects a NON-ADMIN (employee) with 'Not authorized' and NO write", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    const result = await createWithdrawalAction(null, fd(validForm));

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(createWithdrawalMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects the non-admin BEFORE validation — an also-invalid payload STILL says 'Not authorized'", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    // Every field here is Zod-invalid. If validation ran first we would get a
    // field error; the authorization decision must not depend on the input.
    const result = await createWithdrawalAction(
      null,
      fd({ amount: "-5", date: "", reason: "" }),
    );

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    if (!result.ok) expect(result.fieldErrors).toBeUndefined();
    expect(createWithdrawalMock).not.toHaveBeenCalled();
  });

  it("lets an ADMIN record a withdrawal and revalidates /finances", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    createWithdrawalMock.mockResolvedValue({ id: "w1" });

    const result = await createWithdrawalAction(null, fd(validForm));

    expect(result).toEqual({ ok: true });
    expect(createWithdrawalMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/finances");
  });

  it("uses requireAdmin, never the plain requireUser gate", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    createWithdrawalMock.mockResolvedValue({ id: "w1" });

    await createWithdrawalAction(null, fd(validForm));

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(requireUserMock).not.toHaveBeenCalled();
  });
});

describe("createWithdrawalAction — the audit trail is SERVER-ASSIGNED (R15)", () => {
  it("passes user.id from requireAdmin() as recordedById", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    createWithdrawalMock.mockResolvedValue({ id: "w1" });

    await createWithdrawalAction(null, fd(validForm));

    // Second argument: the actor resolved from the SESSION.
    expect(createWithdrawalMock.mock.calls[0][1]).toBe("admin-1");
  });

  it("IGNORES a recordedById planted in the FormData — the forged value never reaches the service", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    createWithdrawalMock.mockResolvedValue({ id: "w1" });

    await createWithdrawalAction(
      null,
      fd({ ...validForm, recordedById: "FORGED-victim" }),
    );

    const [input, recordedById] = createWithdrawalMock.mock.calls[0];
    expect(recordedById).toBe("admin-1");
    expect(recordedById).not.toBe("FORGED-victim");
    // The schema has no recordedById, so it is not even in the parsed input.
    expect(input).not.toHaveProperty("recordedById");
    expect(JSON.stringify(input)).not.toContain("FORGED-victim");
  });

  it("attributes the withdrawal to whichever admin is acting", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-2", role: "ADMIN" });
    createWithdrawalMock.mockResolvedValue({ id: "w2" });

    await createWithdrawalAction(null, fd(validForm));

    expect(createWithdrawalMock.mock.calls[0][1]).toBe("admin-2");
  });
});

describe("createWithdrawalAction — validation (R14)", () => {
  it("rejects a MISSING reason with a field error and no write", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });

    const result = await createWithdrawalAction(
      null,
      fd({ amount: "500.00", date: "2026-07-02" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.some((e) => e.field === "reason")).toBe(true);
    }
    expect(createWithdrawalMock).not.toHaveBeenCalled();
  });

  it("rejects a BLANK reason with a field error and no write", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });

    const result = await createWithdrawalAction(
      null,
      fd({ ...validForm, reason: "   " }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]?.message).toBe("Reason is required");
    }
    expect(createWithdrawalMock).not.toHaveBeenCalled();
  });

  it.each([
    ["negative", "-5"],
    ["zero", "0"],
    ["blank", ""],
    ["non-numeric", "abc"],
    ["more than 2dp", "1.234"],
    ["NaN", "NaN"],
  ])("rejects a %s amount with a field error and NO write", async (_l, amount) => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });

    const result = await createWithdrawalAction(null, fd({ ...validForm, amount }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.[0]?.field).toBe("amount");
    expect(createWithdrawalMock).not.toHaveBeenCalled();
  });

  it("surfaces an unexpected service failure without revalidating", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    createWithdrawalMock.mockRejectedValue(new Error("db down"));

    const result = await createWithdrawalAction(null, fd(validForm));

    expect(result).toEqual({ ok: false, error: "Failed to record withdrawal" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deleteWithdrawalAction — Admin-only, NO WRITE on rejection (R12)", () => {
  it("rejects a NON-ADMIN (employee) with 'Not authorized' and NO delete", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    const result = await deleteWithdrawalAction(null, fd({ id: "w1" }));

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(deleteWithdrawalMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("lets an ADMIN delete and revalidates /finances", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    deleteWithdrawalMock.mockResolvedValue({ id: "w1" });

    const result = await deleteWithdrawalAction(null, fd({ id: "w1" }));

    expect(result).toEqual({ ok: true });
    expect(deleteWithdrawalMock).toHaveBeenCalledWith("w1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/finances");
  });

  it("rejects a missing id even for an Admin", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    const result = await deleteWithdrawalAction(null, fd({}));
    expect(result).toEqual({ ok: false, error: "Missing id" });
    expect(deleteWithdrawalMock).not.toHaveBeenCalled();
  });

  it("surfaces an unexpected delete failure without revalidating", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    deleteWithdrawalMock.mockRejectedValue(new Error("db down"));

    const result = await deleteWithdrawalAction(null, fd({ id: "w1" }));

    expect(result).toEqual({ ok: false, error: "Failed to delete withdrawal" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("unauthenticated ⇒ NOTHING happens (R13)", () => {
  it("createWithdrawalAction returns 'Not authenticated' and calls no service", async () => {
    requireAdminMock.mockRejectedValue(new UnauthenticatedError());

    const result = await createWithdrawalAction(null, fd(validForm));

    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(createWithdrawalMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deleteWithdrawalAction returns 'Not authenticated' and calls no service", async () => {
    requireAdminMock.mockRejectedValue(new UnauthenticatedError());

    const result = await deleteWithdrawalAction(null, fd({ id: "w1" }));

    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(deleteWithdrawalMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
