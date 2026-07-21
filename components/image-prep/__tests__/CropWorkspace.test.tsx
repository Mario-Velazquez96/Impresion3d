import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Crop-workspace interaction tests (13_crop: R2–R12, R14, R17–R20). The suite
 * renders the FULL island (the 11/R21 + 12 pattern) so the workspace runs
 * against the real stage wiring; the worker hook is mocked (no crop
 * interaction may post work — R21) and the crop canvas box is stubbed, since
 * jsdom's `getBoundingClientRect` returns zeros and it performs no layout.
 *
 * Sample image: a 480 × 640 (3:4) ramp — big enough that the default
 * 71.7 × 94 mm target lands comfortably above the resolution thresholds, so
 * both warning tiers can be reached deliberately.
 */

import { ImagePrep } from "@/components/image-prep/ImagePrep";
import type { DecodedImage } from "@/components/image-prep/decode";
import {
  DEFAULT_PRINT_SIZE,
  aspectRatio,
  fitRect,
  type CropRect,
} from "@/lib/crop-core";
import type { PixelBuffer } from "@/lib/image-prep-core";

const mocks = vi.hoisted(() => ({
  busyRef: { value: false },
  requestSpy: vi.fn(),
  decodeSpy: vi.fn(),
}));

vi.mock("@/components/image-prep/useImagePrepWorker", () => ({
  useImagePrepWorker: () => ({
    request: mocks.requestSpy,
    busy: mocks.busyRef.value,
  }),
}));

vi.mock("@/components/image-prep/decode", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/image-prep/decode")>();
  return { ...actual, decodeImageFile: mocks.decodeSpy };
});

// ---- fixtures ----------------------------------------------------------------

const IMG_W = 480;
const IMG_H = 640;
const DEFAULT_RATIO = aspectRatio(DEFAULT_PRINT_SIZE);
const DEFAULT_RECT = fitRect(IMG_W, IMG_H, DEFAULT_RATIO);

function rampBuffer(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = i % 256;
    data[i * 4 + 1] = (i * 7) % 256;
    data[i * 4 + 2] = (i * 13) % 256;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function decodedSample(): DecodedImage {
  return {
    pixels: rampBuffer(IMG_W, IMG_H),
    originalWidth: IMG_W,
    originalHeight: IMG_H,
    downscaled: false,
  };
}

function makeFile(name: string): File {
  return new File([new Uint8Array(8)], name, { type: "image/png" });
}

beforeEach(() => {
  mocks.busyRef.value = false;
  mocks.requestSpy.mockReset();
  mocks.requestSpy.mockImplementation(async () => {
    throw new Error("no worker op is expected during a crop (R21)");
  });
  mocks.decodeSpy.mockReset();
  mocks.decodeSpy.mockImplementation(async () => decodedSample());

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: vi.fn(() => ({
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: vi.fn(),
    })),
    writable: true,
    configurable: true,
  });
});

/** jsdom's getBoundingClientRect returns zeros — stub a real box. */
function stubRect(
  el: HTMLElement,
  width: number,
  height: number,
  left = 0,
  top = 0,
) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

/** Load the sample, enter the crop stage, and stub the canvas box 1:1. */
async function enterCrop(): Promise<HTMLElement> {
  fireEvent.change(screen.getByLabelText(/source image/i), {
    target: { files: [makeFile("sample.png")] },
  });
  await screen.findByText(/480 × 640 px/);
  fireEvent.click(screen.getByRole("button", { name: "Start crop" }));
  const canvas = screen.getByLabelText("Crop canvas");
  stubRect(canvas, IMG_W, IMG_H);
  await act(async () => {});
  return canvas;
}

/** Recover the crop rectangle from the overlay's percentage geometry. */
function readRect(): CropRect {
  const el = screen.getByTestId("crop-rect");
  const pct = (value: string) => Number.parseFloat(value) / 100;
  return {
    x: Math.round(pct(el.style.left) * IMG_W),
    y: Math.round(pct(el.style.top) * IMG_H),
    width: Math.round(pct(el.style.width) * IMG_W),
    height: Math.round(pct(el.style.height) * IMG_H),
  };
}

