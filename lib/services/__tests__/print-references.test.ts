import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetPrintReferencesForTests,
  isPrintInUse,
  registerPrintReference,
} from "@/lib/services/print-references";

/**
 * The Print delete-guard registry (10_sales_and_balance R9) — the friendly
 * pre-check in front of the `Sale.printId` FK Restrict. A parallel mirror of the
 * catalogs registry (a Print is not a CatalogKey), so it gets the same coverage.
 */

beforeEach(() => {
  __resetPrintReferencesForTests();
});

describe("isPrintInUse", () => {
  it("returns false when NO counter is registered (best-effort pre-check)", async () => {
    // The counter is only registered if the referencing feature's service module
    // has been loaded in that server instance — exactly like catalogs. The DB's
    // Restrict FK is the hard guarantee either way.
    expect(await isPrintInUse("p-1")).toBe(false);
  });

  it("returns true when a registered counter reports at least one reference", async () => {
    registerPrintReference(async () => 1);
    expect(await isPrintInUse("p-1")).toBe(true);
  });

  it("returns false when every counter reports zero", async () => {
    registerPrintReference(async () => 0);
    registerPrintReference(async () => 0);
    expect(await isPrintInUse("p-1")).toBe(false);
  });

  it("returns true when ANY of several counters reports a reference", async () => {
    registerPrintReference(async () => 0);
    registerPrintReference(async () => 3);
    expect(await isPrintInUse("p-1")).toBe(true);
  });

  it("passes the print id to every counter and runs them in parallel", async () => {
    const a = vi.fn().mockResolvedValue(0);
    const b = vi.fn().mockResolvedValue(0);
    registerPrintReference(a);
    registerPrintReference(b);

    await isPrintInUse("p-42");

    expect(a).toHaveBeenCalledWith("p-42");
    expect(b).toHaveBeenCalledWith("p-42");
  });
});

describe("__resetPrintReferencesForTests", () => {
  it("clears registered counters so suites don't leak into each other", async () => {
    registerPrintReference(async () => 5);
    expect(await isPrintInUse("p-1")).toBe(true);

    __resetPrintReferencesForTests();
    expect(await isPrintInUse("p-1")).toBe(false);
  });
});
