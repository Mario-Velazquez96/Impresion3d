import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

// vi.hoisted keeps these mocks available to the hoisted vi.mock factories below.
const { dbMock, createUserMock } = vi.hoisted(() => ({
  dbMock: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  createUserMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { admin: { createUser: createUserMock } },
  })),
}));

import { createClient } from "@supabase/supabase-js";
import {
  ensureUserRow,
  inviteUser,
  listUsers,
  setUserRole,
} from "@/lib/services/users";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
});

describe("ensureUserRow (R6)", () => {
  it("returns the existing row without creating a new one", async () => {
    const existing = {
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "EMPLOYEE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbMock.user.findUnique.mockResolvedValue(existing);

    const result = await ensureUserRow({ id: "u1", email: "a@b.com" });

    expect(result).toBe(existing);
    expect(dbMock.user.create).not.toHaveBeenCalled();
    expect(dbMock.user.count).not.toHaveBeenCalled();
  });

  it("makes the FIRST user an ADMIN (R6)", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.count.mockResolvedValue(0);
    dbMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await ensureUserRow({
      id: "first",
      email: "first@example.com",
      name: "First",
    });

    expect(result.role).toBe("ADMIN");
    expect(dbMock.user.create).toHaveBeenCalledWith({
      data: {
        id: "first",
        email: "first@example.com",
        name: "First",
        role: "ADMIN",
      },
    });
  });

  it("makes subsequent users EMPLOYEE (R6)", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.count.mockResolvedValue(3);
    dbMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await ensureUserRow({
      id: "second",
      email: "second@example.com",
      name: "Second",
    });

    expect(result.role).toBe("EMPLOYEE");
  });

  it("falls back to the email local-part when no name is supplied", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.count.mockResolvedValue(1);
    dbMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await ensureUserRow({
      id: "u9",
      email: "alice@example.com",
      name: null,
    });

    expect(result.name).toBe("alice");
  });

  it("trims a whitespace-only name to the email fallback", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.count.mockResolvedValue(1);
    dbMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await ensureUserRow({
      id: "u10",
      email: "bob@example.com",
      name: "   ",
    });

    expect(result.name).toBe("bob");
  });

  it("falls back to the full email when the local-part is empty", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.count.mockResolvedValue(1);
    dbMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await ensureUserRow({
      id: "u11",
      email: "@weird.example",
      name: null,
    });

    expect(result.name).toBe("@weird.example");
  });
});

describe("inviteUser (R8)", () => {
  it("creates an auto-confirmed auth user then the User row", async () => {
    createUserMock.mockResolvedValue({
      data: { user: { id: "auth-123" } },
      error: null,
    });
    dbMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await inviteUser({
      email: "invitee@example.com",
      name: "Invitee",
      role: "EMPLOYEE",
      tempPassword: "temp12",
    });

    expect(createUserMock).toHaveBeenCalledWith({
      email: "invitee@example.com",
      password: "temp12",
      email_confirm: true,
      user_metadata: { name: "Invitee" },
    });
    expect(dbMock.user.create).toHaveBeenCalledWith({
      data: {
        id: "auth-123",
        email: "invitee@example.com",
        name: "Invitee",
        role: "EMPLOYEE",
      },
    });
    expect(result.id).toBe("auth-123");
  });

  it("uses the SECRET key (not the publishable key) for the admin client", async () => {
    createUserMock.mockResolvedValue({
      data: { user: { id: "auth-x" } },
      error: null,
    });
    dbMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    await inviteUser({
      email: "x@example.com",
      name: "X",
      role: "ADMIN",
      tempPassword: "temp12",
    });

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_secret_test",
      expect.anything(),
    );
  });

  it("throws and creates no User row when the Admin API errors", async () => {
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "email exists" },
    });

    await expect(
      inviteUser({
        email: "dup@example.com",
        name: "Dup",
        role: "EMPLOYEE",
        tempPassword: "temp12",
      }),
    ).rejects.toThrow("email exists");
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it("throws a default message when the Admin API returns no user and no error", async () => {
    createUserMock.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      inviteUser({
        email: "z@example.com",
        name: "Z",
        role: "EMPLOYEE",
        tempPassword: "temp12",
      }),
    ).rejects.toThrow("Failed to create auth user");
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it("throws when the secret key env var is missing", async () => {
    delete process.env.SUPABASE_SECRET_KEY;

    await expect(
      inviteUser({
        email: "y@example.com",
        name: "Y",
        role: "EMPLOYEE",
        tempPassword: "temp12",
      }),
    ).rejects.toThrow(/SUPABASE_SECRET_KEY/);
    expect(createUserMock).not.toHaveBeenCalled();
  });
});

describe("setUserRole (R10)", () => {
  it("updates the user's role", async () => {
    dbMock.user.update.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await setUserRole({ userId: "u1", role: "ADMIN" });

    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "ADMIN" },
    });
    expect(result.role).toBe("ADMIN");
  });
});

describe("listUsers", () => {
  it("returns users newest first", async () => {
    const rows = [{ id: "u1" }, { id: "u2" }];
    dbMock.user.findMany.mockResolvedValue(rows);

    const result = await listUsers();

    expect(dbMock.user.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
    expect(result).toBe(rows);
  });
});
