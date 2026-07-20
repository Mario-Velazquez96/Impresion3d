import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Flatten-workspace interaction tests (12_flatten Phase A: R4, R5, R7, R8,
 * R10–R16, R20–R22, R25, R26). The suite renders the FULL island (the R21
 * pattern) so the workspace runs against the real stage/undo/counter wiring;
 * the worker hook is mocked with a synchronous flatten-core-backed fake and
 * the flatten canvas box is stubbed (jsdom's getBoundingClientRect is zeros).
 *
 * Sample image (2×2): black(0,0) black(1,0) white(0,1) red(1,1) — the flood
 * default tolerance (24) keeps all three colors apart, so a flood click on a
 * black pixel selects exactly the two connected black pixels.
 */

import { ImagePrep } from "@/components/image-prep/ImagePrep";
import type { DecodedImage } from "@/components/image-prep/decode";
import type {
  FlattenResult,
  MaskResult,
  WorkerRequestBody,
} from "@/components/image-prep/worker-messages";
import {
  addStrayIslands,
  applyFillToMask,
  colorAtPixel,
  floodMask,
  maskPixelCount,
  recolorExact,
  removeSmallRegions,
  smoothMask,
} from "@/lib/flatten-core";
import type { PixelBuffer, Rgb } from "@/lib/image-prep-core";

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

const grey = (v: number): Rgb => ({ r: v, g: v, b: v });

function buf(width: number, height: number, colors: Rgb[]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  colors.forEach((c, i) => {
    data[i * 4] = c.r;
    data[i * 4 + 1] = c.g;
    data[i * 4 + 2] = c.b;
    data[i * 4 + 3] = 255;
  });
  return { width, height, data };
}

const SAMPLE_PIXELS = [grey(0), grey(0), grey(255), { r: 200, g: 0, b: 0 }];

function decodedSample(): DecodedImage {
  return {
    pixels: buf(2, 2, SAMPLE_PIXELS),
    originalWidth: 2,
    originalHeight: 2,
    downscaled: false,
  };
}

/** Core-backed fake mirroring the worker for the ops the workspace uses. */
async function fakeRequest(
  body: WorkerRequestBody,
): Promise<MaskResult | FlattenResult> {
  if (body.op === "mask") {
    const src: PixelBuffer = {
      width: body.width,
      height: body.height,
      data: new Uint8ClampedArray(body.buffer),
    };
    const base =
      body.mode === "smooth"
        ? smoothMask(src, body.seedX, body.seedY, body.tolerance)
        : floodMask(src, body.seedX, body.seedY, body.tolerance);
    const mask = body.catchStrays
      ? addStrayIslands(
          src,
          base,
          colorAtPixel(src, body.seedX, body.seedY),
          body.tolerance,
        )
      : base;
    return {
      mask: mask.data.buffer as ArrayBuffer,
      count: maskPixelCount(mask),
    };
  }
  if (body.op === "flatten") {
    const src: PixelBuffer = {
      width: body.width,
      height: body.height,
      data: new Uint8ClampedArray(body.buffer),
    };
    let out: PixelBuffer;
    if (body.action.kind === "recolor") {
      out = recolorExact(src, body.action.from, body.action.to);
    } else if (body.action.kind === "removeSmall") {
      out = removeSmallRegions(src, body.action.maxRegionPx);
    } else {
      out = applyFillToMask(
        src,
        {
          width: body.width,
          height: body.height,
          data: new Uint8Array(body.action.mask),
        },
        body.action.fill,
      );
    }
    return {
      pixels: {
        width: out.width,
        height: out.height,
        buffer: out.data.buffer as ArrayBuffer,
      },
    };
  }
  throw new Error(`Unexpected op in workspace tests: ${body.op}`);
}

beforeEach(() => {
  mocks.busyRef.value = false;
  mocks.requestSpy.mockReset();
  mocks.requestSpy.mockImplementation(fakeRequest);
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
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    value: function (callback: BlobCallback) {
      callback(new Blob());
    },
    writable: true,
    configurable: true,
  });
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

// jsdom's getBoundingClientRect returns zeros; stub the flatten canvas box so
// the pure mapClickToPixel geometry (unit-tested separately) has real inputs.
function stubRect(canvas: HTMLElement, width: number, height: number) {
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

// jsdom performs no layout, so `offsetWidth/Height` (the UNTRANSFORMED content
// box the pan bounds are derived from) are always 0; stub them.
function stubLayout(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(el, "offsetHeight", {
    value: height,
    configurable: true,
  });
}

function makeFile(name: string): File {
  return new File([new Uint8Array(8)], name, { type: "image/png" });
}

/** Load the sample, enter the flatten stage, and stub the canvas box 1:1. */
async function enterFlatten(): Promise<HTMLElement> {
  fireEvent.change(screen.getByLabelText(/source image/i), {
    target: { files: [makeFile("sample.png")] },
  });
  await screen.findByText(/2 × 2 px/);
  fireEvent.click(screen.getByRole("button", { name: "Start flatten" }));
  const canvas = screen.getByLabelText("Flatten canvas");
  stubRect(canvas, 2, 2);
  await act(async () => {}); // let the workspace mount effects settle
  return canvas;
}

const overlay = () => screen.queryByTestId("flatten-overlay");
const undoButton = () => screen.getByRole("button", { name: "Undo" });
const counter = (n: number) => screen.getByText(`${n} regions flattened`);

/** The most recent `flatten` request body (hover mask calls filtered out). */
function lastFlattenBody(): WorkerRequestBody | undefined {
  const calls = mocks.requestSpy.mock.calls.filter(
    (call: unknown[]) => (call[0] as WorkerRequestBody).op === "flatten",
  );
  return calls[calls.length - 1]?.[0] as WorkerRequestBody | undefined;
}

/** Hover a pixel and wait for its hover mask to land (flood → worker). */
async function hover(canvas: HTMLElement, clientX: number, clientY: number) {
  fireEvent.mouseMove(canvas, { clientX, clientY });
  await act(async () => {}); // flush the background mask round trip
}

/** Flood-select the region under (x, y): hover it, then click it. */
async function selectAt(canvas: HTMLElement, clientX: number, clientY: number) {
  await hover(canvas, clientX, clientY);
  fireEvent.click(canvas, { clientX, clientY });
}

describe("hover mask preview (R4, R5, R26)", () => {
  it("shows the outline overlay via a BACKGROUND flood request and clears over the letterbox", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    expect(overlay()).toBeNull(); // nothing hovered yet

    await hover(canvas, 0.5, 0.5);
    expect(overlay()).toBeInTheDocument();
    // The hover mask was computed in the worker as a BACKGROUND request with
    // the current flood settings — never flipping the global busy state (R26).
    expect(mocks.requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        op: "mask",
        mode: "flood",
        tolerance: 24,
        catchStrays: false,
        seedX: 0,
        seedY: 0,
      }),
      { background: true },
    );
    expect(screen.queryByRole("status")).toBeNull();

    // A wide box letterboxes the square image: x ∈ [4, 6) is content, so a
    // pointer at x=0.5 sits in the margin and the hover mask clears (R24).
    stubRect(canvas, 10, 2);
    await hover(canvas, 0.5, 1);
    expect(overlay()).toBeNull();
  });

  it("clears the outline when the pointer leaves the canvas", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await hover(canvas, 0.5, 0.5);
    expect(overlay()).toBeInTheDocument();

    fireEvent.mouseLeave(canvas);
    await act(async () => {});
    expect(overlay()).toBeNull();
  });
});

