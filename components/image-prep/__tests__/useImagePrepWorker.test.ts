import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hook tests for 11_image_prep (R18) with a stubbed global Worker: the hook's
 * job is correlation (id → Promise), busy tracking, transfer-list selection,
 * and teardown — none of which needs the real worker (that path is E2E's).
 */

import { useImagePrepWorker } from "@/components/image-prep/useImagePrepWorker";
import type {
  AdjustResult,
  FlattenResult,
  MaskResult,
  PipelineResult,
  SerializedIndexedImage,
  WorkerRequest,
  WorkerResponse,
} from "@/components/image-prep/worker-messages";
import { IDENTITY_ADJUSTMENTS } from "@/lib/image-prep-core";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: { message: WorkerRequest; transfer?: Transferable[] }[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerRequest, transfer?: Transferable[]) {
    this.posted.push({ message, transfer });
  }

  terminate() {
    this.terminated = true;
  }
}

function adjustBody() {
  return {
    op: "adjust" as const,
    buffer: new ArrayBuffer(16),
    width: 2,
    height: 2,
    settings: IDENTITY_ADJUSTMENTS,
  };
}

function adjustPayload(): AdjustResult {
  return {
    pixels: { width: 2, height: 2, buffer: new ArrayBuffer(16) },
    histogram: new ArrayBuffer(1024),
  };
}

