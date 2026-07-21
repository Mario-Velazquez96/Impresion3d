import { describe, expect, it } from "vitest";

import { mapClickToPixel } from "@/components/image-prep/BeforeAfterPreview";
import {
  CROP_PRESETS,
  DEFAULT_PRINT_SIZE,
  MAX_PRINT_MM,
  MIN_CROP_PX,
  MIN_PRINT_MM,
  MM_PER_INCH,
  PX_PER_MM_COMFORTABLE,
  PX_PER_MM_MIN,
  WORKING_CAP_PX,
  aspectRatio,
  boxPointToImage,
  clampRectToImage,
  contentBoxOf,
  cropPixels,
  describeAspect,
  effectivePxPerMm,
  fillRect,
  fitRect,
  handleCursor,
  hitTestHandle,
  imageRectToBoxFractions,
  matchingPreset,
  moveRect,
  parseMmInput,
  pixelsKeptPercent,
  pxPerMmToDpi,
  refitRect,
  resizeRect,
  resolutionLevel,
  swapOrientation,
  type CropRect,
  type Handle,
} from "@/lib/crop-core";
import { MAX_WORKING_DIMENSION, type PixelBuffer } from "@/lib/image-prep-core";

/**
 * Pure-core tests for 13_crop at 100% BRANCH coverage (R2–R13, R18–R21).
 * Everything here is synthetic: tiny images and plain rectangles, no DOM.
 */

// ---- helpers -----------------------------------------------------------------