describe("selection add / remove / clear (R10, R11, R12)", () => {
  it("click adds the hovered flood region and shows the union px count", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();

    await selectAt(canvas, 0.5, 0.5); // the 2-px connected black region
    expect(await screen.findByText("2 px selected")).toBeInTheDocument();

    // Adding the 1-px white region grows the union to 3.
    await selectAt(canvas, 0.5, 1.5);
    expect(await screen.findByText("3 px selected")).toBeInTheDocument();
  });

  it("clicking a selected pixel removes exactly that region (R11)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAt(canvas, 0.5, 0.5);
    await selectAt(canvas, 0.5, 1.5);
    await screen.findByText("3 px selected");

    // (1,0) belongs to the black region → that region goes, white stays.
    fireEvent.click(canvas, { clientX: 1.5, clientY: 0.5 });
    expect(await screen.findByText("1 px selected")).toBeInTheDocument();
  });

  it("Esc empties the selection without touching the image (R12)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAt(canvas, 0.5, 0.5);
    await screen.findByText("2 px selected");
    const calls = mocks.requestSpy.mock.calls.filter(
      (call: unknown[]) => (call[0] as WorkerRequestBody).op === "flatten",
    ).length;

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(/px selected/)).toBeNull());
    expect(
      mocks.requestSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as WorkerRequestBody).op === "flatten",
      ).length,
    ).toBe(calls);
  });

  it("Clear empties the selection (R12)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAt(canvas, 0.5, 0.5);
    await screen.findByText("2 px selected");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(screen.queryByText(/px selected/)).toBeNull());
  });
});

