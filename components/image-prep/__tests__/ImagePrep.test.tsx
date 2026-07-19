import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Client-island tests for 11_image_prep (R2–R18). The worker hook is mocked
 * with a SYNCHRONOUS fake that calls the pure core directly — behaviorally
 * equivalent to the real worker, which is logic-free by design (deserialize →
 * core → serialize; see design.md). The DOM decode glue is mocked too (jsdom
 * has no 2D context); the real worker + decode path is exercised by E2E.
 */

import { ImagePrep } from "@/components/image-prep/ImagePrep";
import type { DecodedImage } from "@/components/image-prep/decode";
import {
  deserializeIndexedImage,
  serializeIndexedImage,
  type AdjustResult,
  type PipelineResult,
  type WorkerRequestBody,
} from "@/components/image-prep/worker-messages";
import {
  MAX_FILE_BYTES,
  applyAdjustments,
  indexedToPixels,
  luminanceHistogram,
  mergeEntriesToAverage,
  mergeManyEntries,
  mergeSimilar,
  mergeTiny,
  quantize,
  snapToCatalog,
  type IndexedImage,
  type PixelBuffer,
  type Rgb,
} from "@/lib/image-prep-core";

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

// 2×2: two black, one white, one red → quantizes to exactly those 3 colors
// (black 50.0%, white 25.0%, red #c80000 25.0%).
const SAMPLE_PIXELS = [grey(0), grey(0), grey(255), { r: 200, g: 0, b: 0 }];

function decodedSample(): DecodedImage {
  return {
    pixels: buf(2, 2, SAMPLE_PIXELS),
    originalWidth: 2,
    originalHeight: 2,
    downscaled: false,
  };
}

function pipelineResult(image: IndexedImage): PipelineResult {
  const preview = indexedToPixels(image);
  return {
    image: serializeIndexedImage(image),
    preview: {
      width: preview.width,
      height: preview.height,
      buffer: preview.data.buffer as ArrayBuffer,
    },
  };
}

/** The synchronous, core-backed stand-in for the real (logic-free) worker. */
async function fakeRequest(
  body: WorkerRequestBody,
): Promise<AdjustResult | PipelineResult> {
  if (body.op === "adjust") {
    const src: PixelBuffer = {
      width: body.width,
      height: body.height,
      data: new Uint8ClampedArray(body.buffer),
    };
    const adjusted = applyAdjustments(src, body.settings);
    return {
      pixels: {
        width: adjusted.width,
        height: adjusted.height,
        buffer: adjusted.data.buffer as ArrayBuffer,
      },
      histogram: luminanceHistogram(adjusted).buffer as ArrayBuffer,
    };
  }
  if (body.op === "quantize") {
    const src: PixelBuffer = {
      width: body.width,
      height: body.height,
      data: new Uint8ClampedArray(body.buffer),
    };
    return pipelineResult(quantize(src, body.colors, body.dither));
  }
  const image = deserializeIndexedImage(body.image);
  const action = body.action;
  const next =
    action.kind === "mergeMany"
      ? mergeManyEntries(image, action.from, action.into)
      : action.kind === "mergeAverage"
        ? mergeEntriesToAverage(image, action.indices)
        : action.kind === "mergeSimilar"
          ? mergeSimilar(image, action.threshold)
          : action.kind === "mergeTiny"
            ? mergeTiny(image, action.coveragePercent)
            : snapToCatalog(image, action.catalog);
  return pipelineResult(next);
}

function makeFile(name: string, type: string, size?: number): File {
  const file = new File([new Uint8Array(8)], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, "size", { value: size });
  }
  return file;
}

const CATALOG = [
  { id: "negro", name: "Negro", hex: "#000000" },
  { id: "blanco", name: "Blanco", hex: "#ffffff" },
  { id: "rojo", name: "Rojo", hex: "#ff0000" },
];

// jsdom has no 2D context/toBlob/object URLs — quiet, workable fakes so the
// preview effects and Download run (asserted where relevant).
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

async function loadSample(name = "sample.png") {
  fireEvent.change(screen.getByLabelText(/source image/i), {
    target: { files: [makeFile(name, "image/png")] },
  });
  await screen.findByText(/2 × 2 px/);
}

