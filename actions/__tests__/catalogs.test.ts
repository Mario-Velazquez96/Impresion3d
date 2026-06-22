import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireAdminMock = vi.fn();
vi.mock("@/lib/auth", () => {
  class ForbiddenError extends Error {}
  class UnauthenticatedError extends Error {}
  return {
    requireAdmin: () => requireAdminMock(),
    ForbiddenError,
    UnauthenticatedError,
  };
});

const createServiceMock = vi.fn();
const updateServiceMock = vi.fn();
const deleteServiceMock = vi.fn();
const inUseMock = vi.fn();
vi.mock("@/lib/services/catalogs", () => ({
  createCatalogValue: (...a: unknown[]) => createServiceMock(...a),
  updateCatalogValue: (...a: unknown[]) => updateServiceMock(...a),
  deleteCatalogValue: (...a: unknown[]) => deleteServiceMock(...a),
  isCatalogValueInUse: (...a: unknown[]) => inUseMock(...a),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

import { ForbiddenError, UnauthenticatedError } from "@/lib/auth";
import {
  createCatalog,
  deleteCatalog,
  updateCatalog,
} from "@/actions/catalogs";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCatalog (R4, R5, R7)", () => {
  it("rejects a non-admin with NO service call or revalidate (R7)", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    const result = await createCatalog(
      null,
      fd({ catalog: "printType", name: "frame" }),
    );

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(createServiceMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports 'Not authenticated' when there is no user", async () => {
    requireAdminMock.mockRejectedValue(new UnauthenticatedError());
    const result = await createCatalog(
      null,
      fd({ catalog: "printType", name: "frame" }),
    );
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
  });

  it("rejects an unknown catalog", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    const result = await createCatalog(null, fd({ catalog: "widget", name: "x" }));
    expect(result).toEqual({ ok: false, error: "Unknown catalog" });
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("rejects an empty name with a field error, no write (R5/validation)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    const result = await createCatalog(
      null,
      fd({ catalog: "printType", name: "   " }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.[0]).toEqual({
        field: "name",
        message: "Name is required",
      });
    }
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("rejects a color with an invalid hex (R8 validation)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    const result = await createCatalog(
      null,
      fd({ catalog: "color", name: "Blue", hex: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.some((e) => e.field === "hex")).toBe(true);
    }
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("maps a Prisma P2002 to a name field error and writes nothing (R5)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    createServiceMock.mockRejectedValue({ code: "P2002" });

    const result = await createCatalog(
      null,
      fd({ catalog: "printType", name: "frame" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toEqual([
        { field: "name", message: "That name is already in use" },
      ]);
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("creates a color (name+hex) and revalidates on success (R4)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    createServiceMock.mockResolvedValue({ id: "c1" });

    const result = await createCatalog(
      null,
      fd({ catalog: "color", name: "Blue", hex: "#0000FF" }),
    );

    expect(createServiceMock).toHaveBeenCalledWith("color", {
      name: "Blue",
      hex: "#0000FF",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/catalogs");
    expect(result).toEqual({ ok: true });
  });

  it("surfaces a generic failure when the service throws a non-P2002 error", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    createServiceMock.mockRejectedValue(new Error("db down"));
    const result = await createCatalog(
      null,
      fd({ catalog: "printType", name: "frame" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Failed to create catalog value",
    });
  });
});

describe("updateCatalog (R4, R5, R7)", () => {
  it("rejects a non-admin (R7)", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const result = await updateCatalog(
      null,
      fd({ catalog: "printType", id: "p1", name: "frame" }),
    );
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(updateServiceMock).not.toHaveBeenCalled();
  });

  it("rejects a missing id", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    const result = await updateCatalog(
      null,
      fd({ catalog: "printType", name: "frame" }),
    );
    expect(result).toEqual({ ok: false, error: "Missing id" });
    expect(updateServiceMock).not.toHaveBeenCalled();
  });

  it("maps P2002 on rename to a name field error (R5)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    updateServiceMock.mockRejectedValue({ code: "P2002" });
    const result = await updateCatalog(
      null,
      fd({ catalog: "printType", id: "p1", name: "dup" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toEqual([
        { field: "name", message: "That name is already in use" },
      ]);
    }
  });

  it("updates and revalidates on success (R4)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    updateServiceMock.mockResolvedValue({ id: "p1" });
    const result = await updateCatalog(
      null,
      fd({ catalog: "printType", id: "p1", name: "frame" }),
    );
    expect(updateServiceMock).toHaveBeenCalledWith("printType", "p1", {
      name: "frame",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/catalogs");
    expect(result).toEqual({ ok: true });
  });
});

describe("deleteCatalog (R6, R7)", () => {
  it("rejects a non-admin (R7)", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const result = await deleteCatalog(
      null,
      fd({ catalog: "printType", id: "p1" }),
    );
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(inUseMock).not.toHaveBeenCalled();
    expect(deleteServiceMock).not.toHaveBeenCalled();
  });

  it("blocks an in-use value with a friendly message and no delete (R6)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    inUseMock.mockResolvedValue(true);

    const result = await deleteCatalog(
      null,
      fd({ catalog: "taskCategory", id: "t1" }),
    );

    expect(inUseMock).toHaveBeenCalledWith("taskCategory", "t1");
    expect(deleteServiceMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "This value is in use and cannot be deleted",
    });
  });

  it("deletes a free value and revalidates (R6)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    inUseMock.mockResolvedValue(false);
    deleteServiceMock.mockResolvedValue({ id: "t1" });

    const result = await deleteCatalog(
      null,
      fd({ catalog: "taskCategory", id: "t1" }),
    );

    expect(deleteServiceMock).toHaveBeenCalledWith("taskCategory", "t1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/catalogs");
    expect(result).toEqual({ ok: true });
  });

  it("maps a DB Restrict (P2003) backstop to the in-use message (R6)", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    inUseMock.mockResolvedValue(false);
    deleteServiceMock.mockRejectedValue({ code: "P2003" });

    const result = await deleteCatalog(
      null,
      fd({ catalog: "taskCategory", id: "t1" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "This value is in use and cannot be deleted",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("surfaces a generic failure for other delete errors", async () => {
    requireAdminMock.mockResolvedValue({ role: "ADMIN" });
    inUseMock.mockResolvedValue(false);
    deleteServiceMock.mockRejectedValue(new Error("boom"));

    const result = await deleteCatalog(
      null,
      fd({ catalog: "taskCategory", id: "t1" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Failed to delete catalog value",
    });
  });
});