const readout = () => screen.getByTestId("crop-readout");
const applyButton = () => screen.getByRole("button", { name: "Apply crop" });
/** The crop panel's own Reset (AdjustPanel has one too, disabled while cropping). */
const cropResetButton = () =>
  within(screen.getByTestId("crop-size-panel")).getByRole("button", {
    name: "Reset",
  });

function press(canvas: HTMLElement, x: number, y: number) {
  fireEvent.mouseDown(canvas, { button: 0, clientX: x, clientY: y });
}

function drag(
  canvas: HTMLElement,
  from: [number, number],
  to: [number, number],
) {
  press(canvas, from[0], from[1]);
  fireEvent.mouseMove(window, { clientX: to[0], clientY: to[1] });
  fireEvent.mouseUp(window);
}

/** Every rectangle the UI shows must satisfy the R6 invariants. */
function expectInvariants(rect: CropRect, ratio: number) {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(IMG_W);
  expect(rect.y + rect.height).toBeLessThanOrEqual(IMG_H);
  expect(rect.width).toBeGreaterThanOrEqual(16);
  expect(rect.height).toBeGreaterThanOrEqual(16);
  expect(Math.abs(rect.height - rect.width / ratio)).toBeLessThanOrEqual(0.5);
}

// ---- entry, readout, chrome (R1, R10, R12, R20) ------------------------------

describe("crop stage entry and readout (R1, R10, R12, R20)", () => {
  it("opens with the default 71.7 × 94 mm target, the Fit rectangle and the readout", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();

    expect(readRect()).toEqual(DEFAULT_RECT);
    expect(readRect()).toEqual({ x: 0, y: 6, width: 480, height: 629 });
    // 480/71.7 = 6.69 px/mm; 629 × 480 of 640 × 480 pixels kept.
    expect(readout()).toHaveTextContent(
      "480 × 629 px · 98% of pixels kept · 71.7 × 94 mm · 6.7 px/mm (170 dpi)",
    );
    // No caution at ~6.7 px/mm (R11).
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(applyButton()).toBeEnabled();
  });

  it("marks the matching preset active and states the working-image cap (R4, R12)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();

    expect(screen.getByRole("button", { name: "71.7 × 94" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "100 × 100" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText(/capped at 2048 px on load/i)).toBeInTheDocument();
    expect(
      screen.getByText(/effective px\/mm can only go down/i),
    ).toBeInTheDocument();
  });

  it("shows the keyboard/mouse hints strip (R20)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    expect(
      screen.getByText(
        /Drag to move · Handles to resize · Arrows nudge \(Shift ×10\) · Scroll zoom · Space-drag pan · Esc cancel/,
      ),
    ).toBeInTheDocument();
  });

  it("posts NO worker request for any crop interaction (R21)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    fireEvent.click(screen.getByRole("button", { name: "100 × 100" }));
    fireEvent.click(screen.getByRole("button", { name: "Swap orientation" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    drag(canvas, [200, 200], [260, 260]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mocks.requestSpy).not.toHaveBeenCalled();
  });
});

// ---- millimetre inputs, presets, swap (R2–R5) --------------------------------

