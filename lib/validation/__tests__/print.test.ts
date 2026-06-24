import { describe, expect, it } from "vitest";

import {
  createPrintSchema,
  photoConstraints,
  updatePrintSchema,
  validatePhotoFile,
} from "@/lib/validation/print";

const base = {
  name: "Dragon",
  printTimeMinutes: "120",
  filamentGrams: "45",
  documentUrl: "",
  printTypeId: "pt-1",
  colorIds: ["c-1"],
};

describe("createPrintSchema (R5, R10)", () => {
  it("accepts a valid print with one color", () => {
    const parsed = createPrintSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.printTimeMinutes).toBe(120);
      expect(parsed.data.filamentGrams).toBe(45);
      expect(parsed.data.colorIds).toEqual(["c-1"]);
      expect(parsed.data.documentUrl).toBeUndefined();
    }
  });

  it("rejects zero colors with a colorIds field error (R10)", () => {
    const parsed = createPrintSchema.safeParse({ ...base, colorIds: [] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path[0]).toBe("colorIds");
      expect(parsed.error.issues[0].message).toMatch(/at least one color/i);
    }
  });

  it("accepts multiple colors", () => {
    const parsed = createPrintSchema.safeParse({
      ...base,
      colorIds: ["c-1", "c-2", "c-3"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.colorIds).toHaveLength(3);
  });

  it("rejects an empty name", () => {
    const parsed = createPrintSchema.safeParse({ ...base, name: "  " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path[0]).toBe("name");
  });

  it("rejects a negative integer field", () => {
    const parsed = createPrintSchema.safeParse({
      ...base,
      printTimeMinutes: "-5",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a fractional integer field", () => {
    const parsed = createPrintSchema.safeParse({
      ...base,
      filamentGrams: "10.5",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts zero for integer fields (≥ 0)", () => {
    const parsed = createPrintSchema.safeParse({
      ...base,
      printTimeMinutes: "0",
      filamentGrams: "0",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-numeric integer field", () => {
    const parsed = createPrintSchema.safeParse({
      ...base,
      printTimeMinutes: "abc",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an optional valid documentUrl and normalizes blank to undefined", () => {
    const withUrl = createPrintSchema.safeParse({
      ...base,
      documentUrl: "https://example.com/doc",
    });
    expect(withUrl.success).toBe(true);
    if (withUrl.success)
      expect(withUrl.data.documentUrl).toBe("https://example.com/doc");

    const blank = createPrintSchema.safeParse({ ...base, documentUrl: "" });
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.documentUrl).toBeUndefined();
  });

  it("rejects an invalid documentUrl", () => {
    const parsed = createPrintSchema.safeParse({
      ...base,
      documentUrl: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("updatePrintSchema (R6)", () => {
  it("requires an id on top of the create shape", () => {
    const missing = updatePrintSchema.safeParse(base);
    expect(missing.success).toBe(false);

    const ok = updatePrintSchema.safeParse({ ...base, id: "p-1" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.id).toBe("p-1");
  });
});

describe("validatePhotoFile + photoConstraints (R10)", () => {
  it("exposes the gate-decision constraints (5MB, png/jpeg/webp)", () => {
    expect(photoConstraints.maxBytes).toBe(5 * 1024 * 1024);
    expect(photoConstraints.allowedMimeTypes).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("accepts an allowed, within-size file", () => {
    expect(
      validatePhotoFile({ size: 1024, type: "image/png", name: "a.png" }),
    ).toEqual({ ok: true });
    expect(
      validatePhotoFile({ size: 1024, type: "image/jpeg" }),
    ).toEqual({ ok: true });
    expect(
      validatePhotoFile({ size: 1024, type: "image/webp" }),
    ).toEqual({ ok: true });
  });

  it("rejects an oversized file with a size message", () => {
    const result = validatePhotoFile({
      size: photoConstraints.maxBytes + 1,
      type: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/5 MB/i);
  });

  it("rejects a disallowed mime type", () => {
    const result = validatePhotoFile({
      size: 1024,
      type: "image/gif",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/PNG, JPEG, or WebP/i);
  });

  it("accepts a file exactly at the size limit", () => {
    expect(
      validatePhotoFile({
        size: photoConstraints.maxBytes,
        type: "image/png",
      }),
    ).toEqual({ ok: true });
  });
});