describe("W/S sizing (R8)", () => {
  it("steps the flood tolerance, clamps at both ends, and refreshes the hover", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    expect(screen.getByText("Tolerance: 24")).toBeInTheDocument();
    expect(screen.getByText("W grow · S shrink")).toBeInTheDocument();

    await hover(canvas, 0.5, 0.5);
    fireEvent.keyDown(window, { key: "w" });
    expect(screen.getByText("Tolerance: 28")).toBeInTheDocument();
    // The hover preview recomputes with the new tolerance (R4 + R8).
    await act(async () => {});
    expect(mocks.requestSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ op: "mask", tolerance: 28 }),
      { background: true },
    );

    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByText("Tolerance: 24")).toBeInTheDocument();

    // Clamp at the top (150) and the bottom (0).
    for (let i = 0; i < 40; i++) {
      fireEvent.keyDown(window, { key: "W" });
    }
    expect(screen.getByText("Tolerance: 150")).toBeInTheDocument();
    for (let i = 0; i < 50; i++) {
      fireEvent.keyDown(window, { key: "S" });
    }
    expect(screen.getByText("Tolerance: 0")).toBeInTheDocument();
  });

  it("steps the brush radius in brush mode, clamping at the minimum", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterFlatten();
    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    expect(screen.getByText("Brush radius: 8")).toBeInTheDocument();

    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(window, { key: "s" });
    }
    expect(screen.getByText("Brush radius: 1")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByText("Brush radius: 1")).toBeInTheDocument(); // clamped
    fireEvent.keyDown(window, { key: "w" });
    expect(screen.getByText("Brush radius: 3")).toBeInTheDocument();
  });
});

describe("brush selection (R7)", () => {
  it("a brush click selects the clipped circle without any worker mask call", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    const maskCalls = mocks.requestSpy.mock.calls.filter(
      (call: unknown[]) => (call[0] as WorkerRequestBody).op === "mask",
    ).length;

    // Radius 8 at (0,0) covers the whole 2×2 image — brush is main-thread.
    fireEvent.click(canvas, { clientX: 0.5, clientY: 0.5 });
    expect(await screen.findByText("4 px selected")).toBeInTheDocument();
    expect(
      mocks.requestSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as WorkerRequestBody).op === "mask",
      ).length,
    ).toBe(maskCalls);
  });
});

