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

const createSaleMock = vi.fn();
const deleteSaleMock = vi.fn();
vi.mock("@/lib/services/finances", () => ({
  createSale: (...a: unknown[]) => createSaleMock(...a),
  deleteSale: (...a: unknown[]) => deleteSaleMock(...a),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

import { ForbiddenError, UnauthenticatedError } from "@/lib/auth";
import { createSaleAction, deleteSaleAction } from "@/actions/sales";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validForm = {
  amount: "1250.00",
  date: "2026-07-01",
  printId: "p-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSaleAction — ANY authenticated user may record a sale (R10)", () => {
  it("lets an EMPLOYEE record a sale and revalidates /finances", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createSaleMock.mockResolvedValue({ id: "s1" });

    const result = await createSaleAction(null, fd(validForm));

    expect(result).toEqual({ ok: true });
    expect(createSaleMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/finances");
  });

  it("uses requireUser (NOT requireAdmin) — recording is not admin-gated", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createSaleMock.mockResolvedValue({ id: "s1" });

    await createSaleAction(null, fd(validForm));

    expect(requireUserMock).toHaveBeenCalledTimes(1);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it("passes the validated amount through as the exact STRING (no float)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createSaleMock.mockResolvedValue({ id: "s1" });

    await createSaleAction(null, fd({ ...validForm, amount: "0.10" }));

    expect(createSaleMock.mock.calls[0][0].amount).toBe("0.10");
    expect(typeof createSaleMock.mock.calls[0][0].amount).toBe("string");
  });

  it("also revalidates /inventory (a print's deletability changed — R9)", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createSaleMock.mockResolvedValue({ id: "s1" });

    await createSaleAction(null, fd(validForm));

    expect(revalidatePathMock).toHaveBeenCalledWith("/inventory");
  });

  it("passes optional buyer/notes through when present", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createSaleMock.mockResolvedValue({ id: "s1" });

    await createSaleAction(
      null,
      fd({ ...validForm, buyer: "Ana", notes: "Repeat" }),
    );

    expect(createSaleMock.mock.calls[0][0].buyer).toBe("Ana");
    expect(createSaleMock.mock.calls[0][0].notes).toBe("Repeat");
  });
});

describe("createSaleAction — a sale REQUIRES a print (R8)", () => {
  it("rejects a MISSING printId with a field error and NO write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    const form = fd({ amount: "10.00", date: "2026-07-01" });

    const result = await createSaleAction(null, form);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.some((e) => e.field === "printId")).toBe(true);
    }
    expect(createSaleMock).not.toHaveBeenCalled();
  });

  it("rejects a BLANK printId with a field error and NO write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });

    const result = await createSaleAction(null, fd({ ...validForm, printId: "  " }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]?.field).toBe("printId");
      expect(result.fieldErrors?.[0]?.message).toBe("Print is required");
    }
    expect(createSaleMock).not.toHaveBeenCalled();
  });

  it("maps an UNKNOWN printId (service throws P2003) to a friendly field error, no partial write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createSaleMock.mockRejectedValue({ code: "P2003" });

    const result = await createSaleAction(null, fd({ ...validForm, printId: "ghost" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]?.field).toBe("printId");
      expect(result.error).toMatch(/no longer exists/i);
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("createSaleAction — invalid amounts rejected at the Zod boundary (R14)", () => {
  it.each([
    ["negative", "-5"],
    ["zero", "0"],
    ["blank", ""],
    ["non-numeric", "abc"],
    ["more than 2dp", "1.234"],
    ["NaN", "NaN"],
  ])("rejects a %s amount with a field error and NO write", async (_label, amount) => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });

    const result = await createSaleAction(null, fd({ ...validForm, amount }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]?.field).toBe("amount");
    }
    expect(createSaleMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid date with a field error and no write", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    const result = await createSaleAction(null, fd({ ...validForm, date: "nope" }));
    expect(result.ok).toBe(false);
    expect(createSaleMock).not.toHaveBeenCalled();
  });

  it("surfaces an unexpected service failure without revalidating", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
    createSaleMock.mockRejectedValue(new Error("db down"));

    const result = await createSaleAction(null, fd(validForm));

    expect(result).toEqual({ ok: false, error: "Failed to record sale" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deleteSaleAction — Admin-only, with NO-WRITE assertions (R10)", () => {
  it("rejects a NON-ADMIN (employee) with 'Not authorized' and NO delete", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    const result = await deleteSaleAction(null, fd({ id: "s1" }));

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(deleteSaleMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("lets an ADMIN delete and revalidates /finances", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    deleteSaleMock.mockResolvedValue({ id: "s1" });

    const result = await deleteSaleAction(null, fd({ id: "s1" }));

    expect(result).toEqual({ ok: true });
    expect(deleteSaleMock).toHaveBeenCalledWith("s1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/finances");
    expect(revalidatePathMock).toHaveBeenCalledWith("/inventory");
  });

  it("rejects a missing id even for an Admin", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const result = await deleteSaleAction(null, fd({}));
    expect(result).toEqual({ ok: false, error: "Missing id" });
    expect(deleteSaleMock).not.toHaveBeenCalled();
  });

  it("surfaces an unexpected delete failure without revalidating", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    deleteSaleMock.mockRejectedValue(new Error("db down"));

    const result = await deleteSaleAction(null, fd({ id: "s1" }));

    expect(result).toEqual({ ok: false, error: "Failed to delete sale" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("unauthenticated ⇒ NOTHING happens (R13)", () => {
  it("createSaleAction returns 'Not authenticated' and calls no service", async () => {
    requireUserMock.mockRejectedValue(new UnauthenticatedError());

    const result = await createSaleAction(null, fd(validForm));

    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(createSaleMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deleteSaleAction returns 'Not authenticated' and calls no service", async () => {
    requireAdminMock.mockRejectedValue(new UnauthenticatedError());

    const result = await deleteSaleAction(null, fd({ id: "s1" }));

    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(deleteSaleMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("createSaleAction rejects BEFORE validation (an invalid payload still says 'Not authenticated')", async () => {
    requireUserMock.mockRejectedValue(new UnauthenticatedError());

    const result = await createSaleAction(null, fd({ amount: "-5", date: "", printId: "" }));

    // Not a field error: the auth gate ran first, so validation never happened.
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(createSaleMock).not.toHaveBeenCalled();
  });
});
