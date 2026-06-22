import { z } from "zod";

// Mirrors the Prisma `Role` enum. Declared here (rather than imported from
// @prisma/client) so this module stays importable from client components and
// the browser bundle without pulling in the server-only Prisma client.
export const roleSchema = z.enum(["ADMIN", "EMPLOYEE"]);
export type Role = z.infer<typeof roleSchema>;

// Shared password rule: minimum 6 characters. An invited user's temporary
// password reuses this exact rule so it always satisfies the login form (R8a).
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().min(1, "Name is required"),
  role: roleSchema,
  // Reuses the login password rule (min 6) so the invited user can sign in
  // immediately with this temporary password (R8, R8a).
  tempPassword: passwordSchema,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const setRoleSchema = z.object({
  userId: z.string().min(1, "User id is required"),
  role: roleSchema,
});
export type SetRoleInput = z.infer<typeof setRoleSchema>;
