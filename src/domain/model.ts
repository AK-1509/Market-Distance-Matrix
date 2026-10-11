/**
 * Modeled shared segment capacity — the single overlap model used everywhere.
 *
 *   m_is = M_i * p_is
 *   O_ij = sum_s min(m_is, m_js)
 *   G_ij = O_ij / sqrt(M_i * M_j)
 *   d_ij = sqrt(max(0, 1 - clamp(G_ij, 0, 1)))
 *
 * O_ij assumes the smaller addressed population inside a shared segment is nested
 * within the larger one (maximum overlap). It is an assumption, not an observation.
 */
import { effectiveAllocations } from './allocation';
import { MODEL_SETTINGS } from './settings';
import type { Product } from './types';

/** A product's modeled footprint: amounts per segment, aligned to a segment index. */
export interface Footprint {
  productId: string;
  /** M_i: total modeled market (equals SAM up to floating-point rounding). */
  total: number;
  /** m_is aligned with `SegmentIndex.ids`. */
  amounts: number[];
}

export interface SegmentIndex {
  ids: string[];
  position: Map<string, number>;
}

export function buildSegmentIndex(segmentIds: readonly string[]): SegmentIndex {
  return { ids: [...segmentIds], position: new Map(segmentIds.map((id, i) => [id, i])) };
}

/**
 * Build m_is for one product. Fractions must already be validated to sum to 1 within
 * tolerance; the tiny residual is removed by normalization (floating-point clean-up only,
 * never a silent rescale of user data — larger deviations throw).
 */
export function buildFootprint(product: Pick<Product, 'id' | 'sam' | 'allocations' | 'allocationMode'>, index: SegmentIndex): Footprint {
  const sam = product.sam;
  if (sam === null || !Number.isFinite(sam) || sam <= 0) {
    throw new Error(`Product ${product.id} has no positive SAM`);
  }
  const allocations = effectiveAllocations(product);
  if (allocations.length === 0) throw new Error(`Product ${product.id} has no segments`);
  let fractionTotal = 0;
  for (const a of allocations) fractionTotal += a.fraction;
  if (Math.abs(fractionTotal - 1) > MODEL_SETTINGS.allocationTolerance) {
    throw new Error(`Product ${product.id} allocations total ${fractionTotal}, expected 1`);
  }
  const amounts = new Array<number>(index.ids.length).fill(0);
  for (const a of allocations) {
    const pos = index.position.get(a.segmentId);
    if (pos === undefined) throw new Error(`Unknown segment ${a.segmentId}`);
    amounts[pos] += (sam * a.fraction) / fractionTotal;
  }
  let total = 0;
  for (const v of amounts) total += v;
  return { productId: product.id, total, amounts };
}

/** O_ij = sum_s min(m_is, m_js). */
export function overlap(a: Footprint, b: Footprint): number {
  let o = 0;
  const n = a.amounts.length;
  for (let s = 0; s < n; s++) o += Math.min(a.amounts[s], b.amounts[s]);
  return o;
}

/** G_ij clamped to [0, 1], with a float-only snap to exactly 1. */
export function similarity(o: number, totalA: number, totalB: number): number {
  const g = o / Math.sqrt(totalA * totalB);
  if (!Number.isFinite(g)) throw new Error('Non-finite similarity');
  const clamped = Math.min(1, Math.max(0, g));
  return 1 - clamped <= MODEL_SETTINGS.similaritySnap ? 1 : clamped;
}

export function distanceFromSimilarity(g: number): number {
  return Math.sqrt(Math.max(0, 1 - Math.min(1, Math.max(0, g))));
}

export function pairDistance(a: Footprint, b: Footprint): number {
  if (a === b) return 0;
  return distanceFromSimilarity(similarity(overlap(a, b), a.total, b.total));
}

/** Symmetric overlap matrix with O_ii = M_i. */
export function overlapMatrix(fps: readonly Footprint[]): number[][] {
  const n = fps.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    m[i][i] = fps[i].total;
    for (let j = i + 1; j < n; j++) {
      const o = overlap(fps[i], fps[j]);
      m[i][j] = o;
      m[j][i] = o;
    }
  }
  return m;
}

/** Symmetric distance matrix in [0, 1] with zero diagonal. */
export function distanceMatrix(fps: readonly Footprint[], overlaps: number[][] = overlapMatrix(fps)): number[][] {
  const n = fps.length;
  const d: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = distanceFromSimilarity(similarity(overlaps[i][j], fps[i].total, fps[j].total));
      d[i][j] = v;
      d[j][i] = v;
    }
  }
  return d;
}

/** modeledUnion = sum_s max_i m_is — each modeled market slice counted once. */
export function modeledUnion(fps: readonly Footprint[]): number {
  if (fps.length === 0) return 0;
  const n = fps[0].amounts.length;
  let u = 0;
  for (let s = 0; s < n; s++) {
    let mx = 0;
    for (const f of fps) mx = Math.max(mx, f.amounts[s]);
    u += mx;
  }
  return u;
}

/** Per-segment unique overlap of a group with the IDV: min(m_0s, max_i_in_group m_is). */
export function groupSharedBySegment(idv: Footprint, members: readonly Footprint[]): number[] {
  return idv.amounts.map((m0, s) => {
    let mx = 0;
    for (const f of members) mx = Math.max(mx, f.amounts[s]);
    return Math.min(m0, mx);
  });
}

/** groupShared = sum_s min(m_0s, max_i_in_group m_is). */
export function groupShared(idv: Footprint, members: readonly Footprint[]): number {
  return groupSharedBySegment(idv, members).reduce((a, b) => a + b, 0);
}

/** Scale-aware tolerance for comparing a market quantity against TAM. */
export function marketTolerance(tam: number): number {
  return Math.max(Math.abs(tam), 1) * MODEL_SETTINGS.marketTolerance;
}
