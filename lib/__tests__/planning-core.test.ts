import { describe, expect, it } from "vitest";

import {
  PREVIOUS_WEEK,
  dryingSchedule,
  fullMatches,
  partialMatches,
  previousDay,
  WEEKDAYS,
  type MatchablePrint,
  type SchedulableItem,
} from "@/lib/planning-core";

/**
 * The HIGHEST-VALUE test set (07_weekly_planning): the PURE matching + drying core.
 * Target 100% BRANCH coverage on fullMatches / partialMatches / dryingSchedule.
 * Anchored on the spec's WORKED EXAMPLE.
 */

// Worked-example color ids (the names map to ids here).
const PIEL = "piel";
const CAFE = "cafe";
const AZUL = "azul";
const VERDE = "verde";
const ROJO = "rojo";

// available = {Piel MM, Café Moka MM, Azul Ballena MM}
const available = new Set([PIEL, CAFE, AZUL]);

// The three worked-example prints.
const pielPrint: MatchablePrint = { id: "p-piel", colorIds: [PIEL] };
const pielVerdePrint: MatchablePrint = {
  id: "p-piel-verde",
  colorIds: [PIEL, VERDE],
};
const rojoPrint: MatchablePrint = { id: "p-rojo", colorIds: [ROJO] };
const noColorPrint: MatchablePrint = { id: "p-empty", colorIds: [] };

const allPrints = [pielPrint, pielVerdePrint, rojoPrint, noColorPrint];

describe("fullMatches (R4 — entire color set available)", () => {
  it("includes a print whose every color is available ({Piel} → full)", () => {
    const result = fullMatches(allPrints, available);
    expect(result.map((p) => p.id)).toContain("p-piel");
  });

  it("excludes a print missing a color ({Piel, Verde} → not full)", () => {
    const result = fullMatches(allPrints, available);
    expect(result.map((p) => p.id)).not.toContain("p-piel-verde");
  });

  it("excludes a print with no available color ({Rojo} → not full)", () => {
    const result = fullMatches(allPrints, available);
    expect(result.map((p) => p.id)).not.toContain("p-rojo");
  });

  it("excludes a print that has NO colors (nothing to produce)", () => {
    const result = fullMatches(allPrints, available);
    expect(result.map((p) => p.id)).not.toContain("p-empty");
  });

  it("returns ONLY the {Piel} print for the worked example", () => {
    expect(fullMatches(allPrints, available).map((p) => p.id)).toEqual([
      "p-piel",
    ]);
  });

  it("empty available ⇒ no full matches (R6)", () => {
    expect(fullMatches(allPrints, new Set())).toEqual([]);
  });
});

describe("partialMatches (R5 — shares ≥1, not full, missing listed)", () => {
  it("includes {Piel, Verde} as partial missing {Verde}", () => {
    const result = partialMatches(allPrints, available);
    const entry = result.find((r) => r.print.id === "p-piel-verde");
    expect(entry).toBeDefined();
    expect(entry!.missingColorIds).toEqual([VERDE]);
  });

  it("excludes a FULL match from partial ({Piel} not in partial list)", () => {
    const result = partialMatches(allPrints, available);
    expect(result.map((r) => r.print.id)).not.toContain("p-piel");
  });

  it("excludes a print sharing NO color ({Rojo} not shown in either mode)", () => {
    const result = partialMatches(allPrints, available);
    expect(result.map((r) => r.print.id)).not.toContain("p-rojo");
  });

  it("excludes a print with no colors", () => {
    const result = partialMatches(allPrints, available);
    expect(result.map((r) => r.print.id)).not.toContain("p-empty");
  });

  it("returns ONLY {Piel, Verde} (missing {Verde}) for the worked example", () => {
    const result = partialMatches(allPrints, available);
    expect(result).toHaveLength(1);
    expect(result[0].print.id).toBe("p-piel-verde");
    expect(result[0].missingColorIds).toEqual([VERDE]);
  });

  it("computes multiple missing colors in order", () => {
    const print: MatchablePrint = {
      id: "p-multi",
      colorIds: [PIEL, VERDE, ROJO],
    };
    const result = partialMatches([print], available);
    expect(result[0].missingColorIds).toEqual([VERDE, ROJO]);
  });

  it("empty available ⇒ no partial matches (R6)", () => {
    expect(partialMatches(allPrints, new Set())).toEqual([]);
  });
});

describe("previousDay (day−1 mapping, R9)", () => {
  it("maps each weekday to the prior weekday", () => {
    expect(previousDay("TUE")).toBe("MON");
    expect(previousDay("WED")).toBe("TUE");
    expect(previousDay("SUN")).toBe("SAT");
  });

  it("maps MON to the PREVIOUS_WEEK marker (the prior Sunday slot)", () => {
    expect(previousDay("MON")).toBe(PREVIOUS_WEEK);
  });
});

describe("dryingSchedule (R9 — colors to dry the day before)", () => {
  it("attributes a TUE print's colors to MON", () => {
    const items: SchedulableItem[] = [{ dayOfWeek: "TUE", colorIds: [PIEL] }];
    const schedule = dryingSchedule(items);
    expect(schedule.MON).toEqual([PIEL]);
    expect(schedule.TUE).toEqual([]);
  });

  it("attributes a MON print's colors to the PREVIOUS_WEEK marker (edge case)", () => {
    const items: SchedulableItem[] = [{ dayOfWeek: "MON", colorIds: [AZUL] }];
    const schedule = dryingSchedule(items);
    expect(schedule[PREVIOUS_WEEK]).toEqual([AZUL]);
    // No weekday slot carries it.
    for (const day of WEEKDAYS) expect(schedule[day]).toEqual([]);
  });

  it("unions + deduplicates + sorts colors of multiple prints on the same day", () => {
    const items: SchedulableItem[] = [
      { dayOfWeek: "WED", colorIds: [VERDE, PIEL] },
      { dayOfWeek: "WED", colorIds: [PIEL, AZUL] },
    ];
    const schedule = dryingSchedule(items);
    // Dried on TUE (day before WED): {azul, piel, verde} sorted.
    expect(schedule.TUE).toEqual([AZUL, PIEL, VERDE].sort());
  });

  it("returns all-empty slots for no items", () => {
    const schedule = dryingSchedule([]);
    expect(schedule[PREVIOUS_WEEK]).toEqual([]);
    for (const day of WEEKDAYS) expect(schedule[day]).toEqual([]);
  });

  it("handles a print with no colors (contributes nothing)", () => {
    const items: SchedulableItem[] = [{ dayOfWeek: "FRI", colorIds: [] }];
    const schedule = dryingSchedule(items);
    expect(schedule.THU).toEqual([]);
  });
});