describe("fill panel (R13, R14, R15)", () => {
  /** Brush-select the whole 2×2 image: black×2, white×1, red×1. */
  async function selectAll(canvas: HTMLElement) {
    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    fireEvent.click(canvas, { clientX: 0.5, clientY: 0.5 });
    await screen.findByText("4 px selected");
  }

  it("shows the suggested color with % of selection plus ordered runner-ups", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAll(canvas);

    // Most common: black (2 of 4 px). Runner-ups by first appearance: white
    // (index 2) before red (index 3).
    const suggested = screen.getByRole("button", {
      name: "Use suggested #000000",
    });
    expect(suggested).toHaveTextContent("50.0% of selection");
    expect(
      screen.getByRole("button", { name: "Use #ffffff" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use #c80000" }),
    ).toBeInTheDocument();
    // The chosen fill starts at the suggested color (R13).
    expect(screen.getByText(/Fill with/)).toHaveTextContent("#000000");
  });

  it("clicking a runner-up sets the chosen fill (R14)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAll(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Use #ffffff" }));
    expect(screen.getByText(/Fill with/)).toHaveTextContent("#ffffff");
  });

  it("a valid typed hex becomes the fill; invalid shows an alert and changes nothing (R14)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAll(canvas);

    const input = screen.getByLabelText("Hex color");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/hex color/i);
    expect(screen.getByText(/Fill with/)).toHaveTextContent("#000000");

    fireEvent.change(input, { target: { value: "#0f0" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Fill with/)).toHaveTextContent("#00ff00");
  });

  it("Pick sets the fill from the clicked pixel WITHOUT altering the selection (R15)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAll(canvas);

    const pick = screen.getByRole("button", { name: "Pick" });
    expect(pick).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pick);
    expect(pick).toHaveAttribute("aria-pressed", "true");
    expect(canvas.className).toContain("cursor-crosshair");

    // Picking the red pixel: fill changes, selection count does not.
    fireEvent.click(canvas, { clientX: 1.5, clientY: 1.5 });
    expect(screen.getByText(/Fill with/)).toHaveTextContent("#c80000");
    expect(screen.getByText("4 px selected")).toBeInTheDocument();

    // Pick mode stays on for repeated picking; picking white swaps the fill.
    fireEvent.click(canvas, { clientX: 0.5, clientY: 1.5 });
    expect(screen.getByText(/Fill with/)).toHaveTextContent("#ffffff");
  });
});

describe("flatten selection + counter (R16, R22, R26)", () => {
  it("the button collapses the selection to the fill and bumps the counter by the REGION count", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    // Two separate flood regions: black (2 px) + white (1 px).
    await selectAt(canvas, 0.5, 0.5);
    await selectAt(canvas, 0.5, 1.5);
    await screen.findByText("3 px selected");

    fireEvent.click(screen.getByRole("button", { name: "Flatten selection" }));
    await waitFor(() => expect(counter(2)).toBeInTheDocument());
    await act(async () => {}); // let the selection-clear effect settle
    // The mutation went through the worker as a FOREGROUND fill (R26).
    expect(lastFlattenBody()).toEqual(
      expect.objectContaining({
        op: "flatten",
        action: expect.objectContaining({
          kind: "fill",
          fill: { r: 0, g: 0, b: 0 }, // suggested: black (2 of 3 px)
        }),
      }),
    );
    // The selection cleared with the image replacement (R12).
    expect(screen.queryByText(/px selected/)).toBeNull();
    expect(undoButton()).toBeEnabled();
  });

  it("Enter flattens too, using the chosen (typed) fill (R16)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAt(canvas, 0.5, 0.5);
    await screen.findByText("2 px selected");
    fireEvent.change(screen.getByLabelText("Hex color"), {
      target: { value: "#00ff00" },
    });

    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(counter(1)).toBeInTheDocument());
    expect(lastFlattenBody()).toEqual(
      expect.objectContaining({
        op: "flatten",
        action: expect.objectContaining({ fill: { r: 0, g: 255, b: 0 } }),
      }),
    );
  });
});

