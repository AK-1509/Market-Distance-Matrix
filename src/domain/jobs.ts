/**
 * Tracks the latest layout job so responses from superseded jobs are ignored.
 * A response is accepted only if it belongs to the most recently issued job AND its
 * input hash still matches what that job was issued for.
 */
export class LatestJobTracker {
  private counter = 0;
  private latest: { jobId: number; hash: string; revision: number } | null = null;

  issue(hash: string, revision: number): number {
    this.counter += 1;
    this.latest = { jobId: this.counter, hash, revision };
    return this.counter;
  }

  accepts(jobId: number, hash: string): boolean {
    return this.latest !== null && this.latest.jobId === jobId && this.latest.hash === hash;
  }

  /** Invalidate everything in flight (e.g. the project became unanalyzable). */
  clear(): void {
    this.latest = null;
  }

  get current(): { jobId: number; hash: string; revision: number } | null {
    return this.latest;
  }
}
