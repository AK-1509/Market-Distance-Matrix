import type { Product, SegmentAllocation } from './types';
import { MODEL_SETTINGS } from './settings';

/** Equal split of a SAM across the given segments (the default assumption). */
export function equalAllocations(segmentIds: readonly string[]): SegmentAllocation[] {
  const k = segmentIds.length;
  return segmentIds.map((segmentId) => ({ segmentId, fraction: k > 0 ? 1 / k : 0 }));
}

export function allocationTotal(allocations: readonly SegmentAllocation[]): number {
  let total = 0;
  for (const a of allocations) total += a.fraction;
  return total;
}

/**
 * The fractions the model uses. Equal mode is always recomputed from the selected
 * segment list, so stored values cannot drift; custom mode uses stored values.
 */
export function effectiveAllocations(product: Pick<Product, 'allocations' | 'allocationMode'>): SegmentAllocation[] {
  if (product.allocationMode === 'equal') {
    return equalAllocations(product.allocations.map((a) => a.segmentId));
  }
  return product.allocations.map((a) => ({ ...a }));
}

/**
 * Change the selected segments of a product without silently resetting a custom split.
 * - equal mode: recompute the equal split.
 * - custom mode: keep existing fractions, add new segments at 0, drop removed ones.
 *   The total may then differ from 100%; validation reports it and the user decides.
 */
export function setProductSegments(
  product: Pick<Product, 'allocations' | 'allocationMode'>,
  segmentIds: readonly string[],
): SegmentAllocation[] {
  if (product.allocationMode === 'equal') return equalAllocations(segmentIds);
  const existing = new Map(product.allocations.map((a) => [a.segmentId, a.fraction]));
  return segmentIds.map((segmentId) => ({ segmentId, fraction: existing.get(segmentId) ?? 0 }));
}

export type AllocationProblem =
  | { code: 'no-segments' }
  | { code: 'duplicate-segment'; segmentId: string }
  | { code: 'unknown-segment'; segmentId: string }
  | { code: 'invalid-fraction'; segmentId: string }
  | { code: 'total-not-100'; total: number };

/**
 * Structural and numerical checks for a product's allocations against the project taxonomy.
 * An empty allocation list is reported as 'no-segments' (an incomplete draft, not malformed).
 */
export function checkAllocations(
  product: Pick<Product, 'allocations' | 'allocationMode'>,
  knownSegmentIds: ReadonlySet<string>,
): AllocationProblem[] {
  const problems: AllocationProblem[] = [];
  if (product.allocations.length === 0) {
    problems.push({ code: 'no-segments' });
    return problems;
  }
  const seen = new Set<string>();
  for (const a of product.allocations) {
    if (seen.has(a.segmentId)) problems.push({ code: 'duplicate-segment', segmentId: a.segmentId });
    seen.add(a.segmentId);
    if (!knownSegmentIds.has(a.segmentId)) problems.push({ code: 'unknown-segment', segmentId: a.segmentId });
    if (product.allocationMode === 'custom' && (!Number.isFinite(a.fraction) || a.fraction < 0 || a.fraction > 1)) {
      problems.push({ code: 'invalid-fraction', segmentId: a.segmentId });
    }
  }
  if (product.allocationMode === 'custom' && problems.every((p) => p.code !== 'invalid-fraction')) {
    const total = allocationTotal(product.allocations);
    if (Math.abs(total - 1) > MODEL_SETTINGS.allocationTolerance) problems.push({ code: 'total-not-100', total });
  }
  return problems;
}

/** Convert a user-entered percentage to an exact internal fraction. */
export function percentToFraction(percent: number): number {
  return percent / 100;
}

/** Display helper only; never feed the rounded value back into the model. */
export function formatPercent(fraction: number, digits = 1): string {
  const pct = fraction * 100;
  const rounded = Number(pct.toFixed(digits));
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(digits)}%`;
}