describe("target size: inputs, presets, swap (R2, R3, R4, R5)", () => {
  it("re-locks the rectangle to a typed ratio, keeping its centre", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    const before = readRect();
    const centreX = before.x + before.width / 2;
    const centreY = before.y + before.height / 2;

    fireEvent.change(screen.getByLabelText("Width (mm)"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Height (mm)"), {
      target: { value: "100" },
    });

    const after = readRect();
    expect(readout()).toHaveTextContent("100 × 100 mm");
    expect(after.width).toBe(after.height); // square target → square rect
    expectInvariants(after, 1);
    // The centre survives the re-lock as closely as the bounds allow.
    expect(Math.abs(after.x + after.width / 2 - centreX)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y + after.height / 2 - centreY)).toBeLessThanOrEqual(
      1,
    );
  });

  it("accepts a comma decimal separator", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    fireEvent.change(screen.getByLabelText("Width (mm)"), {
      target: { value: "35,85" },
    });
    expect(readout()).toHaveTextContent("35.85 × 94 mm");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an inline error, changes nothing and disables Apply on invalid input (R3)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    const before = readRect();

    fireEvent.change(screen.getByLabelText("Width (mm)"), {
      target: { value: "abc" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter 1–1000 mm/);
    expect(readRect()).toEqual(before); // rectangle untouched
    expect(readout()).toHaveTextContent("71.7 × 94 mm"); // target untouched
    expect(applyButton()).toBeDisabled();

    // Zero and out-of-range are equally inert.
    fireEvent.change(screen.getByLabelText("Width (mm)"), {
      target: { value: "0" },
    });
    expect(readRect()).toEqual(before);
    expect(applyButton()).toBeDisabled();

    // A valid value clears the error and re-enables Apply.
    fireEvent.change(screen.getByLabelText("Width (mm)"), {
      target: { value: "100" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(applyButton()).toBeEnabled();
  });

  it("applies each built-in preset with aria-pressed (R4)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();

    for (const [label, mm] of [
      ["100 × 100", "100 × 100 mm"],
      ["100 × 150", "100 × 150 mm"],
      ["105 × 148", "105 × 148 mm"],
      ["148 × 210", "148 × 210 mm"],
      ["120 × 160", "120 × 160 mm"],
      ["71.7 × 94", "71.7 × 94 mm"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(readout()).toHaveTextContent(mm);
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expectInvariants(readRect(), readRatio());
    }
  });

  it("swaps orientation and back (R5)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    const portrait = readRect();
    expect(portrait.height).toBeGreaterThan(portrait.width);

    fireEvent.click(screen.getByRole("button", { name: "Swap orientation" }));
    expect(readout()).toHaveTextContent("94 × 71.7 mm");
    const landscape = readRect();
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expectInvariants(landscape, 94 / 71.7);

    fireEvent.click(screen.getByRole("button", { name: "Swap orientation" }));
    expect(readout()).toHaveTextContent("71.7 × 94 mm");
    expect(readRect().height).toBeGreaterThan(readRect().width);
  });
});

/** The ratio currently shown by the readout, parsed back out of the mm text. */
function readRatio(): number {
  const text = readout().textContent ?? "";
  const match = /([\d.]+) × ([\d.]+) mm/.exec(text);
  if (!match) {
    throw new Error(`No mm values in readout: ${text}`);
  }
  return Number(match[1]) / Number(match[2]);
}

// ---- Fit / Fill / Reset (R9) -------------------------------------------------

describe("Fit / Fill / Reset (R9)", () => {
  it("Fit returns the largest centred rectangle", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    // Shrink from the SE handle first so Fit has something to restore.
    drag(canvas, [479, 634], [240, 300]);
    expect(readRect().width).toBeLessThan(DEFAULT_RECT.width);

    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(readRect()).toEqual(DEFAULT_RECT);
  });

  it("Fill grows the current framing to the maximum size around its centre", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    drag(canvas, [479, 634], [200, 260]); // shrink toward the top-left
    const small = readRect();
    expect(small.width).toBeLessThan(DEFAULT_RECT.width);

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    const filled = readRect();
    expect(filled.width).toBe(DEFAULT_RECT.width);
    expect(filled.height).toBe(DEFAULT_RECT.height);
    expectInvariants(filled, DEFAULT_RATIO);
  });

  it("Reset restores BOTH the entry target size and the Fit rectangle", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    fireEvent.click(screen.getByRole("button", { name: "100 × 100" }));
    drag(canvas, [200, 200], [120, 120]);
    expect(readout()).toHaveTextContent("100 × 100 mm");

    fireEvent.click(cropResetButton());
    expect(readout()).toHaveTextContent("71.7 × 94 mm");
    expect(readRect()).toEqual(DEFAULT_RECT);
  });
});

