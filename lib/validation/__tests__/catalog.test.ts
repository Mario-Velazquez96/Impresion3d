import { describe, expect, it } from "vitest";

import {
  catalogKeySchema,
  colorSchema,
  hexColorRegex,
  nameOnlySchema,
  schemaForCatalog,
} from "@/lib/validation/catalog";

describe("catalogKeySchema", () => {
  it("accepts the four known catalogs", () => {
    for (const key of ["color", "printType", "supplyType", "taskCategory"]) {
      expect(catalogKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it("rejects an unknown catalog", () => {
    expect(catalogKeySchema.safeParse("widget").success).toBe(false);
  });
});

describe("hexColorRegex (R8)", () => {
  it("matches 6-digit #RRGGBB in either case", () => {
    expect(hexColorRegex.test("#1F4E79")).toBe(true);
    expect(hexColorRegex.test("#abcdef")).toBe(true);
    expect(hexColorRegex.test("#000000")).toBe(true);
  });

  it("rejects shorthand, missing hash, wrong length, and bad chars", () => {
    expect(hexColorRegex.test("#FFF")).toBe(false);
    expect(hexColorRegex.test("1F4E79")).toBe(false);
    expect(hexColorRegex.test("#1F4E7")).toBe(false);
    expect(hexColorRegex.test("#1F4E790")).toBe(false);
    expect(hexColorRegex.test("#1G4E79")).toBe(false);
  });
});

describe("colorSchema (R4, R5)", () => {
  it("accepts a valid name + hex and trims the name", () => {
    const parsed = colorSchema.safeParse({ name: "  Azul  ", hex: "#1F4E79" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("Azul");
  });

  it("rejects an empty/whitespace name", () => {
    expect(colorSchema.safeParse({ name: "   ", hex: "#1F4E79" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid hex with a #RRGGBB message", () => {
    const parsed = colorSchema.safeParse({ name: "X", hex: "blue" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/#RRGGBB/);
    }
  });
});

describe("nameOnlySchema (R4, R5)", () => {
  it("accepts a non-empty name and trims it", () => {
    const parsed = nameOnlySchema.safeParse({ name: "  frame " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("frame");
  });

  it("rejects an empty name", () => {
    expect(nameOnlySchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("schemaForCatalog", () => {
  it("returns colorSchema for color (requires hex)", () => {
    const schema = schemaForCatalog("color");
    expect(schema.safeParse({ name: "X" }).success).toBe(false);
    expect(schema.safeParse({ name: "X", hex: "#000000" }).success).toBe(true);
  });

  it("returns nameOnlySchema for the others (hex ignored)", () => {
    for (const key of ["printType", "supplyType", "taskCategory"] as const) {
      const schema = schemaForCatalog(key);
      expect(schema.safeParse({ name: "X" }).success).toBe(true);
    }
  });
});
