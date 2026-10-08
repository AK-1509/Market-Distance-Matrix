import { computeLayout } from '../domain/layout';
import type { LayoutJobRequest, LayoutJobResponse } from './protocol';

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutJobRequest>) => void) | null;
  postMessage(message: LayoutJobResponse): void;
};

ctx.onmessage = (event) => {
  const { jobId, input } = event.data;
  try {
    ctx.postMessage({ jobId, inputHash: input.inputHash, result: computeLayout(input) });
  } catch (error) {
    ctx.postMessage({ jobId, inputHash: input.inputHash, error: error instanceof Error ? error.message : String(error) });
  }
};
