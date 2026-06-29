import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

const ensureUserRowMock = vi.fn();
vi.mock("@/lib/services/users", () => ({
  ensureUserRow: (...args: unknown[]) => ensureUserRowMock(...args),
}));

import {
  ForbiddenError,
  getCurrentUser,
  requireAdmin,
  requireUser,
  UnauthenticatedError,
} from "@/lib/auth";

const employee = {
  id: "u1",
  email: "emp@example.com",
  name: "Emp",
  role: "EMPLOYEE" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const admin = { ...employee, id: "a1", email: "admin@example.com", role: "ADMIN" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(ensureUserRowMock).not.toHaveBeenCalled();
  });

  it("returns null when the user has no email", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: null } },
    });

    expect(await getCurrentUser()).toBeNull();
  });

  it("ensures + returns the User row, passing the metadata name", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "emp@example.com",
          user_metadata: { name: "Emp" },
        },
      },
    });
    ensureUserRowMock.mockResolvedValue(employee);

    const result = await getCurrentUser();

    expect(ensureUserRowMock).toHaveBeenCalledWith({
      id: "u1",
      email: "emp@example.com",
      name: "Emp",
    });
    expect(result).toBe(employee);
  });

  it("passes a null name when metadata.name is not a string", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: { id: "u1", email: "emp@example.com", user_metadata: {} },
      },
    });
    ensureUserRowMock.mockResolvedValue(employee);

    await getCurrentUser();

    expect(ensureUserRowMock).toHaveBeenCalledWith({
      id: "u1",
      email: "emp@example.com",
      name: null,
    });
  });
});

describe("requireUser (R7)", () => {
  it("returns the user when authenticated", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "emp@example.com" } },
    });
    ensureUserRowMock.mockResolvedValue(employee);

    expect(await requireUser()).toBe(employee);
  });

  it("throws UnauthenticatedError when not authenticated (R3)", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("requireAdmin (R7, R9)", () => {
  it("returns the user when they are an admin", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "a1", email: "admin@example.com" } },
    });
    ensureUserRowMock.mockResolvedValue(admin);

    expect(await requireAdmin()).toBe(admin);
  });

  it("throws ForbiddenError for an employee (R9)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "emp@example.com" } },
    });
    ensureUserRowMock.mockResolvedValue(employee);

    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws UnauthenticatedError when not authenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