// ---- pointer interaction (R6, R7, R8, R17, R18) ------------------------------

describe("rectangle dragging (R6, R7, R8, R18)", () => {
  /** Shrink to a 240 × 315 rectangle at the origin via the SE handle. */
  function shrink(canvas: HTMLElement): CropRect {
    drag(canvas, [479, 634], [240, 300]);
    return readRect();
  }

  it("an interior drag translates the rectangle and clamps at the edges (R7)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    const small = shrink(canvas);
    expect(small).toEqual({ x: 0, y: 6, width: 240, height: 315 });

    drag(canvas, [100, 100], [150, 130]);
    expect(readRect()).toEqual({ x: 50, y: 36, width: 240, height: 315 });

    // Dragging far past the corner stops at the bounds instead of escaping.
    drag(canvas, [100, 100], [5000, 5000]);
    const clamped = readRect();
    expect(clamped.x + clamped.width).toBe(IMG_W);
    expect(clamped.y + clamped.height).toBe(IMG_H);
    expectInvariants(clamped, DEFAULT_RATIO);
  });

  it("a corner-handle drag resizes from the opposite corner, ratio locked (R8)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    const resized = shrink(canvas);
    // Anchor (the NW corner) fixed; the ratio held.
    expect(resized.x).toBe(0);
    expect(resized.y).toBe(6);
    expectInvariants(resized, DEFAULT_RATIO);
  });

  it("an edge-handle drag resizes about the perpendicular centre (R8)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    const before = readRect();
    const centreY = before.y + before.height / 2;

    drag(canvas, [0, 320], [100, 320]); // the W handle, dragged inward
    const after = readRect();
    expect(after.x + after.width).toBe(before.x + before.width); // right edge held
    expect(after.width).toBeLessThan(before.width);
    expect(Math.abs(after.y + after.height / 2 - centreY)).toBeLessThanOrEqual(
      1,
    );
    expectInvariants(after, DEFAULT_RATIO);
  });

  it("refuses to grow a handle past the image bounds (R6, R8)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    shrink(canvas);

    drag(canvas, [239, 320], [5000, 320]); // the E handle, dragged far out
    const grown = readRect();
    expect(grown.x + grown.width).toBeLessThanOrEqual(IMG_W);
    expect(grown.y + grown.height).toBeLessThanOrEqual(IMG_H);
    expectInvariants(grown, DEFAULT_RATIO);
  });

  it("a press in the object-contain letterbox starts NO drag (R18)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    const before = readRect();
    // A wide box letterboxes the portrait image: content spans x ∈ [240, 720).
    stubRect(canvas, 960, 640);

    drag(canvas, [10, 300], [300, 300]);
    expect(readRect()).toEqual(before);
  });

  it("a drag continued off the image CLAMPS instead of being lost (R18)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    shrink(canvas);
    drag(canvas, [100, 100], [150, 130]);
    expect(readRect().x).toBe(50);

    // Press inside, then leave the image far to the left/top.
    press(canvas, 100, 100);
    fireEvent.mouseMove(window, { clientX: -5000, clientY: -5000 });
    fireEvent.mouseUp(window);
    expect(readRect()).toEqual({ x: 0, y: 0, width: 240, height: 315 });
  });

  it("a press outside the rectangle starts no drag", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    const small = shrink(canvas); // 240 × 315 at the top-left
    drag(canvas, [400, 500], [420, 520]); // far outside it
    expect(readRect()).toEqual(small);
  });

  it("resolves a handle drag correctly under a zoomed, panned canvas box (R17, R18)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    shrink(canvas);
    // 2× zoom, panned 100 px left: image px = (client − left) / 2.
    stubRect(canvas, IMG_W * 2, IMG_H * 2, -100, 0);

    drag(canvas, [100, 200], [200, 260]); // image (100,100) → (150,130)
    expect(readRect()).toEqual({ x: 50, y: 36, width: 240, height: 315 });
  });
});