async function posterize() {
  fireEvent.click(screen.getByRole("button", { name: "Posterize" }));
  await screen.findByRole("heading", { name: "Palette" });
  // Let the island's selection-reset effect (keyed on the new palette) settle
  // before tests start toggling swatches, so it cannot wipe a fresh selection.
  await act(async () => {});
}

const paletteEntry = (hex: string) =>
  screen.getByRole("button", { name: new RegExp(hex) });

/**
 * Select the given source swatches plus the target, then merge them via the
 * action bar's "Merge into one of them…" chooser (R22). The survivor keeps
 * its color/catalog, so downstream assertions match the old tap-two merges.
 */
async function mergeSelectionInto(sourceHexes: string[], targetHex: string) {
  // Settle any pending selection-reset effect from a palette that just landed.
  await act(async () => {});
  for (const hex of [...sourceHexes, targetHex]) {
    fireEvent.click(paletteEntry(hex));
  }
  await screen.findByText(`${sourceHexes.length + 1} selected`);
  fireEvent.click(
    screen.getByRole("button", { name: "Merge into one of them…" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(`^Merge into (.+ )?${targetHex}$`),
    }),
  );
}

describe("upload path (R2, R3, R4)", () => {
  it("shows dimensions and formatted size for a valid PNG", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    expect(screen.getByText("2 × 2 px · 8 B")).toBeInTheDocument();
    expect(mocks.decodeSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-image type with an alert, leaving prior state intact", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    fireEvent.change(screen.getByLabelText(/source image/i), {
      target: { files: [makeFile("notes.txt", "text/plain")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not supported/i,
    );
    expect(screen.getByText(/2 × 2 px/)).toBeInTheDocument(); // prior image kept
    expect(mocks.decodeSpy).toHaveBeenCalledTimes(1); // guard ran BEFORE decode
  });

  it("rejects an oversize file before decoding", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    fireEvent.change(screen.getByLabelText(/source image/i), {
      target: {
        files: [makeFile("big.png", "image/png", MAX_FILE_BYTES + 1)],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/too large/i);
    expect(mocks.decodeSpy).not.toHaveBeenCalled();
  });

  it("surfaces a decode failure without crashing", async () => {
    mocks.decodeSpy.mockRejectedValue(new Error("bad bytes"));
    render(<ImagePrep catalogColors={CATALOG} />);
    fireEvent.change(screen.getByLabelText(/source image/i), {
      target: { files: [makeFile("broken.png", "image/png")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be decoded/i,
    );
  });

  it("shows the downscale notice with original and working dimensions (R4)", async () => {
    mocks.decodeSpy.mockImplementation(async () => ({
      pixels: buf(2, 1, [grey(0), grey(255)]),
      originalWidth: 4096,
      originalHeight: 2048,
      downscaled: true,
    }));
    render(<ImagePrep catalogColors={CATALOG} />);
    fireEvent.change(screen.getByLabelText(/source image/i), {
      target: { files: [makeFile("huge.png", "image/png")] },
    });
    expect(
      await screen.findByText(/downscaled from 4096 × 2048/i),
    ).toBeInTheDocument();
  });
});

describe("adjust stage (R5, R6, R18)", () => {
  it("recomputes ONLY on Apply, then renders the histogram", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();

    fireEvent.change(screen.getByLabelText("Brightness"), {
      target: { value: "40" },
    });
    expect(mocks.requestSpy).not.toHaveBeenCalled(); // slider alone = no work

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByTestId("luminance-histogram")).toBeInTheDocument();
    expect(mocks.requestSpy).toHaveBeenCalledTimes(1);
    expect(mocks.requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        op: "adjust",
        settings: expect.objectContaining({ brightness: 40, autoLevels: false }),
      }),
    );
  });

  it("disables the action controls while the worker is busy (R18)", async () => {
    const view = render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    mocks.busyRef.value = true;
    // Re-render the island so it reads the new (in-flight) busy value.
    view.rerender(<ImagePrep catalogColors={CATALOG} />);

    expect(screen.getByRole("status")).toHaveTextContent(/processing/i);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Posterize" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Snap to filaments" }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/source image/i)).toBeDisabled();
  });

  it("shows a user-safe error when a worker operation fails", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    mocks.requestSpy.mockRejectedValue(new Error("worker exploded"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /adjusting the image failed/i,
    );
  });
});

