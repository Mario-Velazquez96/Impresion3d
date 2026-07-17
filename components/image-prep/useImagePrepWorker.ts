"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AdjustResult,
  PipelineResult,
  WorkerRequestBody,
  WorkerResponse,
} from "./worker-messages";

/**
 * Promise-based, busy-tracked API over the image-prep Web Worker (R18).
 * The worker is created lazily ONCE (first request), reused for the island's
 * lifetime, and terminated on unmount. Responses are correlated by id;
 * `{ ok: false }` rejects. `busy` is true while any request is in flight —
 * the panels use it to disable conflicting controls.
 *
 * Component tests mock THIS module with a synchronous core-backed fake; the
 * real worker is logic-free (deserialize → core → serialize), so the fake is
 * behaviorally equivalent (see design.md).
 */

type OpResult = AdjustResult | PipelineResult;

type Pending = {
  resolve: (result: OpResult) => void;
  reject: (error: Error) => void;
};

export type RequestFn = {
  (body: Extract<WorkerRequestBody, { op: "adjust" }>): Promise<AdjustResult>;
  (
    body: Extract<WorkerRequestBody, { op: "quantize" }>,
  ): Promise<PipelineResult>;
  (
    body: Extract<WorkerRequestBody, { op: "palette" }>,
  ): Promise<PipelineResult>;
};

export function useImagePrepWorker(): { request: RequestFn; busy: boolean } {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextIdRef = useRef(0);
  const [inFlight, setInFlight] = useState(0);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) {
      return workerRef.current;
    }
    const worker = new Worker(
      new URL("./image-prep.worker.ts", import.meta.url),
    );
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const pending = pendingRef.current.get(message.id);
      if (!pending) {
        return; // stale/unknown id — e.g. a response after teardown
      }
      pendingRef.current.delete(message.id);
      setInFlight((n) => n - 1);
      if (message.ok) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error));
      }
    };
    worker.onerror = () => {
      // Worker-level failure: fail every in-flight request user-safely.
      const all = [...pendingRef.current.values()];
      pendingRef.current.clear();
      setInFlight(0);
      for (const pending of all) {
        pending.reject(new Error("Image processing failed"));
      }
    };
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    // The Map identity is stable for the hook's lifetime; capture it so the
    // cleanup does not read a ref after unmount (react-hooks/exhaustive-deps).
    const pending = pendingRef.current;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pending.clear();
    };
  }, []);

  const requestImpl = useCallback(
    (body: WorkerRequestBody): Promise<OpResult> => {
      const worker = ensureWorker();
      const id = ++nextIdRef.current;
      return new Promise<OpResult>((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
        setInFlight((n) => n + 1);
        const transfer: Transferable[] =
          body.op === "palette" ? [body.image.indices] : [body.buffer];
        worker.postMessage({ id, ...body }, transfer);
      });
    },
    [ensureWorker],
  );

  return {
    // Safe narrowing: the protocol pairs each op with exactly one result
    // shape (adjust → AdjustResult, quantize/palette → PipelineResult).
    request: requestImpl as RequestFn,
    busy: inFlight > 0,
  };
}