describe("flatten undo + reset (R20, R21, R22)", () => {
  /** One flood flatten of the region at (x, y); resolves when it lands. */
  async function flattenRegionAt(
    canvas: HTMLElement,
    clientX: number,
    clientY: number,
    expectedCounter: number,
  ) {
    await selectAt(canvas, clientX, clientY);
    await screen.findByText(/px selected/);
    fireEvent.click(screen.getByRole("button", { name: "Flatten selection" }));
    await waitFor(() => expect(counter(expectedCounter)).toBeInTheDocument());
    await act(async () => {}); // let the selection-clear effect settle
  }

  it("Z walks back to the baseline restoring pixels AND counter, then disables", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await flattenRegionAt(canvas, 0.5, 0.5, 1); // black region → black fill
    await flattenRegionAt(canvas, 0.5, 1.5, 2); // white pixel → white fill
    const callsBeforeUndo = mocks.requestSpy.mock.calls.length;

    fireEvent.keyDown(window, { key: "z" });
    await waitFor(() => expect(counter(1)).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "z" });
    await waitFor(() => expect(counter(0)).toBeInTheDocument());
    expect(undoButton()).toBeDisabled(); // back at the baseline

    // Undo is a PURE client pop — no worker traffic (R20). Hover requests
    // are filtered out (the pointer state is untouched here anyway).
    expect(
      mocks.requestSpy.mock.calls
        .slice(callsBeforeUndo)
        .filter((call: unknown[]) => (call[0] as WorkerRequestBody).op === "flatten").length,
    ).toBe(0);

    // Back at the baseline the original white pixel is restorable again: the
    // white region flood-selects as 1 px exactly as at entry.
    await selectAt(canvas, 0.5, 1.5);
    expect(await screen.findByText("1 px selected")).toBeInTheDocument();
  });

  it("typing z in the hex input does NOT undo (R20)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await flattenRegionAt(canvas, 0.5, 0.5, 1);
    await selectAt(canvas, 0.5, 1.5);
    await screen.findByText("1 px selected");

    fireEvent.keyDown(screen.getByLabelText("Hex color"), { key: "z" });
    expect(counter(1)).toBeInTheDocument(); // unchanged
    expect(undoButton()).toBeEnabled();
  });

  it("disables Undo while the worker is busy (R20, R26)", async () => {
    const view = render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await flattenRegionAt(canvas, 0.5, 0.5, 1);
    expect(undoButton()).toBeEnabled();

    mocks.busyRef.value = true;
    view.rerender(<ImagePrep catalogColors={[]} />);
    expect(undoButton()).toBeDisabled();
  });

  it("Reset all restores the entry snapshot and counter 0 even past the history cap (R21)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));

    // 13 brush flattens (> MAX_FLATTEN_HISTORY = 12) drop the baseline from
    // the capped stack; Reset must still restore the entry snapshot.
    for (let i = 1; i <= 13; i++) {
      fireEvent.click(canvas, { clientX: 0.5, clientY: 0.5 });
      await screen.findByText("4 px selected");
      fireEvent.click(
        screen.getByRole("button", { name: "Flatten selection" }),
      );
      await waitFor(() => expect(counter(i)).toBeInTheDocument());
      await act(async () => {}); // let the selection-clear effect settle
    }

    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    await waitFor(() => expect(counter(0)).toBeInTheDocument());
    expect(undoButton()).toBeDisabled(); // history reseeded to the baseline

    // The ORIGINAL image is back: a FLOOD click on (0,0) selects the 2-px
    // black region again — on the flattened all-black image it would take
    // all 4 px, so the count proves the pixels were restored.
    fireEvent.click(screen.getByRole("radio", { name: "Flood" }));
    await selectAt(canvas, 0.5, 0.5);
    expect(await screen.findByText("2 px selected")).toBeInTheDocument();
  });
});

