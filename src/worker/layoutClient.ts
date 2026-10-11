/**
 * Main-thread client for the layout worker. Each request supersedes the previous one:
 * an in-flight job is cancelled by terminating its worker, and any late response is
 * rejected unless it matches the latest job ID and input hash.
 */
import { LatestJobTracker } from '../domain/jobs';
import { fitRadialLayout, type RadialInput, type RadialLayout } from '../domain/radial';

export type LayoutResponse = { jobId: number; hash: string; ok: true; layout: RadialLayout } | { jobId: number; hash: string; ok: false; error: string };

export class LayoutClient {
  private worker: Worker | null = null;
  private busy = false;
  private readonly tracker = new LatestJobTracker();

  request(hash: string, revision: number, input: RadialInput, onResult: (r: LayoutResponse) => void): void {
    const jobId = this.tracker.issue(hash, revision);
    if (this.busy) this.terminate(); // cancel the obsolete job
    const worker = this.ensureWorker();
    const deliver = (r: LayoutResponse) => {
      if (this.tracker.accepts(r.jobId, r.hash)) onResult(r);
    };
    if (!worker) {
      // Fallback when module workers are unavailable: compute asynchronously on the main thread.
      setTimeout(() => {
        try {
          deliver({ jobId, hash, ok: true, layout: fitRadialLayout(input) });
        } catch (err) {
          deliver({ jobId, hash, ok: false, error: String(err) });
        }
      }, 0);
      return;
    }
    this.busy = true;
    worker.onmessage = (ev: MessageEvent<LayoutResponse>) => {
      this.busy = false;
      deliver(ev.data);
    };
    worker.onerror = (ev) => {
      this.busy = false;
      ev.preventDefault();
      this.terminate();
      deliver({ jobId, hash, ok: false, error: ev.message || 'Layout worker failed' });
    };
    worker.postMessage({ jobId, hash, input });
  }

  /** Invalidate any in-flight job (e.g. the draft became unanalyzable). */
  cancel(): void {
    this.tracker.clear();
    if (this.busy) this.terminate();
  }

  dispose(): void {
    this.cancel();
    this.terminate();
  }

  private terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    try {
      this.worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      this.worker = null;
    }
    return this.worker;
  }
}
