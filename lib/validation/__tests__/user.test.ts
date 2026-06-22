import { describe, it, expect } from "vitest";

import {
  inviteUserSchema,
  loginSchema,
  roleSchema,
  setRoleSchema,
} from "@/lib/validation/user";

describe("loginSchema", () => {
  it("accepts a valid email + 6-char password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 6 characters", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "12345",
    });
    expect(result.success).toBe(false);
  });
});

describe("roleSchema", () => {
  it("accepts ADMIN and EMPLOYEE", () => {
    expect(roleSchema.safeParse("ADMIN").success).toBe(true);
    expect(roleSchema.safeParse("EMPLOYEE").success).toBe(true);
  });

  it("rejects an unknown role", () => {
    expect(roleSchema.safeParse("SUPERUSER").success).toBe(false);
  });
});

describe("inviteUserSchema", () => {
  it("accepts a valid invite with a 6-char temporary password (R8)", () => {
    const result = inviteUserSchema.safeParse({
      email: "new@example.com",
      name: "New User",
      role: "EMPLOYEE",
      tempPassword: "temp12",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a temporary password shorter than 6 chars (R8a)", () => {
    const result = inviteUserSchema.safeParse({
      email: "new@example.com",
      name: "New User",
      role: "EMPLOYEE",
      tempPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/at least 6/i);
    }
  });

  it("rejects an empty name", () => {
    const result = inviteUserSchema.safeParse({
      email: "new@example.com",
      name: "",
      role: "EMPLOYEE",
      tempPassword: "temp12",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid role", () => {
    const result = inviteUserSchema.safeParse({
      email: "new@example.com",
      name: "New User",
      role: "BOSS",
      tempPassword: "temp12",
    });
    expect(result.success).toBe(false);
  });
});

describe("setRoleSchema", () => {
  it("accepts a userId + valid role", () => {
    const result = setRoleSchema.safeParse({
      userId: "abc-123",
      role: "ADMIN",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty userId", () => {
    const result = setRoleSchema.safeParse({ userId: "", role: "ADMIN" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid role", () => {
    const result = setRoleSchema.safeParse({ userId: "abc", role: "NOPE" });
    expect(result.success).toBe(false);
  });
});