describe("workspace chrome (R25, R26)", () => {
  it("shows the keyboard-hints strip (R25)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterFlatten();
    expect(
      screen.getByText(
        /Click add region · Click selected = remove · W\/S resize · Enter flatten · Esc clear · Scroll zoom · Z undo/,
      ),
    ).toBeInTheDocument();
  });

  it("disables the mutation controls while busy (R26)", async () => {
    const view = render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    fireEvent.click(canvas, { clientX: 0.5, clientY: 0.5 });
    await screen.findByText("4 px selected");

    mocks.busyRef.value = true;
    view.rerender(<ImagePrep catalogColors={[]} />);
    expect(
      screen.getByRole("button", { name: "Flatten selection" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exit flatten" })).toBeDisabled();
  });

  it("surfaces a user-safe error when a flatten mutation fails (R26)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    fireEvent.click(canvas, { clientX: 0.5, clientY: 0.5 });
    await screen.findByText("4 px selected");

    mocks.requestSpy.mockRejectedValueOnce(new Error("worker exploded"));
    fireEvent.click(screen.getByRole("button", { name: "Flatten selection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /flattening the selection failed/i,
    );
    // Nothing changed: counter still 0 and the selection survives.
    expect(counter(0)).toBeInTheDocument();
    expect(screen.getByText("4 px selected")).toBeInTheDocument();
  });
});

// ---- Phase B (R6, R9, R17) --------------------------------------------------

const catchStraysBox = () =>
  screen.queryByRole("checkbox", { name: "Catch stray pixels" });

/** The last `mask` request body (hover calls carry the mode/strays settings). */
function lastMaskBody(): WorkerRequestBody | undefined {
  const calls = mocks.requestSpy.mock.calls.filter(
    (call: unknown[]) => (call[0] as WorkerRequestBody).op === "mask",
  );
  return calls[calls.length - 1]?.[0] as WorkerRequestBody | undefined;
}

describe("smooth mode (R6, R8)", () => {
  it("is selectable with its own W/S-stepped tolerance, independent of flood", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();

    fireEvent.click(screen.getByRole("radio", { name: "Smooth" }));
    // Smooth starts at its own default (10), independent of the flood 24.
    expect(screen.getByText("Tolerance: 10")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "w" });
    expect(screen.getByText("Tolerance: 14")).toBeInTheDocument();

    // The hover recomputes with mode "smooth" and the smooth tolerance (R4).
    await hover(canvas, 0.5, 0.5);
    expect(lastMaskBody()).toEqual(
      expect.objectContaining({ op: "mask", mode: "smooth", tolerance: 14 }),
    );

    // Flood keeps its own 24; switching back to smooth restores the stepped 14.
    fireEvent.click(screen.getByRole("radio", { name: "Flood" }));
    expect(screen.getByText("Tolerance: 24")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Smooth" }));
    expect(screen.getByText("Tolerance: 14")).toBeInTheDocument();
    await act(async () => {}); // flush the hover re-issue from the mode switches
  });
});

describe("catch stray pixels (R9)", () => {
  it("shows the checkbox for flood/smooth only and rides its value on the mask request", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();

    // Off by default; the hover request carries catchStrays: false.
    const box = catchStraysBox();
    expect(box).not.toBeNull();
    expect(box).not.toBeChecked();
    await hover(canvas, 0.5, 0.5);
    expect(lastMaskBody()).toEqual(
      expect.objectContaining({ op: "mask", catchStrays: false }),
    );

    // Enabling it re-issues the hover with catchStrays: true.
    fireEvent.click(box!);
    await hover(canvas, 1.5, 0.5);
    expect(lastMaskBody()).toEqual(
      expect.objectContaining({ op: "mask", catchStrays: true }),
    );

    // The checkbox is available in smooth mode too, but not in brush.
    fireEvent.click(screen.getByRole("radio", { name: "Smooth" }));
    expect(catchStraysBox()).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    expect(catchStraysBox()).toBeNull();
    await act(async () => {}); // flush the hover re-issue from the mode switches
  });
});

describe("recolor every match (R17, R20, R22)", () => {
  /** 3×1 stripe: black | white | black — the two blacks are disconnected. */
  function decodedStripe(): DecodedImage {
    return {
      pixels: buf(3, 1, [grey(0), grey(255), grey(0)]),
      originalWidth: 3,
      originalHeight: 1,
      downscaled: false,
    };
  }

  async function enterStripe(): Promise<HTMLElement> {
    mocks.decodeSpy.mockImplementation(async () => decodedStripe());
    fireEvent.change(screen.getByLabelText(/source image/i), {
      target: { files: [makeFile("stripe.png")] },
    });
    await screen.findByText(/3 × 1 px/);
    fireEvent.click(screen.getByRole("button", { name: "Start flatten" }));
    const canvas = screen.getByLabelText("Flatten canvas");
    stubRect(canvas, 3, 1);
    await act(async () => {});
    return canvas;
  }

  it("is disabled at the suggested fill, enabled after choosing another, and swaps every match", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterStripe();

    // Flood-select the LEFT black pixel only — the right black stays outside.
    await selectAt(canvas, 0.5, 0.5);
    await screen.findByText("1 px selected");

    const recolor = screen.getByRole("button", {
      name: "Recolor every match",
    });
    expect(recolor).toBeDisabled(); // chosen fill == suggested (black)

    fireEvent.change(screen.getByLabelText("Hex color"), {
      target: { value: "#00ff00" },
    });
    expect(screen.getByText(/Fill with/)).toHaveTextContent("#00ff00");
    expect(recolor).toBeEnabled();

    fireEvent.click(recolor);
    // Selection clears, the counter is UNCHANGED (recolor collapses no region).
    await waitFor(() => expect(screen.queryByText(/px selected/)).toBeNull());
    expect(counter(0)).toBeInTheDocument();
    expect(undoButton()).toBeEnabled();
    expect(lastFlattenBody()).toEqual(
      expect.objectContaining({
        op: "flatten",
        action: expect.objectContaining({
          kind: "recolor",
          from: { r: 0, g: 0, b: 0 },
          to: { r: 0, g: 255, b: 0 },
        }),
      }),
    );

    // The RIGHT black pixel (outside the original selection) is now green.
    await selectAt(canvas, 2.5, 0.5);
    await screen.findByText("1 px selected");
    expect(
      screen.getByRole("button", { name: "Use suggested #00ff00" }),
    ).toBeInTheDocument();

    // Undo reverts the recolor (pixels back to black), counter still 0.
    fireEvent.keyDown(window, { key: "z" });
    await waitFor(() => expect(undoButton()).toBeDisabled());
    expect(counter(0)).toBeInTheDocument();
    await selectAt(canvas, 2.5, 0.5);
    await screen.findByText("1 px selected");
    expect(
      screen.getByRole("button", { name: "Use suggested #000000" }),
    ).toBeInTheDocument();
  });
});

