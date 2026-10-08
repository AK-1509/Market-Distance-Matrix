// Runs layout jobs off the main thread and guarantees that only the newest
// request can produce a result. A newer request terminates a busy worker
// (cancelling the obsolete computation); any late message from an older job
// is ignored by job ID.

import { computeLayout, type LayoutInput } from '../domain/layout';
import type { LayoutResult } from '../domain/types';
import type { LayoutJobRequest, LayoutJobResponse, WorkerLike } from './protocol';

export type LayoutOutcome =
  | { status: 'done'; result: LayoutResult }
  | { status: 'superseded' }
  | { status: 'failed'; error: string };

interface Pending {
  jobId: number;
  resolve: (outcome: LayoutOutcome) => void;
}

export class LayoutCoordinator {
  private worker: WorkerLike | null = null;
  private latestJobId = 0;
  private pending: Pending | null = null;
  /** Number of stale responses dropped (exposed for tests and diagnostics). */
  staleDropped = 0;

  constructor(private readonly createWorker: () => WorkerLike) {}

  request(input: LayoutInput): Promise<LayoutOutcome> {
    const jobId = ++this.latestJobId;
    if (this.pending) {
      // Cancel the obsolete computation outright instead of waiting for it.
      this.pending.resolve({ status: 'superseded' });
      this.pending = null;
      this.disposeWorker();
    }
    const worker = this.ensureWorker();
    return new Promise<LayoutOutcome>((resolve) => {
      this.pending = { jobId, resolve };
      const message: LayoutJobRequest = { jobId, input };
      worker.postMessage(message);
    });
  }

  dispose(): void {
    if (this.pending) this.pending.resolve({ status: 'superseded' });
    this.pending = null;
    this.disposeWorker();
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.handle(event.data);
    worker.onerror = (event) => {
      const p = this.pending;
      if (!p) return;
      this.pending = null;
      this.disposeWorker();
      const message = event && typeof event === 'object' && 'message' in event ? String((event as { message: unknown }).message) : 'Layout worker failed';
      p.resolve({ status: 'failed', error: message });
    };
    this.worker = worker;
    return worker;
  }

  private handle(response: LayoutJobResponse): void {
    const p = this.pending;
    if (!p || response.jobId !== p.jobId || response.jobId !== this.latestJobId) {
      this.staleDropped += 1;
      return;
    }
    this.pending = null;
    if (response.result) p.resolve({ status: 'done', result: response.result });
    else p.resolve({ status: 'failed', error: response.error ?? 'Layout failed' });
  }

  private disposeWorker(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }
}

/** Main-thread fallback with the same interface, used if Workers are unavailable. */
export function createInlineWorker(): WorkerLike {
  let terminated = false;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    terminate() {
      terminated = true;
    },
    postMessage(message: LayoutJobRequest) {
      setTimeout(() => {
        if (terminated) return;
        let response: LayoutJobResponse;
        try {
          response = { jobId: message.jobId, inputHash: message.input.inputHash, result: computeLayout(message.input) };
        } catch (error) {
          response = { jobId: message.jobId, inputHash: message.input.inputHash, error: String(error) };
        }
        if (!terminated) w.onmessage?.({ data: response });
      }, 0);
    },
  };
  return w;
}

export function createBrowserWorker(): WorkerLike {
  try {
    return new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return createInlineWorker();
  }
}
