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

const inviteUserServiceMock = vi.fn();
const setUserRoleServiceMock = vi.fn();
vi.mock("@/lib/services/users", () => ({
  inviteUser: (...a: unknown[]) => inviteUserServiceMock(...a),
  setUserRole: (...a: unknown[]) => setUserRoleServiceMock(...a),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

const signOutMock = vi.fn();
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => redirectMock(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: signOutMock } })),
}));

import { ForbiddenError, UnauthenticatedError } from "@/lib/auth";
import { inviteUser, setUserRole, signOut } from "@/actions/users";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inviteUser action (R8, R8a, R9)", () => {
  it("rejects a non-admin without any DB/Admin-API write (R9)", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    const result = await inviteUser(
      null,
      fd({
        email: "x@example.com",
        name: "X",
        role: "EMPLOYEE",
        tempPassword: "temp12",
      }),
    );

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(inviteUserServiceMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short temp password with no service call (R8a)", async () => {
    requireAdminMock.mockResolvedValue({ id: "a1", role: "ADMIN" });

    const result = await inviteUser(
      null,
      fd({
        email: "x@example.com",
        name: "X",
        role: "EMPLOYEE",
        tempPassword: "12345",
      }),
    );

    expect(result.ok).toBe(false);
    expect(inviteUserServiceMock).not.toHaveBeenCalled();
  });

  it("invites + revalidates on valid admin submission (R8)", async () => {
    requireAdminMock.mockResolvedValue({ id: "a1", role: "ADMIN" });
    inviteUserServiceMock.mockResolvedValue({ id: "new" });

    const result = await inviteUser(
      null,
      fd({
        email: "new@example.com",
        name: "New",
        role: "EMPLOYEE",
        tempPassword: "temp12",
      }),
    );

    expect(inviteUserServiceMock).toHaveBeenCalledWith({
      email: "new@example.com",
      name: "New",
      role: "EMPLOYEE",
      tempPassword: "temp12",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
    expect(result).toEqual({ ok: true });
  });

  it("surfaces an Admin-API failure as an error result", async () => {
    requireAdminMock.mockResolvedValue({ id: "a1", role: "ADMIN" });
    inviteUserServiceMock.mockRejectedValue(new Error("email exists"));

    const result = await inviteUser(
      null,
      fd({
        email: "dup@example.com",
        name: "Dup",
        role: "EMPLOYEE",
        tempPassword: "temp12",
      }),
    );

    expect(result).toEqual({ ok: false, error: "email exists" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports 'Not authenticated' when the actor is not logged in", async () => {
    requireAdminMock.mockRejectedValue(new UnauthenticatedError());

    const result = await inviteUser(
      null,
      fd({
        email: "x@example.com",
        name: "X",
        role: "EMPLOYEE",
        tempPassword: "temp12",
      }),
    );

    expect(result).toEqual({ ok: false, error: "Not authenticated" });
  });
});

describe("setUserRole action (R9, R10)", () => {
  it("rejects a non-admin without a DB write (R9)", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError("Forbidden"));

    const result = await setUserRole(null, fd({ userId: "u1", role: "ADMIN" }));

    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(setUserRoleServiceMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    requireAdminMock.mockResolvedValue({ id: "a1", role: "ADMIN" });

    const result = await setUserRole(null, fd({ userId: "", role: "NOPE" }));

    expect(result.ok).toBe(false);
    expect(setUserRoleServiceMock).not.toHaveBeenCalled();
  });

  it("persists + revalidates on valid admin submission (R10)", async () => {
    requireAdminMock.mockResolvedValue({ id: "a1", role: "ADMIN" });
    setUserRoleServiceMock.mockResolvedValue({ id: "u1", role: "ADMIN" });

    const result = await setUserRole(null, fd({ userId: "u1", role: "ADMIN" }));

    expect(setUserRoleServiceMock).toHaveBeenCalledWith({
      userId: "u1",
      role: "ADMIN",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
    expect(result).toEqual({ ok: true });
  });

  it("returns an error result when the service throws", async () => {
    requireAdminMock.mockResolvedValue({ id: "a1", role: "ADMIN" });
    setUserRoleServiceMock.mockRejectedValue(new Error("db down"));

    const result = await setUserRole(null, fd({ userId: "u1", role: "ADMIN" }));

    expect(result).toEqual({ ok: false, error: "Failed to update role" });
  });
});

describe("signOut action", () => {
  it("signs out and redirects to /login", async () => {
    await signOut();
    expect(signOutMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