describe("posterize stage (R7, R8, R9)", () => {
  it("has slider bounds 2–64 defaulting to 8 and dithering off by default", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    const slider = screen.getByLabelText("Colors");
    expect(slider).toHaveAttribute("min", "2");
    expect(slider).toHaveAttribute("max", "64");
    expect(slider).toHaveValue("8");
    expect(
      screen.getByLabelText(/dithering \(floyd–steinberg\)/i),
    ).not.toBeChecked();
    // No image yet → posterize is disabled.
    expect(screen.getByRole("button", { name: "Posterize" })).toBeDisabled();
  });

  it("sends { colors, dither } and renders the classified palette with coverage", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    expect(mocks.requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ op: "quantize", colors: 8, dither: false }),
    );
    // Neutrals: white (light) then black (dark); colors: red.
    expect(paletteEntry("#ffffff")).toHaveTextContent("25.0%");
    expect(paletteEntry("#000000")).toHaveTextContent("50.0%");
    expect(paletteEntry("#c80000")).toHaveTextContent("25.0%");
  });

  it("passes a changed color count and dither flag through", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    fireEvent.change(screen.getByLabelText("Colors"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByLabelText(/dithering/i));
    await posterize();
    expect(mocks.requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ op: "quantize", colors: 2, dither: true }),
    );
  });
});

describe("palette multi-select + merges (R10, R22, and R11–R14)", () => {
  it("tapping swatches toggles a multi-selection without issuing any merge", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    const callsAfterQuantize = mocks.requestSpy.mock.calls.length;

    fireEvent.click(paletteEntry("#c80000"));
    expect(paletteEntry("#c80000")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    // A second tap on ANOTHER entry accumulates instead of merging.
    fireEvent.click(paletteEntry("#000000"));
    expect(paletteEntry("#000000")).toHaveAttribute("aria-pressed", "true");
    expect(paletteEntry("#c80000")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // Re-tapping a selected entry toggles it back out.
    fireEvent.click(paletteEntry("#c80000"));
    expect(paletteEntry("#c80000")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    expect(mocks.requestSpy.mock.calls.length).toBe(callsAfterQuantize);
  });

  it("enables the merge actions only at ≥2 selected; Clear empties the selection", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    const callsAfterQuantize = mocks.requestSpy.mock.calls.length;

    fireEvent.click(paletteEntry("#000000"));
    expect(
      screen.getByRole("button", { name: "Merge to average" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Merge into one of them…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();

    fireEvent.click(paletteEntry("#ffffff"));
    expect(
      screen.getByRole("button", { name: "Merge to average" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Merge into one of them…" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(/\d+ selected/)).toBeNull();
    expect(paletteEntry("#000000")).toHaveAttribute("aria-pressed", "false");
    expect(paletteEntry("#ffffff")).toHaveAttribute("aria-pressed", "false");
    expect(mocks.requestSpy.mock.calls.length).toBe(callsAfterQuantize);
  });

  it("Merge to average collapses the selection into one count-weighted color", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    fireEvent.click(paletteEntry("#000000"));
    fireEvent.click(paletteEntry("#ffffff"));
    fireEvent.click(screen.getByRole("button", { name: "Merge to average" }));

    // (0·2 + 255·1) / 3 = 85 → #555555, covering the combined 75%.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#000000/ })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /#ffffff/ })).toBeNull();
    expect(paletteEntry("#555555")).toHaveTextContent("75.0%");
    expect(paletteEntry("#c80000")).toHaveTextContent("25.0%");
    expect(mocks.requestSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        op: "palette",
        action: expect.objectContaining({ kind: "mergeAverage" }),
      }),
    );
    // The new palette resets the selection (the reset effect keys on it).
    await waitFor(() =>
      expect(screen.queryByText(/\d+ selected/)).toBeNull(),
    );
  });

  it("Merge into one of them… lists only the selected entries and keeps the chosen survivor", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    fireEvent.click(paletteEntry("#c80000"));
    fireEvent.click(paletteEntry("#ffffff"));
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into one of them…" }),
    );
    // The chooser offers exactly the selected entries.
    expect(
      screen.getByRole("button", { name: "Merge into #c80000" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Merge into #ffffff" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Merge into.*#000000/ }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Merge into #ffffff" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#c80000/ })).toBeNull(),
    );
    // The survivor keeps its own color; coverage combines (25% + 25%).
    expect(paletteEntry("#ffffff")).toHaveTextContent("50.0%");
    expect(mocks.requestSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        op: "palette",
        action: expect.objectContaining({ kind: "mergeMany" }),
      }),
    );
  });

  it("a snapped survivor keeps its filament label through a targeted merge", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    fireEvent.click(screen.getByRole("button", { name: "Snap to filaments" }));
    await screen.findByText("Rojo");

    await mergeSelectionInto(["#ffffff"], "#ff0000");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#ffffff/ })).toBeNull(),
    );
    expect(paletteEntry("#ff0000")).toHaveTextContent("Rojo");
    expect(paletteEntry("#ff0000")).toHaveTextContent("50.0%");
  });

  it("Merge similar / Merge tiny send their (default) thresholds", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    fireEvent.click(screen.getByRole("button", { name: "Merge similar" }));
    await waitFor(() =>
      expect(mocks.requestSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: "palette",
          action: { kind: "mergeSimilar", threshold: 40 },
        }),
      ),
    );

    fireEvent.change(screen.getByLabelText(/tiny coverage/i), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Merge tiny" }));
    await waitFor(() =>
      expect(mocks.requestSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: "palette",
          action: { kind: "mergeTiny", coveragePercent: 10 },
        }),
      ),
    );
  });

  it("snaps every entry to a filament, showing catalog names (R13)", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    fireEvent.click(screen.getByRole("button", { name: "Snap to filaments" }));
    expect(await screen.findByText("Rojo")).toBeInTheDocument();
    expect(screen.getByText("Negro")).toBeInTheDocument();
    expect(screen.getByText("Blanco")).toBeInTheDocument();
    expect(paletteEntry("#ff0000")).toHaveTextContent("Rojo");
    expect(mocks.requestSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        op: "palette",
        action: { kind: "snap", catalog: CATALOG },
      }),
    );
  });

  it("disables snapping with an explanatory note when the catalog is empty (R14)", async () => {
    render(<ImagePrep catalogColors={[]} />);
    await loadSample();
    await posterize();
    expect(
      screen.getByRole("button", { name: "Snap to filaments" }),
    ).toBeDisabled();
    expect(screen.getByText(/catalog is empty/i)).toBeInTheDocument();
  });
});