// ---- keyboard (R19, R14) -----------------------------------------------------

describe("keyboard map (R19, R14)", () => {
  it("nudges by 1 px with arrows and 10 px with Shift, clamped (R19)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    drag(canvas, [479, 634], [240, 300]); // 240 × 315 at (0, 6)

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(readRect().x).toBe(1);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(readRect().y).toBe(7);
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(readRect().x).toBe(11);
    fireEvent.keyDown(window, { key: "ArrowUp", shiftKey: true });
    expect(readRect().y).toBe(0); // clamped at the top edge
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
    expect(readRect().x).toBe(1);

    // A non-arrow key does nothing.
    const held = readRect();
    fireEvent.keyDown(window, { key: "q" });
    expect(readRect()).toEqual(held);
  });

  it("typing in a millimetre field never nudges the rectangle (R19)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    const before = readRect();

    const input = screen.getByLabelText("Width (mm)");
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(readRect()).toEqual(before);
  });

  it("Esc cancels the crop stage (R14)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    expect(
      screen.getByRole("heading", { name: "Crop workspace" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Crop workspace" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start crop" })).toBeEnabled();
  });

  it("Cancel leaves the stage with the image untouched (R14)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Crop workspace" })).toBeNull();
    expect(screen.getByText(/480 × 640 px/)).toBeInTheDocument();
  });
});

// ---- resolution warnings (R11) ----------------------------------------------

describe("resolution grading (R11)", () => {
  async function setTarget(widthMm: string, heightMm: string) {
    fireEvent.change(screen.getByLabelText("Width (mm)"), {
      target: { value: widthMm },
    });
    fireEvent.change(screen.getByLabelText("Height (mm)"), {
      target: { value: heightMm },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  }

  it("cautions below 5 px/mm without blocking Apply", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    await setTarget("150", "188");

    expect(readout()).toHaveTextContent("3.2 px/mm");
    expect(screen.getByRole("status")).toHaveTextContent(/may look soft/i);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(applyButton()).toBeEnabled();
  });

  it("warns harder below 2.5 px/mm, still without blocking Apply", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    await setTarget("400", "500");

    expect(readout()).toHaveTextContent("1.2 px/mm");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /visible detail will be lost/i,
    );
    expect(applyButton()).toBeEnabled();
  });
});

// ---- view controls (R17) -----------------------------------------------------

describe("zoom / pan / expand on the crop canvas (R17)", () => {
  const viewport = () => screen.getByTestId("crop-viewport");
  const transform = () => screen.getByTestId("crop-transform");

  it("scroll zooms toward the cursor and Expand enlarges the canvas area", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterCrop();
    stubRect(viewport(), 100, 100);
    expect(transform().style.transform).toContain("scale(1)");

    fireEvent.wheel(viewport(), { deltaY: -100, clientX: 50, clientY: 50 });
    expect(transform().style.transform).toContain("scale(1.25)");

    const expand = screen.getByRole("button", { name: "Expand" });
    expect(viewport().className).toContain("max-h-[60vh]");
    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-pressed", "true");
    expect(viewport().className).toContain("max-h-[85vh]");
  });

  it("Space-held left drag pans and does NOT move the crop rectangle", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    stubRect(viewport(), 100, 100);
    fireEvent.wheel(viewport(), { deltaY: -100, clientX: 50, clientY: 50 });
    const before = transform().style.transform;
    const rect = readRect();

    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.mouseDown(viewport(), { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 30, clientY: 40 });
    fireEvent.mouseUp(window);

    expect(transform().style.transform).not.toBe(before); // panned
    expect(readRect()).toEqual(rect); // the rectangle never moved
    fireEvent.keyUp(window, { code: "Space" });
  });

  it("a middle-button press pans instead of cropping", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterCrop();
    stubRect(viewport(), 100, 100);
    const rect = readRect();

    fireEvent.mouseDown(canvas, { button: 1, clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 260 });
    fireEvent.mouseUp(window);
    expect(readRect()).toEqual(rect);
  });
});