// ---- Phase C (R18, R19, R23, R24) -------------------------------------------

const viewport = () => screen.getByTestId("flatten-viewport");
const transform = () => screen.getByTestId("flatten-transform");

describe("auto-flatten presets + despeckle (R18, R19, R20, R22)", () => {
  it("sends removeSmall with each preset/Despeckle threshold, undoable, counter unchanged", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterFlatten();

    const cases: [string, number][] = [
      ["Low", 8],
      ["Medium", 32],
      ["High", 128],
      ["Despeckle", 2],
    ];
    for (const [label, maxRegionPx] of cases) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await act(async () => {}); // flush the worker round trip
      expect(lastFlattenBody()).toEqual(
        expect.objectContaining({
          op: "flatten",
          action: { kind: "removeSmall", maxRegionPx },
        }),
      );
      // Cleanup collapses no region: the counter never moves off 0.
      expect(counter(0)).toBeInTheDocument();
    }

    // The four cleanups pushed undo history; Z walks back and re-disables Undo.
    expect(undoButton()).toBeEnabled();
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(window, { key: "z" });
    }
    await waitFor(() => expect(undoButton()).toBeDisabled());
  });

  it("clears the selection when a cleanup replaces the image (R12)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    await selectAt(canvas, 0.5, 0.5);
    await screen.findByText("2 px selected");

    fireEvent.click(screen.getByRole("button", { name: "Despeckle" }));
    await waitFor(() => expect(screen.queryByText(/px selected/)).toBeNull());
  });

  it("disables the preset + Despeckle buttons while busy (R26)", async () => {
    const view = render(<ImagePrep catalogColors={[]} />);
    await enterFlatten();
    mocks.busyRef.value = true;
    view.rerender(<ImagePrep catalogColors={[]} />);
    for (const label of ["Low", "Medium", "High", "Despeckle"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });
});