describe("palette undo (R20)", () => {
  const undoButton = () => screen.getByRole("button", { name: "Undo" });

  it("is disabled at the fresh-posterize baseline", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    // Baseline history holds only the posterize result — nothing to revert to.
    expect(undoButton()).toBeDisabled();
  });

  it("enables after a palette action and restores the previous palette/preview", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    const callsAfterQuantize = mocks.requestSpy.mock.calls.length;

    // Merge black into white → white 75%, black gone.
    await mergeSelectionInto(["#000000"], "#ffffff");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#000000/ })).toBeNull(),
    );
    expect(paletteEntry("#ffffff")).toHaveTextContent("75.0%");
    expect(undoButton()).toBeEnabled();

    const callsAfterMerge = mocks.requestSpy.mock.calls.length;

    // Undo restores the baseline palette + coverage, with NO worker call.
    fireEvent.click(undoButton());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /#000000/ }),
      ).toBeInTheDocument(),
    );
    expect(paletteEntry("#ffffff")).toHaveTextContent("25.0%");
    expect(paletteEntry("#000000")).toHaveTextContent("50.0%");
    expect(undoButton()).toBeDisabled(); // back at baseline
    expect(mocks.requestSpy.mock.calls.length).toBe(callsAfterMerge);
    expect(callsAfterMerge).toBeGreaterThan(callsAfterQuantize);
  });

  it("walks back through multiple actions to the baseline, then disables", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    // Action 1: black into white (75% white).
    await mergeSelectionInto(["#000000"], "#ffffff");
    await waitFor(() =>
      expect(paletteEntry("#ffffff")).toHaveTextContent("75.0%"),
    );
    // Action 2: red into white (100% white).
    await mergeSelectionInto(["#c80000"], "#ffffff");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#c80000/ })).toBeNull(),
    );
    expect(paletteEntry("#ffffff")).toHaveTextContent("100.0%");

    const callsBeforeUndo = mocks.requestSpy.mock.calls.length;

    // Undo action 2 → red returns, white back to 75%.
    fireEvent.click(undoButton());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /#c80000/ }),
      ).toBeInTheDocument(),
    );
    expect(paletteEntry("#ffffff")).toHaveTextContent("75.0%");
    expect(undoButton()).toBeEnabled();

    // Undo action 1 → baseline; Undo now disabled.
    fireEvent.click(undoButton());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /#000000/ }),
      ).toBeInTheDocument(),
    );
    expect(paletteEntry("#ffffff")).toHaveTextContent("25.0%");
    expect(undoButton()).toBeDisabled();

    // Undo is a pure client pop — it never re-posts work to the worker.
    expect(mocks.requestSpy.mock.calls.length).toBe(callsBeforeUndo);
  });

  it("restores the prior palette after a multi-merge to average", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    fireEvent.click(paletteEntry("#000000"));
    fireEvent.click(paletteEntry("#ffffff"));
    fireEvent.click(screen.getByRole("button", { name: "Merge to average" }));
    await waitFor(() =>
      expect(paletteEntry("#555555")).toHaveTextContent("75.0%"),
    );

    fireEvent.click(undoButton());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#555555/ })).toBeNull(),
    );
    expect(paletteEntry("#000000")).toHaveTextContent("50.0%");
    expect(paletteEntry("#ffffff")).toHaveTextContent("25.0%");
    expect(undoButton()).toBeDisabled(); // back at baseline
  });

  it("re-running Posterize resets the history so Undo is disabled again", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    await mergeSelectionInto(["#000000"], "#ffffff");
    await waitFor(() => expect(undoButton()).toBeEnabled());

    // A fresh Posterize establishes a new baseline (same source → same palette).
    fireEvent.click(screen.getByRole("button", { name: "Posterize" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /#000000/ }),
      ).toBeInTheDocument(),
    );
    expect(undoButton()).toBeDisabled();
  });

  it("disables Undo while the worker is busy even with history to revert", async () => {
    const view = render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    await mergeSelectionInto(["#000000"], "#ffffff");
    await waitFor(() => expect(undoButton()).toBeEnabled());

    mocks.busyRef.value = true;
    view.rerender(<ImagePrep catalogColors={CATALOG} />);
    expect(undoButton()).toBeDisabled();
  });

  it("reverts the last palette action via Ctrl+Z", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    await mergeSelectionInto(["#000000"], "#ffffff");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#000000/ })).toBeNull(),
    );

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /#000000/ }),
      ).toBeInTheDocument(),
    );
    expect(paletteEntry("#000000")).toHaveTextContent("50.0%");
  });
});

