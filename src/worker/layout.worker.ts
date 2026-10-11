/// <reference lib="webworker" />
/** Runs the constrained radial optimizer off the main thread. */
import { fitRadialLayout, type RadialInput } from '../domain/radial';

export interface LayoutJob {
  jobId: number;
  hash: string;
  input: RadialInput;
}

self.onmessage = (event: MessageEvent<LayoutJob>) => {
  const { jobId, hash, input } = event.data;
  try {
    const layout = fitRadialLayout(input);
    self.postMessage({ jobId, hash, ok: true, layout });
  } catch (err) {
    self.postMessage({ jobId, hash, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