describe("zoom / pan / expand (R23, R24)", () => {
  it("scroll wheel zooms the transform toward the cursor without scrolling", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterFlatten();
    stubRect(viewport(), 100, 100);
    expect(transform().style.transform).toContain("scale(1)");

    fireEvent.wheel(viewport(), { deltaY: -100, clientX: 50, clientY: 50 });
    expect(transform().style.transform).toContain("scale(1.25)");

    // Scrolling back out returns toward the identity view.
    fireEvent.wheel(viewport(), { deltaY: 100, clientX: 50, clientY: 50 });
    expect(transform().style.transform).toContain("scale(1)");
  });

  it("middle-button drag pans the zoomed view", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterFlatten();
    stubRect(viewport(), 100, 100);
    fireEvent.wheel(viewport(), { deltaY: -100, clientX: 50, clientY: 50 });
    const zoomedOnly = transform().style.transform;

    fireEvent.mouseDown(viewport(), { button: 1, clientX: 50, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 60, clientY: 55 });
    fireEvent.mouseUp(window);
    expect(transform().style.transform).not.toBe(zoomedOnly); // panned
    expect(transform().style.transform).toContain("scale(1.25)");
  });

  it("Space-held left drag pans and suppresses the selecting click (R23)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    stubRect(viewport(), 100, 100);
    stubRect(canvas, 2, 2);
    fireEvent.wheel(viewport(), { deltaY: -100, clientX: 50, clientY: 50 });
    const before = transform().style.transform;

    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.mouseDown(viewport(), { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 30, clientY: 40 });
    fireEvent.mouseUp(window);
    expect(transform().style.transform).not.toBe(before); // panned

    // A click while Space is still held must NOT add a selection region.
    fireEvent.click(canvas, { clientX: 0.5, clientY: 0.5 });
    expect(screen.queryByText(/px selected/)).toBeNull();
    fireEvent.keyUp(window, { code: "Space" });
  });

  it("Expand toggles the enlarged viewport (R23)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await enterFlatten();
    const expand = screen.getByRole("button", { name: "Expand" });
    expect(expand).toHaveAttribute("aria-pressed", "false");
    expect(viewport().className).toContain("max-h-[60vh]");

    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-pressed", "true");
    expect(viewport().className).toContain("max-h-[85vh]");
  });

  it("fits the whole image in the viewport at zoom 1 and follows Expand (R23)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    // The canvas is capped by the SAME height as the viewport, so a tall image
    // is fitted rather than overflowing the clipped box.
    expect(canvas.className).toContain("max-h-[60vh]");
    expect(canvas.className).toContain("object-contain");

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(canvas.className).toContain("max-h-[85vh]");
    expect(viewport().className).toContain("max-h-[85vh]");
  });

  it("pans at zoom 1 when the content overflows the viewport (regression)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    stubRect(viewport(), 100, 100);
    // Layout size of the content: 400×900 inside a 100×100 box — the reported
    // bug's shape (bottom clipped and previously unreachable at zoom 1).
    stubLayout(canvas, 400, 900);
    // Expand re-runs the measurement effect so the stub is picked up.
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(transform().style.transform).toContain("scale(1)");

    fireEvent.mouseDown(viewport(), { button: 1, clientX: 50, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(window);
    // Dragged up 40px at zoom 1: the view moved, revealing the bottom.
    expect(transform().style.transform).toContain("translate(0px, -40px)");
    expect(transform().style.transform).toContain("scale(1)");
  });

  it("resolves clicks to the correct pixel under a zoomed canvas box (R24)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    const canvas = await enterFlatten();
    // Simulate a 2× zoom: the 2×2 image's canvas box measures 4×4 on screen.
    // A click at (1,1) still maps to image pixel (0,0) — the black region.
    stubRect(canvas, 4, 4);
    await selectAt(canvas, 1, 1);
    expect(await screen.findByText("2 px selected")).toBeInTheDocument();
  });
});
