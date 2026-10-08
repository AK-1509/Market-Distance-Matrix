// The market-overlap model (MODEL.md §1). Pure functions only.
//
//   m_is = M_i * p_is
//   O_ij = sum_s min(m_is, m_js)            (nested / maximum-overlap assumption)
//   G_ij = O_ij / sqrt(M_i * M_j)
//   d_ij = sqrt(max(0, 1 - clamp(G_ij, 0, 1)))

import { segmentAmounts } from './allocation';
import { MODEL_SETTINGS } from './constants';
import type { Product } from './types';

export interface Footprint {
  id: string;
  /** M_i, the product's SAM. */
  sam: number;
  /** m_is keyed by segment ID (only segments the product addresses). */
  amounts: Record<string, number>;
}

export function footprintOf(product: Pick<Product, 'id' | 'sam' | 'allocations' | 'allocationMode'>): Footprint {
  if (product.sam === null || !(product.sam > 0)) {
    throw new Error(`Product ${product.id} has no positive SAM and cannot be modelled.`);
  }
  return { id: product.id, sam: product.sam, amounts: segmentAmounts(product) };
}

export function overlap(a: Footprint, b: Footprint): number {
  if (a === b) return a.sam;
  let total = 0;
  for (const [segmentId, amount] of Object.entries(a.amounts)) {
    const other = b.amounts[segmentId];
    if (other !== undefined) total += Math.min(amount, other);
  }
  return total;
}

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export function similarityFromOverlap(o: number, samA: number, samB: number): number {
  return clamp(o / Math.sqrt(samA * samB), 0, 1);
}

export function distanceFromSimilarity(g: number): number {
  const gap = 1 - clamp(g, 0, 1);
  // Identical footprints can land a few ulps below G = 1; report those as 0.
  if (gap <= MODEL_SETTINGS.similaritySnap) return 0;
  return Math.sqrt(Math.max(0, gap));
}

export function distance(a: Footprint, b: Footprint): number {
  if (a === b) return 0;
  return distanceFromSimilarity(similarityFromOverlap(overlap(a, b), a.sam, b.sam));
}

export interface Matrices {
  ids: string[];
  overlap: number[][];
  similarity: number[][];
  distance: number[][];
}

/** Full symmetric matrices in the order given. Diagonals are set exactly. */
export function buildMatrices(footprints: readonly Footprint[]): Matrices {
  const n = footprints.length;
  const O = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const G = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const D = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    O[i][i] = footprints[i].sam;
    G[i][i] = 1;
    D[i][i] = 0;
    for (let j = i + 1; j < n; j++) {
      const o = overlap(footprints[i], footprints[j]);
      const g = similarityFromOverlap(o, footprints[i].sam, footprints[j].sam);
      const d = distanceFromSimilarity(g);
      O[i][j] = O[j][i] = o;
      G[i][j] = G[j][i] = g;
      D[i][j] = D[j][i] = d;
    }
  }
  return { ids: footprints.map((f) => f.id), overlap: O, similarity: G, distance: D };
}

/** Union of footprints under the nested assumption: sum_s max_i m_is. */
export function modeledUnion(footprints: readonly Footprint[]): number {
  const maxBySegment = new Map<string, number>();
  for (const f of footprints) {
    for (const [segmentId, amount] of Object.entries(f.amounts)) {
      maxBySegment.set(segmentId, Math.max(maxBySegment.get(segmentId) ?? 0, amount));
    }
  }
  let total = 0;
  for (const v of maxBySegment.values()) total += v;
  return total;
}

export interface SegmentContribution {
  segmentId: string;
  amount: number;
}

/**
 * Unique modelled overlap between IDV and a group of competitors:
 * sum_s min(m_0s, max_{i in group} m_is). Each market slice counts once.
 */
export function groupSharedWithIdv(idv: Footprint, group: readonly Footprint[]): {
  total: number;
  bySegment: SegmentContribution[];
} {
  const bySegment: SegmentContribution[] = [];
  let total = 0;
  for (const [segmentId, idvAmount] of Object.entries(idv.amounts)) {
    let groupMax = 0;
    for (const f of group) groupMax = Math.max(groupMax, f.amounts[segmentId] ?? 0);
    const amount = Math.min(idvAmount, groupMax);
    if (amount > 0) {
      bySegment.push({ segmentId, amount });
      total += amount;
    }
  }
  bySegment.sort((a, b) => b.amount - a.amount || (a.segmentId < b.segmentId ? -1 : 1));
  return { total, bySegment };
}

/** Whether the modelled union fits inside TAM, with a scale-aware tolerance. */
export function unionFitsTam(union: number, tam: number): boolean {
  return union <= tam * (1 + MODEL_SETTINGS.unionRelativeTolerance) + Number.EPSILON;
}
