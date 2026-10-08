import type { Product, SegmentAllocation } from './types';

/** Equal split across the given segments, stored as exact 1/k fractions. */
export function equalAllocations(segmentIds: readonly string[]): SegmentAllocation[] {
  const k = segmentIds.length;
  return segmentIds.map((segmentId) => ({ segmentId, fraction: k > 0 ? 1 / k : 0 }));
}

/**
 * The fractions the model uses. In equal mode the split is always recomputed
 * from the selected segments so stale stored fractions can never leak in.
 */
export function effectiveAllocations(product: Pick<Product, 'allocations' | 'allocationMode'>): SegmentAllocation[] {
  if (product.allocationMode === 'equal') {
    return equalAllocations(product.allocations.map((a) => a.segmentId));
  }
  return product.allocations.map((a) => ({ ...a }));
}

export function allocationTotal(allocations: readonly SegmentAllocation[]): number {
  // Kahan-free plain sum is fine at these sizes (<= 30 segments).
  return allocations.reduce((sum, a) => sum + a.fraction, 0);
}

/**
 * Change which segments a product addresses. Equal mode re-splits evenly.
 * Custom mode keeps every existing fraction untouched and adds new segments
 * at 0 so the user's split is never silently reset; validation then tells
 * the user if the total no longer equals 100%.
 */
export function withSegments(product: Product, segmentIds: readonly string[]): Product {
  const unique = [...new Set(segmentIds)];
  if (product.allocationMode === 'equal') {
    return { ...product, allocations: equalAllocations(unique) };
  }
  const existing = new Map(product.allocations.map((a) => [a.segmentId, a.fraction]));
  return {
    ...product,
    allocations: unique.map((segmentId) => ({ segmentId, fraction: existing.get(segmentId) ?? 0 })),
  };
}

/** Switch to a custom split, seeded from the current effective fractions. */
export function toCustomMode(product: Product): Product {
  return { ...product, allocationMode: 'custom', allocations: effectiveAllocations(product) };
}

export function toEqualMode(product: Product): Product {
  return {
    ...product,
    allocationMode: 'equal',
    allocations: equalAllocations(product.allocations.map((a) => a.segmentId)),
  };
}

/** Modelled addressed amount per segment: m_is = M_i * p_is. */
export function segmentAmounts(product: Pick<Product, 'sam' | 'allocations' | 'allocationMode'>): Record<string, number> {
  const out: Record<string, number> = {};
  const sam = product.sam ?? 0;
  for (const a of effectiveAllocations(product)) {
    out[a.segmentId] = (out[a.segmentId] ?? 0) + sam * a.fraction;
  }
  return out;
}