describe("pipeline integrity + download (R15, R16, R17)", () => {
  it("re-applying adjustments discards the quantized palette (R16)", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    expect(screen.getByRole("heading", { name: "Palette" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Palette" })).toBeNull(),
    );
    // The adjusted stage survives (histogram present); the palette is gone.
    expect(screen.getByTestId("luminance-histogram")).toBeInTheDocument();
  });

  it("loading a new file resets the whole pipeline (R16)", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByTestId("luminance-histogram");
    await posterize();

    await loadSample("fresh.png");
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Palette" })).toBeNull(),
    );
    expect(screen.queryByTestId("luminance-histogram")).toBeNull();
  });

  it("Download PNG names the file <base>-prepped.png with no network request (R17)", async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      },
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample("photo.jpg");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    });

    expect(downloads).toEqual(["photo-prepped.png"]);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("pick from image (R21)", () => {
  const pickButton = () =>
    screen.getByRole("button", { name: "Pick from image" });

  // jsdom's getBoundingClientRect returns zeros; stub the Preview canvas box so
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

  it("toggles pick mode, reflecting aria-pressed and a crosshair on the preview", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    const canvas = screen.getByLabelText("Working image preview");
    expect(pickButton()).toHaveAttribute("aria-pressed", "false");
    expect(canvas.className).not.toContain("cursor-crosshair");

    fireEvent.click(pickButton());
    expect(pickButton()).toHaveAttribute("aria-pressed", "true");
    expect(canvas.className).toContain("cursor-crosshair");

    fireEvent.click(pickButton());
    expect(pickButton()).toHaveAttribute("aria-pressed", "false");
    expect(canvas.className).not.toContain("cursor-crosshair");
  });

  it("toggles the palette entry under a click on the Preview canvas (R22)", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    const canvas = screen.getByLabelText("Working image preview");
    stubRect(canvas, 2, 2); // intrinsic 2×2 sample, drawn 1:1

    fireEvent.click(pickButton());
    // Pixel (1,1) of the 2×2 sample is the red flame → its swatch toggles in.
    fireEvent.click(canvas, { clientX: 1.5, clientY: 1.5 });
    expect(paletteEntry("#c80000")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    // Picking the same pixel again toggles the entry back OUT.
    fireEvent.click(canvas, { clientX: 1.5, clientY: 1.5 });
    expect(paletteEntry("#c80000")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/\d+ selected/)).toBeNull();
  });

  it("a pick adds to an existing selection, ready for a multi-merge", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    const canvas = screen.getByLabelText("Working image preview");
    stubRect(canvas, 2, 2);

    fireEvent.click(paletteEntry("#ffffff")); // tap-selected first
    fireEvent.click(pickButton());
    fireEvent.click(canvas, { clientX: 1.5, clientY: 1.5 }); // picks red

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(paletteEntry("#ffffff")).toHaveAttribute("aria-pressed", "true");
    expect(paletteEntry("#c80000")).toHaveAttribute("aria-pressed", "true");

    // The picked pair merges through the action bar like any selection.
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into one of them…" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Merge into #ffffff" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /#c80000/ })).toBeNull(),
    );
    expect(paletteEntry("#ffffff")).toHaveTextContent("50.0%");
  });

  it("ignores a click that lands in the object-contain letterbox", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    const canvas = screen.getByLabelText("Working image preview");
    // Wide box around a square image → side letterbox: x ∈ [4, 6) is content.
    stubRect(canvas, 10, 2);

    fireEvent.click(pickButton());
    fireEvent.click(canvas, { clientX: 0.5, clientY: 1 }); // left margin
    // Nothing was selected — the selection action bar does not appear.
    expect(screen.queryByText(/\d+ selected/)).toBeNull();
  });
});