function respond(worker: FakeWorker, data: WorkerResponse) {
  worker.onmessage?.({ data } as MessageEvent<WorkerResponse>);
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useImagePrepWorker (R18)", () => {
  it("posts the request with an id + transfer list, tracks busy, and resolves on ok", async () => {
    const { result } = renderHook(() => useImagePrepWorker());
    expect(result.current.busy).toBe(false);
    expect(FakeWorker.instances).toHaveLength(0); // lazy — no worker yet

    const body = adjustBody();
    let promise: Promise<AdjustResult> | undefined;
    act(() => {
      promise = result.current.request(body);
    });
    expect(result.current.busy).toBe(true);

    const worker = FakeWorker.instances[0];
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].message).toMatchObject({ id: 1, op: "adjust" });
    expect(worker.posted[0].transfer).toEqual([body.buffer]);

    const payload = adjustPayload();
    await act(async () => {
      respond(worker, { id: 1, ok: true, op: "adjust", result: payload });
    });
    await expect(promise).resolves.toBe(payload);
    expect(result.current.busy).toBe(false);
  });

  it("reuses one worker, increments ids, and transfers palette indices", async () => {
    const { result } = renderHook(() => useImagePrepWorker());
    const image: SerializedIndexedImage = {
      width: 1,
      height: 1,
      indices: new ArrayBuffer(1),
      entries: [{ color: { r: 0, g: 0, b: 0 }, count: 1, catalog: null }],
    };
    let first: Promise<AdjustResult> | undefined;
    let second: Promise<PipelineResult> | undefined;
    act(() => {
      first = result.current.request(adjustBody());
      second = result.current.request({
        op: "palette",
        image,
        action: { kind: "mergeSimilar", threshold: 40 },
      });
    });
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    expect(worker.posted.map((p) => p.message.id)).toEqual([1, 2]);
    expect(worker.posted[1].transfer).toEqual([image.indices]);

    // Settle both so no rejection leaks out of the test.
    const pipeline: PipelineResult = {
      image,
      preview: { width: 1, height: 1, buffer: new ArrayBuffer(4) },
    };
    await act(async () => {
      respond(worker, { id: 1, ok: true, op: "adjust", result: adjustPayload() });
      respond(worker, { id: 2, ok: true, op: "palette", result: pipeline });
    });
    await expect(first).resolves.toBeDefined();
    await expect(second).resolves.toBe(pipeline);
  });

  it("rejects on ok: false and ignores unknown response ids", async () => {
    const { result } = renderHook(() => useImagePrepWorker());
    let promise: Promise<AdjustResult> | undefined;
    act(() => {
      promise = result.current.request(adjustBody());
    });
    const worker = FakeWorker.instances[0];

    await act(async () => {
      respond(worker, { id: 999, ok: false, error: "stale" }); // unknown id — ignored
    });
    expect(result.current.busy).toBe(true);

    // Attach the handler BEFORE the rejection fires (no unhandled rejection).
    const rejection = expect(promise).rejects.toThrow("boom");
    await act(async () => {
      respond(worker, { id: 1, ok: false, error: "boom" });
    });
    await rejection;
    expect(result.current.busy).toBe(false);
  });

  it("fails every in-flight request user-safely on a worker error", async () => {
    const { result } = renderHook(() => useImagePrepWorker());
    let a: Promise<AdjustResult> | undefined;
    let b: Promise<AdjustResult> | undefined;
    act(() => {
      a = result.current.request(adjustBody());
      b = result.current.request(adjustBody());
    });
    const worker = FakeWorker.instances[0];
    // Attach the handlers BEFORE the rejections fire (no unhandled rejection).
    const rejections = Promise.all([
      expect(a).rejects.toThrow("Image processing failed"),
      expect(b).rejects.toThrow("Image processing failed"),
    ]);
    await act(async () => {
      worker.onerror?.(new Event("error") as ErrorEvent);
    });
    await rejections;
    expect(result.current.busy).toBe(false);
  });

  it("background requests never flip busy and resolve like any other (12/R26)", async () => {
    const { result } = renderHook(() => useImagePrepWorker());
    const body = {
      op: "mask" as const,
      buffer: new ArrayBuffer(16),
      width: 2,
      height: 2,
      seedX: 0,
      seedY: 0,
      mode: "flood" as const,
      tolerance: 24,
      catchStrays: false,
    };
    let promise: Promise<MaskResult> | undefined;
    act(() => {
      promise = result.current.request(body, { background: true });
    });
    // A hover-mask request is in flight, yet busy stays false.
    expect(result.current.busy).toBe(false);

    const worker = FakeWorker.instances[0];
    expect(worker.posted[0].message).toMatchObject({ id: 1, op: "mask" });
    expect(worker.posted[0].transfer).toEqual([body.buffer]);

    const payload: MaskResult = { mask: new ArrayBuffer(4), count: 2 };
    await act(async () => {
      respond(worker, { id: 1, ok: true, op: "mask", result: payload });
    });
    await expect(promise).resolves.toBe(payload);
    expect(result.current.busy).toBe(false);
  });

  it("busy tracks only foreground work when background requests overlap (12/R26)", async () => {
    const { result } = renderHook(() => useImagePrepWorker());
    let background: Promise<MaskResult> | undefined;
    let foreground: Promise<AdjustResult> | undefined;
    act(() => {
      background = result.current.request(
        {
          op: "mask",
          buffer: new ArrayBuffer(16),
          width: 2,
          height: 2,
          seedX: 0,
          seedY: 0,
          mode: "flood",
          tolerance: 24,
          catchStrays: false,
        },
        { background: true },
      );
      foreground = result.current.request(adjustBody());
    });
    expect(result.current.busy).toBe(true); // the adjust, not the mask

    const worker = FakeWorker.instances[0];
    await act(async () => {
      respond(worker, { id: 2, ok: true, op: "adjust", result: adjustPayload() });
    });
    // The background mask is STILL pending, but busy already cleared.
    expect(result.current.busy).toBe(false);

    const payload: MaskResult = { mask: new ArrayBuffer(4), count: 1 };
    await act(async () => {
      respond(worker, { id: 1, ok: true, op: "mask", result: payload });
    });
    await expect(background).resolves.toBe(payload);
    await expect(foreground).resolves.toBeDefined();
    expect(result.current.busy).toBe(false);
  });

  it("a flatten fill transfers the image buffer AND the mask buffer (12/R16)", async () => {
    const { result } = renderHook(() => useImagePrepWorker());
    const buffer = new ArrayBuffer(16);
    const mask = new ArrayBuffer(4);
    let promise: Promise<FlattenResult> | undefined;
    act(() => {
      promise = result.current.request({
        op: "flatten",
        buffer,
        width: 2,
        height: 2,
        action: { kind: "fill", mask, fill: { r: 1, g: 2, b: 3 } },
      });
    });
    expect(result.current.busy).toBe(true); // mutations stay foreground

    const worker = FakeWorker.instances[0];
    expect(worker.posted[0].transfer).toEqual([buffer, mask]);

    const payload: FlattenResult = {
      pixels: { width: 2, height: 2, buffer: new ArrayBuffer(16) },
    };
    await act(async () => {
      respond(worker, { id: 1, ok: true, op: "flatten", result: payload });
    });
    await expect(promise).resolves.toBe(payload);
    expect(result.current.busy).toBe(false);
  });

  it("terminates the worker on unmount", () => {
    const { result, unmount } = renderHook(() => useImagePrepWorker());
    act(() => {
      void result.current.request(adjustBody()).catch(() => {
        // never settles — teardown path under test
      });
    });
    const worker = FakeWorker.instances[0];
    expect(worker.terminated).toBe(false);
    unmount();
    expect(worker.terminated).toBe(true);
  });
});