/** A width×height buffer whose pixel i is (i, i+1, i+2, 255) — byte-checkable. */
function rampBuffer(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = i;
    data[i * 4 + 1] = i + 1;
    data[i * 4 + 2] = i + 2;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** The RGBA quadruple at (x, y). */
function pixelAt(buf: PixelBuffer, x: number, y: number): number[] {
  const at = (y * buf.width + x) * 4;
  return [
    buf.data[at],
    buf.data[at + 1],
    buf.data[at + 2],
    buf.data[at + 3],
  ];
}

/** Every R6 invariant, asserted on any produced rectangle. */
function expectInvariants(
  rect: CropRect,
  ratio: number,
  imgW: number,
  imgH: number,
) {
  expect(Number.isInteger(rect.x)).toBe(true);
  expect(Number.isInteger(rect.y)).toBe(true);
  expect(Number.isInteger(rect.width)).toBe(true);
  expect(Number.isInteger(rect.height)).toBe(true);
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(imgW);
  expect(rect.y + rect.height).toBeLessThanOrEqual(imgH);
  // Both sides sit at MIN_CROP_PX or above — unless the image itself cannot
  // hold that much at this ratio, where staying INSIDE the bounds wins.
  const largest = fitRect(imgW, imgH, ratio);
  expect(rect.width).toBeGreaterThanOrEqual(Math.min(MIN_CROP_PX, largest.width));
  expect(rect.height).toBeGreaterThanOrEqual(
    Math.min(MIN_CROP_PX, largest.height),
  );
  // The derived side is round(other / ratio): at most half a pixel of error.
  expect(Math.abs(rect.height - rect.width / ratio)).toBeLessThanOrEqual(0.5);
}

// ---- units: mm parsing, ratio, presets (R2–R5) -------------------------------

describe("parseMmInput (R2, R3)", () => {
  it("accepts decimals with either separator and surrounding whitespace", () => {
    expect(parseMmInput("71.7")).toBe(71.7);
    expect(parseMmInput("71,7")).toBe(71.7);
    expect(parseMmInput(" 94 ")).toBe(94);
    expect(parseMmInput("71.75")).toBe(71.75); // MM_MAX_DECIMALS = 2
  });

  it("accepts both ends of the valid range", () => {
    expect(parseMmInput(String(MIN_PRINT_MM))).toBe(MIN_PRINT_MM);
    expect(parseMmInput(String(MAX_PRINT_MM))).toBe(MAX_PRINT_MM);
  });

  it("rejects empty, non-numeric, signed and exponent forms", () => {
    expect(parseMmInput("")).toBeNull();
    expect(parseMmInput("   ")).toBeNull();
    expect(parseMmInput("abc")).toBeNull();
    expect(parseMmInput("-5")).toBeNull();
    expect(parseMmInput("+5")).toBeNull();
    expect(parseMmInput("1e9")).toBeNull();
    expect(parseMmInput("7.1.7")).toBeNull();
    expect(parseMmInput("94mm")).toBeNull();
  });

  it("rejects too many decimals, zero, negatives and out-of-range values", () => {
    expect(parseMmInput("1.234")).toBeNull();
    expect(parseMmInput("0")).toBeNull();
    expect(parseMmInput("0.5")).toBeNull(); // valid number, below MIN_PRINT_MM
    expect(parseMmInput("1001")).toBeNull();
  });
});

describe("aspect ratio, orientation and presets (R4, R5)", () => {
  it("derives the ratio and swaps orientation reversibly", () => {
    expect(aspectRatio({ widthMm: 100, heightMm: 50 })).toBe(2);
    const swapped = swapOrientation(DEFAULT_PRINT_SIZE);
    expect(swapped).toEqual({ widthMm: 94, heightMm: 71.7 });
    expect(swapOrientation(swapped)).toEqual(DEFAULT_PRINT_SIZE);
  });

  it("describes portrait, landscape and square", () => {
    expect(describeAspect(DEFAULT_PRINT_SIZE).orientation).toBe("portrait");
    expect(describeAspect({ widthMm: 94, heightMm: 71.7 }).orientation).toBe(
      "landscape",
    );
    expect(describeAspect({ widthMm: 100, heightMm: 100 }).orientation).toBe(
      "square",
    );
    expect(describeAspect(DEFAULT_PRINT_SIZE).ratio).toBeCloseTo(0.7628, 4);
  });

  it("matches a preset exactly, and only exactly", () => {
    expect(matchingPreset(DEFAULT_PRINT_SIZE)?.label).toBe("71.7 × 94");
    expect(matchingPreset({ widthMm: 120, heightMm: 160 })?.id).toBe(
      "native-3-4",
    );
    // Same width as the 100 × 100 preset, different height → no match.
    expect(matchingPreset({ widthMm: 100, heightMm: 999 })).toBeNull();
    expect(matchingPreset({ widthMm: 33, heightMm: 44 })).toBeNull();
  });

  it("ships the six built-in presets including the workshop default", () => {
    expect(CROP_PRESETS).toHaveLength(6);
    expect(CROP_PRESETS[0]).toEqual({
      id: "hueforge",
      label: "71.7 × 94",
      widthMm: DEFAULT_PRINT_SIZE.widthMm,
      heightMm: DEFAULT_PRINT_SIZE.heightMm,
    });
    // Presets are compile-time constants only — no persistence anywhere (R22).
    expect(CROP_PRESETS.map((p) => p.label)).toEqual([
      "71.7 × 94",
      "100 × 100",
      "100 × 150",
      "105 × 148",
      "148 × 210",
      "120 × 160",
    ]);
  });

  it("pins the working-image cap it reports (R12)", () => {
    expect(WORKING_CAP_PX).toBe(MAX_WORKING_DIMENSION);
    expect(WORKING_CAP_PX).toBe(2048);
  });
});

// ---- the ratio-locked rectangle (R6, R9) ------------------------------------

describe("clampRectToImage (R6)", () => {
  it("shrinks an oversize rectangle onto the image, ratio kept", () => {
    const out = clampRectToImage(
      { x: -10, y: -10, width: 500, height: 500 },
      1,
      100,
      100,
    );
    expect(out).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expectInvariants(out, 1, 100, 100);
  });

  it("caps by the WIDTH axis for a landscape ratio on a square image", () => {
    const out = clampRectToImage(
      { x: 0, y: 0, width: 999, height: 999 },
      2,
      100,
      100,
    );
    expect(out).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("caps by the HEIGHT axis for a portrait ratio on a square image", () => {
    const out = clampRectToImage(
      { x: 0, y: 0, width: 999, height: 999 },
      0.5,
      100,
      100,
    );
    expect(out).toEqual({ x: 0, y: 0, width: 50, height: 100 });
  });

  it("raises a too-small rectangle to the MIN_CROP_PX floor", () => {
    const out = clampRectToImage(
      { x: 10, y: 10, width: 2, height: 2 },
      1,
      100,
      100,
    );
    expect(out).toEqual({ x: 10, y: 10, width: 16, height: 16 });
  });

  it("floors the LONGER side at MIN_CROP_PX for a landscape ratio", () => {
    const out = clampRectToImage(
      { x: 0, y: 0, width: 1, height: 1 },
      2,
      100,
      100,
    );
    expect(out).toEqual({ x: 0, y: 0, width: 32, height: 16 });
  });

  it("translates the rectangle inside the bounds on all four edges", () => {
    expect(
      clampRectToImage({ x: 95, y: 95, width: 20, height: 20 }, 1, 100, 100),
    ).toEqual({ x: 80, y: 80, width: 20, height: 20 });
    expect(
      clampRectToImage({ x: -30, y: -30, width: 20, height: 20 }, 1, 100, 100),
    ).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it("lets the image bounds win over the min size on a tiny image", () => {
    const out = clampRectToImage(
      { x: 0, y: 0, width: 10, height: 10 },
      1,
      8,
      8,
    );
    expect(out).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    // Never empty and never outside, even on a degenerate 1-px image.
    expect(
      clampRectToImage({ x: 5, y: 5, width: 4, height: 4 }, 0.5, 1, 1),
    ).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("is idempotent — the invariant enforcer never keeps moving", () => {
    const once = clampRectToImage(
      { x: 37, y: 91, width: 333, height: 12 },
      0.7627659574468085,
      120,
      160,
    );
    const twice = clampRectToImage(once, 0.7627659574468085, 120, 160);
    expect(twice).toEqual(once);
    expectInvariants(once, 0.7627659574468085, 120, 160);
  });
});

describe("fitRect / fillRect / refitRect (R9, R2)", () => {
  it("fits the largest portrait rectangle, centred", () => {
    expect(fitRect(100, 100, 0.5)).toEqual({
      x: 25,
      y: 0,
      width: 50,
      height: 100,
    });
  });

  it("fits the largest landscape rectangle, centred", () => {
    expect(fitRect(100, 100, 2)).toEqual({
      x: 0,
      y: 25,
      width: 100,
      height: 50,
    });
  });

  it("covers the WHOLE image when the ratio already matches (3:4)", () => {
    expect(fitRect(120, 160, 120 / 160)).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 160,
    });
  });

  it("centres with an odd remainder deterministically", () => {
    expect(fitRect(101, 100, 0.5)).toEqual({
      x: 26,
      y: 0,
      width: 50,
      height: 100,
    });
  });

  it("fits the workshop default on a 40 × 40 image", () => {
    const ratio = aspectRatio(DEFAULT_PRINT_SIZE);
    const rect = fitRect(40, 40, ratio);
    expect(rect).toEqual({ x: 5, y: 1, width: 30, height: 39 });
    expectInvariants(rect, ratio, 40, 40);
  });

  it("Fill grows an off-centre rectangle to the maximum size, staying inside", () => {
    const grown = fillRect({ x: 10, y: 10, width: 40, height: 40 }, 1, 200, 100);
    // Fit's SIZE (100 × 100) around the framing's centre, translated inside.
    expect(grown).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expectInvariants(grown, 1, 200, 100);

    // A centred framing grows to exactly the Fit rectangle.
    expect(fillRect({ x: 90, y: 40, width: 20, height: 20 }, 1, 200, 100)).toEqual(
      fitRect(200, 100, 1),
    );
  });

  it("Refit re-locks to a new ratio preserving the centre and the pixel area", () => {
    const before = { x: 50, y: 50, width: 100, height: 100 };
    const after = refitRect(before, 4, 200, 200);
    expect(after).toEqual({ x: 0, y: 75, width: 200, height: 50 });
    expect(after.width * after.height).toBe(before.width * before.height);
    expect(after.x + after.width / 2).toBe(before.x + before.width / 2);
    expect(after.y + after.height / 2).toBe(before.y + before.height / 2);
    expectInvariants(after, 4, 200, 200);
  });

  it("Refit keeps the centre even when the new size must SHRINK to fit (regression)", () => {
    // 480 × 629 (71.7 × 94 mm on a 480 × 640 image) re-locked to 100 × 94 mm:
    // the area-preserving size (567 wide) does not fit, so it is capped at 480
    // — and the centre must survive that capping, not drift by the difference.
    const before = { x: 0, y: 6, width: 480, height: 629 };
    const after = refitRect(before, 100 / 94, 480, 640);
    expect(after).toEqual({ x: 0, y: 95, width: 480, height: 451 });
    expect(after.y + after.height / 2).toBe(before.y + before.height / 2);
  });

  it("Refit clamps when the preserved area does not fit the new ratio", () => {
    // Area 40 000 at ratio 16 wants 800 × 50 — far wider than the image.
    const after = refitRect({ x: 0, y: 0, width: 200, height: 200 }, 16, 200, 200);
    expect(after.width).toBe(200);
    expectInvariants(after, 16, 200, 200);
  });
});

describe("moveRect (R7, R19)", () => {
  const rect = { x: 40, y: 40, width: 20, height: 20 };

  it("translates by the delta without touching the size", () => {
    expect(moveRect(rect, 5, -7, 100, 100)).toEqual({
      x: 45,
      y: 33,
      width: 20,
      height: 20,
    });
  });

  it("clamps at all four edges", () => {
    expect(moveRect(rect, -999, 0, 100, 100).x).toBe(0);
    expect(moveRect(rect, 999, 0, 100, 100).x).toBe(80);
    expect(moveRect(rect, 0, -999, 100, 100).y).toBe(0);
    expect(moveRect(rect, 0, 999, 100, 100).y).toBe(80);
    expect(moveRect(rect, 999, 999, 100, 100)).toEqual({
      x: 80,
      y: 80,
      width: 20,
      height: 20,
    });
  });

  it("keeps a non-square rectangle's exact size (no ratio drift)", () => {
    const tall = { x: 5, y: 1, width: 30, height: 39 };
    const moved = moveRect(tall, 1, 0, 40, 40);
    expect(moved).toEqual({ x: 6, y: 1, width: 30, height: 39 });
  });
});

describe("resizeRect — all 8 handles, ratio locked (R8)", () => {
  const rect = { x: 20, y: 20, width: 40, height: 40 };
  const base = { rect, ratio: 1, imgW: 100, imgH: 100 };

  const cases: [Handle, number, number, CropRect][] = [
    ["se", 80, 80, { x: 20, y: 20, width: 60, height: 60 }],
    ["nw", 10, 10, { x: 10, y: 10, width: 50, height: 50 }],
    ["ne", 90, 10, { x: 20, y: 0, width: 60, height: 60 }],
    ["sw", 10, 90, { x: 0, y: 20, width: 60, height: 60 }],
    ["e", 70, 40, { x: 20, y: 15, width: 50, height: 50 }],
    ["w", 30, 40, { x: 30, y: 25, width: 30, height: 30 }],
    ["n", 40, 10, { x: 15, y: 10, width: 50, height: 50 }],
    ["s", 40, 90, { x: 5, y: 20, width: 70, height: 70 }],
  ];

  it.each(cases)(
    "%s resizes from the opposite anchor with the ratio locked",
    (handle, pointerX, pointerY, expected) => {
      const out = resizeRect({ ...base, handle, pointerX, pointerY });
      expect(out).toEqual(expected);
      expectInvariants(out, 1, 100, 100);
    },
  );

  it("stops growing at the image bounds instead of overflowing or breaking ratio", () => {
    for (const handle of [
      "nw",
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
    ] as Handle[]) {
      const out = resizeRect({
        ...base,
        handle,
        pointerX: 5000,
        pointerY: 5000,
      });
      expectInvariants(out, 1, 100, 100);
      const back = resizeRect({
        ...base,
        handle,
        pointerX: -5000,
        pointerY: -5000,
      });
      expectInvariants(back, 1, 100, 100);
    }
    // The SE corner anchored at (20, 20) can only reach the image edge.
    expect(
      resizeRect({ ...base, handle: "se", pointerX: 500, pointerY: 500 }),
    ).toEqual({ x: 20, y: 20, width: 80, height: 80 });
  });

  it("floors both sides at the minimum size", () => {
    const out = resizeRect({
      ...base,
      handle: "se",
      pointerX: 21,
      pointerY: 21,
    });
    expect(out).toEqual({ x: 20, y: 20, width: 16, height: 16 });
  });

  it("locks a non-square ratio while an edge handle drives the other axis", () => {
    const out = resizeRect({
      rect: { x: 20, y: 20, width: 40, height: 20 },
      handle: "n",
      pointerX: 40,
      pointerY: 0,
      ratio: 2,
      imgW: 100,
      imgH: 100,
    });
    expect(out).toEqual({ x: 0, y: 0, width: 80, height: 40 });
    expectInvariants(out, 2, 100, 100);
  });

  it("is deterministic — the same drag twice is deeply equal", () => {
    const args = {
      ...base,
      handle: "nw" as Handle,
      pointerX: 13.7,
      pointerY: 4.2,
    };
    expect(resizeRect(args)).toEqual(resizeRect(args));
  });
});

describe("hitTestHandle / handleCursor (R8)", () => {
  const rect = { x: 20, y: 20, width: 40, height: 40 };

  it("resolves each of the 8 handles, corners taking precedence", () => {
    expect(hitTestHandle(rect, 20, 20, 5)).toBe("nw");
    expect(hitTestHandle(rect, 60, 20, 5)).toBe("ne");
    expect(hitTestHandle(rect, 60, 60, 5)).toBe("se");
    expect(hitTestHandle(rect, 20, 60, 5)).toBe("sw");
    expect(hitTestHandle(rect, 40, 20, 5)).toBe("n");
    expect(hitTestHandle(rect, 40, 60, 5)).toBe("s");
    expect(hitTestHandle(rect, 20, 40, 5)).toBe("w");
    expect(hitTestHandle(rect, 60, 40, 5)).toBe("e");
  });

  it("reports the interior, and nothing outside the rectangle", () => {
    expect(hitTestHandle(rect, 30, 45, 5)).toBe("inside");
    expect(hitTestHandle(rect, 0, 40, 5)).toBeNull(); // left of the band
    expect(hitTestHandle(rect, 99, 40, 5)).toBeNull(); // right of the band
    expect(hitTestHandle(rect, 40, 0, 5)).toBeNull(); // above the band
    expect(hitTestHandle(rect, 40, 99, 5)).toBeNull(); // below the band
    // Inside the tolerance band but outside the rect and off every handle.
    expect(hitTestHandle(rect, 17, 30, 5)).toBeNull();
  });

  it("respects the tolerance boundary exactly", () => {
    expect(hitTestHandle(rect, 25, 20, 5)).toBe("nw"); // |Δ| == tolerance
    expect(hitTestHandle(rect, 25, 20, 4)).toBe("inside"); // just outside it
  });

  it("maps every target to its cursor", () => {
    expect(handleCursor("nw")).toBe("nwse-resize");
    expect(handleCursor("se")).toBe("nwse-resize");
    expect(handleCursor("ne")).toBe("nesw-resize");
    expect(handleCursor("sw")).toBe("nesw-resize");
    expect(handleCursor("n")).toBe("ns-resize");
    expect(handleCursor("s")).toBe("ns-resize");
    expect(handleCursor("e")).toBe("ew-resize");
    expect(handleCursor("w")).toBe("ew-resize");
    expect(handleCursor("inside")).toBe("move");
    expect(handleCursor(null)).toBe("default");
  });
});

// ---- object-contain geometry (R18) ------------------------------------------

describe("contentBoxOf / boxPointToImage / imageRectToBoxFractions (R18)", () => {
  it("letterboxes on the horizontal axis for a wide box", () => {
    expect(contentBoxOf({ rectW: 100, rectH: 50, imgW: 2, imgH: 2 })).toEqual({
      scale: 25,
      offsetX: 25,
      offsetY: 0,
      drawnW: 50,
      drawnH: 50,
    });
  });

  it("letterboxes on the vertical axis for a tall box", () => {
    expect(contentBoxOf({ rectW: 50, rectH: 100, imgW: 2, imgH: 2 })).toEqual({
      scale: 25,
      offsetX: 0,
      offsetY: 25,
      drawnW: 50,
      drawnH: 50,
    });
  });

  it("returns null for every degenerate dimension", () => {
    expect(contentBoxOf({ rectW: 0, rectH: 10, imgW: 4, imgH: 4 })).toBeNull();
    expect(contentBoxOf({ rectW: 10, rectH: 0, imgW: 4, imgH: 4 })).toBeNull();
    expect(contentBoxOf({ rectW: 10, rectH: 10, imgW: 0, imgH: 4 })).toBeNull();
    expect(contentBoxOf({ rectW: 10, rectH: 10, imgW: 4, imgH: 0 })).toBeNull();
    expect(
      boxPointToImage({
        rectW: 0,
        rectH: 0,
        imgW: 4,
        imgH: 4,
        offsetX: 1,
        offsetY: 1,
      }),
    ).toBeNull();
  });

  it("clamps a point that leaves the content on either axis, in both directions", () => {
    const box = { rectW: 100, rectH: 100, imgW: 10, imgH: 10 };
    expect(boxPointToImage({ ...box, offsetX: 35, offsetY: 45 })).toEqual({
      x: 3,
      y: 4,
    });
    expect(boxPointToImage({ ...box, offsetX: -500, offsetY: -500 })).toEqual({
      x: 0,
      y: 0,
    });
    expect(boxPointToImage({ ...box, offsetX: 5000, offsetY: 5000 })).toEqual({
      x: 9,
      y: 9,
    });
    // Inside the box but in the LETTERBOX margin → clamped, not lost (R7, R8).
    expect(
      boxPointToImage({
        rectW: 200,
        rectH: 100,
        imgW: 10,
        imgH: 10,
        offsetX: 20,
        offsetY: 50,
      }),
    ).toEqual({ x: 0, y: 5 });
  });

  it("AGREES with mapClickToPixel on every in-content point (anti-fork)", () => {
    const geometry = { rectW: 200, rectH: 100, imgW: 10, imgH: 10 };
    // Content spans x ∈ [50, 150), y ∈ [0, 100) at scale 10.
    for (let offsetX = 50; offsetX < 150; offsetX += 7) {
      for (let offsetY = 0; offsetY < 100; offsetY += 7) {
        const clicked = mapClickToPixel({ ...geometry, offsetX, offsetY });
        expect(clicked).not.toBeNull();
        expect(boxPointToImage({ ...geometry, offsetX, offsetY })).toEqual(
          clicked,
        );
      }
    }
  });

  it("expresses the rectangle as content-box fractions", () => {
    expect(
      imageRectToBoxFractions({ x: 25, y: 0, width: 50, height: 100 }, 100, 100),
    ).toEqual({ left: 0.25, top: 0, width: 0.5, height: 1 });
  });
});

// ---- readout (R10, R11) ------------------------------------------------------

describe("readout: px/mm, dpi, grading and pixels kept (R10, R11)", () => {
  it("reports px/mm per axis and the smaller of the two", () => {
    const value = effectivePxPerMm(
      { x: 0, y: 6, width: 480, height: 629 },
      DEFAULT_PRINT_SIZE,
    );
    expect(value.x).toBeCloseTo(6.6946, 4);
    expect(value.y).toBeCloseTo(6.6915, 4);
    expect(value.min).toBe(value.y);
    // The two axes agree to within R6's one-pixel rounding.
    expect(Math.abs(value.x - value.y)).toBeLessThan(0.01);
  });

  it("converts px/mm to dpi", () => {
    expect(pxPerMmToDpi(10)).toBeCloseTo(254, 10);
    expect(pxPerMmToDpi(1)).toBe(MM_PER_INCH);
  });

  it("grades both thresholds from both sides, including exact equality", () => {
    expect(resolutionLevel(0)).toBe("critical");
    expect(resolutionLevel(PX_PER_MM_MIN - 0.01)).toBe("critical");
    expect(resolutionLevel(PX_PER_MM_MIN)).toBe("low"); // not below the floor
    expect(resolutionLevel(PX_PER_MM_COMFORTABLE - 0.01)).toBe("low");
    expect(resolutionLevel(PX_PER_MM_COMFORTABLE)).toBe("ok");
    expect(resolutionLevel(21.8)).toBe("ok");
  });

  it("reports the share of working pixels kept", () => {
    expect(pixelsKeptPercent({ x: 0, y: 0, width: 50, height: 50 }, 100, 100)).toBe(
      25,
    );
    expect(
      pixelsKeptPercent({ x: 0, y: 0, width: 100, height: 100 }, 100, 100),
    ).toBe(100);
  });
});

// ---- the crop (R13, R21) -----------------------------------------------------

describe("cropPixels (R13, R21)", () => {
  it("extracts exactly the rectangle's pixels, byte for byte", () => {
    const src = rampBuffer(4, 4);
    const out = cropPixels(src, { x: 1, y: 1, width: 2, height: 2 });
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    // Source indices 5, 6 (row 1) and 9, 10 (row 2).
    expect(pixelAt(out, 0, 0)).toEqual([5, 6, 7, 255]);
    expect(pixelAt(out, 1, 0)).toEqual([6, 7, 8, 255]);
    expect(pixelAt(out, 0, 1)).toEqual([9, 10, 11, 255]);
    expect(pixelAt(out, 1, 1)).toEqual([10, 11, 12, 255]);
  });

  it("never mutates the source", () => {
    const src = rampBuffer(4, 4);
    const before = src.data.slice();
    cropPixels(src, { x: 2, y: 0, width: 2, height: 3 });
    expect(src.data).toEqual(before);
    expect(src.width).toBe(4);
    expect(src.height).toBe(4);
  });

  it("clamps an out-of-bounds rectangle instead of throwing", () => {
    const src = rampBuffer(4, 4);
    const out = cropPixels(src, { x: 3, y: 3, width: 10, height: 10 });
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(pixelAt(out, 0, 0)).toEqual([15, 16, 17, 255]);

    const negative = cropPixels(src, { x: -5, y: -5, width: 2, height: 2 });
    expect(negative.width).toBe(2);
    expect(pixelAt(negative, 0, 0)).toEqual([0, 1, 2, 255]);
  });

  it("a full-image rectangle is byte-identical — proving NO resampling", () => {
    const src = rampBuffer(5, 3);
    const out = cropPixels(src, { x: 0, y: 0, width: 5, height: 3 });
    expect(out.width).toBe(5);
    expect(out.height).toBe(3);
    expect(out.data).toEqual(src.data);
    expect(out.data).not.toBe(src.data); // a fresh buffer, not the same one
  });

  it("keeps the maximum available pixels for a real crop (option A)", () => {
    const ratio = aspectRatio(DEFAULT_PRINT_SIZE);
    const src = rampBuffer(40, 40);
    const rect = fitRect(40, 40, ratio);
    const out = cropPixels(src, rect);
    expect([out.width, out.height]).toEqual([30, 39]);
    // Exactly the source pixels at the rect's origin — no scaling.
    expect(pixelAt(out, 0, 0)).toEqual(pixelAt(src, rect.x, rect.y));
  });
});