describe("selection highlight (R23)", () => {
  const overlay = () => screen.queryByTestId("selection-highlight-overlay");

  it("shows the dim overlay while a selection exists and clears it on deselect", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    expect(overlay()).toBeNull(); // no selection yet → plain preview

    fireEvent.click(paletteEntry("#c80000"));
    const veil = overlay() as HTMLCanvasElement;
    expect(veil).toBeInTheDocument();
    // Painted at the working image's intrinsic size (the 2×2 sample) so its
    // object-contain geometry matches the Preview canvas underneath.
    expect(veil.width).toBe(2);
    expect(veil.height).toBe(2);

    // Deselecting the last entry restores the normal preview.
    fireEvent.click(paletteEntry("#c80000"));
    expect(overlay()).toBeNull();
  });

  it("clears the overlay via the action bar's Clear button", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    fireEvent.click(paletteEntry("#000000"));
    fireEvent.click(paletteEntry("#ffffff"));
    expect(overlay()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(overlay()).toBeNull();
  });

  it("clears when a palette change resets the selection (fresh posterize)", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();
    fireEvent.click(paletteEntry("#c80000"));
    expect(overlay()).toBeInTheDocument();

    await posterize(); // new palette → the selection-reset effect empties it
    expect(overlay()).toBeNull();
  });

  it("lets eyedropper clicks pass through (pointer-events-none) while visible", async () => {
    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample();
    await posterize();

    const canvas = screen.getByLabelText("Working image preview");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 2,
      bottom: 2,
      width: 2,
      height: 2,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "Pick from image" }));
    fireEvent.click(canvas, { clientX: 1.5, clientY: 1.5 }); // picks red
    const veil = overlay() as HTMLCanvasElement;
    expect(veil).toBeInTheDocument();
    // The overlay must never intercept the R21 clicks landing underneath.
    expect(veil.className).toContain("pointer-events-none");

    // With the overlay showing, picking the same pixel again still reaches the
    // Preview canvas and toggles the entry back OUT → overlay clears.
    fireEvent.click(canvas, { clientX: 1.5, clientY: 1.5 });
    expect(overlay()).toBeNull();
  });

  it("Download still exports the unmodified working image while highlighted", async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      },
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<ImagePrep catalogColors={CATALOG} />);
    await loadSample("photo.jpg");
    await posterize();
    fireEvent.click(paletteEntry("#c80000"));
    expect(overlay()).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    });
    // The highlight is render-layer only: the download flow is untouched.
    expect(downloads).toEqual(["photo-prepped.png"]);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
