import type { LayoutInput } from '../domain/layout';
import type { LayoutResult } from '../domain/types';

export interface LayoutJobRequest {
  jobId: number;
  input: LayoutInput;
}

export interface LayoutJobResponse {
  jobId: number;
  inputHash: string;
  result?: LayoutResult;
  error?: string;
}

/** The subset of the Worker API the coordinator relies on (fakeable in tests). */
export interface WorkerLike {
  postMessage(message: LayoutJobRequest): void;
  terminate(): void;
  onmessage: ((event: { data: LayoutJobResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
