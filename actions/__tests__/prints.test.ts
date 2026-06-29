import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Auth guards — controllable per test. ForbiddenError is created inside the hoisted
// block so it exists when the (hoisted) vi.mock factory runs (a top-level `class`
// would be in its temporal dead zone at hoist time).
const { requireUserMock, requireAdminMock, ForbiddenError } = vi.hoisted(() => {
  class ForbiddenError extends Error {}
  return {
    requireUserMock: vi.fn(),
    requireAdminMock: vi.fn(),
    ForbiddenError,
  };
});
vi.mock("@/lib/auth", () => ({
  requireUser: (...a: unknown[]) => requireUserMock(...a),
  requireAdmin: (...a: unknown[]) => requireAdminMock(...a),
  ForbiddenError,
}));

// Service + storage are mocked so we test the ACTION's ordering/authz only.
const {
  createPrintMock,
  updatePrintMock,
  deletePrintMock,
  getPrintMock,
  uploadPhotoMock,
  replacePhotoMock,
} = vi.hoisted(() => ({
  createPrintMock: vi.fn(),
  updatePrintMock: vi.fn(),
  deletePrintMock: vi.fn(),
  getPrintMock: vi.fn(),
  uploadPhotoMock: vi.fn(),
  replacePhotoMock: vi.fn(),
}));
vi.mock("@/lib/services/prints", () => ({
  createPrint: (...a: unknown[]) => createPrintMock(...a),
  updatePrint: (...a: unknown[]) => updatePrintMock(...a),
  deletePrint: (...a: unknown[]) => deletePrintMock(...a),
  getPrint: (...a: unknown[]) => getPrintMock(...a),
}));
vi.mock("@/lib/storage", () => ({
  uploadPhoto: (...a: unknown[]) => uploadPhotoMock(...a),
  replacePhoto: (...a: unknown[]) => replacePhotoMock(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createPrintAction,
  deletePrintAction,
  updatePrintAction,
} from "@/actions/prints";

// A REAL File (so FormData.set stores it and `value instanceof File` holds in the
// action), with `size` overridden to the desired byte count without allocating it.
function makeFile(bytes: number, type: string, name = "photo.png"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

function validCreateForm(): FormData {
  const fd = new FormData();
  fd.set("name", "Dragon");
  fd.set("printTimeMinutes", "120");
  fd.set("filamentGrams", "45");
  fd.set("documentUrl", "");
  fd.set("printTypeId", "pt-1");
  fd.append("colorIds", "c-1");
  fd.append("colorIds", "c-2");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1", role: "EMPLOYEE" });
  requireAdminMock.mockResolvedValue({ id: "a1", role: "ADMIN" });
});

describe("createPrintAction (R5, R10)", () => {
  it("rejects an unauthenticated caller with no upload or DB write", async () => {
    requireUserMock.mockRejectedValue(new Error("nope"));
    const result = await createPrintAction(null, validCreateForm());
    expect(result.ok).toBe(false);
    expect(uploadPhotoMock).not.toHaveBeenCalled();
    expect(createPrintMock).not.toHaveBeenCalled();
  });

  it("persists with no photo when none provided", async () => {
    createPrintMock.mockResolvedValue({ id: "p1" });
    const result = await createPrintAction(null, validCreateForm());
    expect(result.ok).toBe(true);
    expect(uploadPhotoMock).not.toHaveBeenCalled();
    expect(createPrintMock).toHaveBeenCalledTimes(1);
    expect(createPrintMock.mock.calls[0][1]).toBeNull();
  });

  it("uploads a valid photo then persists with its key", async () => {
    uploadPhotoMock.mockResolvedValue("prints/abc.png");
    createPrintMock.mockResolvedValue({ id: "p1" });
    const fd = validCreateForm();
    fd.set("photo", makeFile(1024, "image/png"));

    const result = await createPrintAction(null, fd);
    expect(result.ok).toBe(true);
    expect(uploadPhotoMock).toHaveBeenCalledTimes(1);
    expect(createPrintMock.mock.calls[0][1]).toBe("prints/abc.png");
  });

  it("rejects zero colors before any upload/DB write (R10)", async () => {
    const fd = validCreateForm();
    fd.delete("colorIds");
    const result = await createPrintAction(null, fd);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.fieldErrors?.[0].field).toBe("colorIds");
    expect(uploadPhotoMock).not.toHaveBeenCalled();
    expect(createPrintMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized photo BEFORE uploading or writing (R10 — store nothing)", async () => {
    const fd = validCreateForm();
    fd.set("photo", makeFile(6 * 1024 * 1024, "image/png"));
    const result = await createPrintAction(null, fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.[0].field).toBe("photo");
    expect(uploadPhotoMock).not.toHaveBeenCalled();
    expect(createPrintMock).not.toHaveBeenCalled();
  });

  it("rejects a disallowed mime type before uploading (R10)", async () => {
    const fd = validCreateForm();
    fd.set("photo", makeFile(1024, "image/gif", "x.gif"));
    const result = await createPrintAction(null, fd);
    expect(result.ok).toBe(false);
    expect(uploadPhotoMock).not.toHaveBeenCalled();
    expect(createPrintMock).not.toHaveBeenCalled();
  });

  it("maps a P2003 FK violation to a reference field error", async () => {
    createPrintMock.mockRejectedValue({ code: "P2003" });
    const result = await createPrintAction(null, validCreateForm());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no longer exists/i);
  });
});

describe("updatePrintAction (R6)", () => {
  function validUpdateForm(): FormData {
    const fd = validCreateForm();
    fd.set("id", "p1");
    return fd;
  }

  it("updates without touching the photo when none provided (passes undefined)", async () => {
    updatePrintMock.mockResolvedValue(undefined);
    const result = await updatePrintAction(null, validUpdateForm());
    expect(result.ok).toBe(true);
    expect(replacePhotoMock).not.toHaveBeenCalled();
    expect(updatePrintMock.mock.calls[0][1]).toBeUndefined();
  });

  it("replaces the photo (reads existing key) then updates with the new key", async () => {
    getPrintMock.mockResolvedValue({ photoPath: "prints/old.png" });
    replacePhotoMock.mockResolvedValue("prints/new.png");
    updatePrintMock.mockResolvedValue(undefined);

    const fd = validUpdateForm();
    fd.set("photo", makeFile(1024, "image/webp", "n.webp"));

    const result = await updatePrintAction(null, fd);
    expect(result.ok).toBe(true);
    expect(replacePhotoMock).toHaveBeenCalledWith(
      expect.anything(),
      "prints/old.png",
    );
    expect(updatePrintMock.mock.calls[0][1]).toBe("prints/new.png");
  });

  it("rejects an oversized replacement before replacing/updating (R10)", async () => {
    const fd = validUpdateForm();
    fd.set("photo", makeFile(6 * 1024 * 1024, "image/png"));
    const result = await updatePrintAction(null, fd);
    expect(result.ok).toBe(false);
    expect(replacePhotoMock).not.toHaveBeenCalled();
    expect(updatePrintMock).not.toHaveBeenCalled();
  });
});

describe("deletePrintAction (R7, R9 — Admin-only)", () => {
  it("rejects a non-admin with NO DB or Storage write", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));
    const fd = new FormData();
    fd.set("id", "p1");

    const result = await deletePrintAction(null, fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not authorized/i);
    expect(deletePrintMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    requireAdminMock.mockRejectedValue(new Error("nope"));
    const fd = new FormData();
    fd.set("id", "p1");
    const result = await deletePrintAction(null, fd);
    expect(result.ok).toBe(false);
    expect(deletePrintMock).not.toHaveBeenCalled();
  });

  it("deletes for an admin", async () => {
    deletePrintMock.mockResolvedValue({ photoPath: "prints/x.png" });
    const fd = new FormData();
    fd.set("id", "p1");
    const result = await deletePrintAction(null, fd);
    expect(result.ok).toBe(true);
    expect(deletePrintMock).toHaveBeenCalledWith("p1");
  });

  it("rejects a missing id", async () => {
    const result = await deletePrintAction(null, new FormData());
    expect(result.ok).toBe(false);
    expect(deletePrintMock).not.toHaveBeenCalled();
  });
});
