import "server-only";

import { PrismaClient } from "@prisma/client";

// Singleton Prisma client. In dev, Next.js HMR re-evaluates modules, which would
// otherwise create a new client (and a new connection pool) on every reload. We
// stash the instance on globalThis to reuse it across reloads.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
