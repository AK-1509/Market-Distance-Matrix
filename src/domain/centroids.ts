/**
 * Modeled segment centers: coverage-weighted centroids of plotted product positions.
 *   z_s = sum_i(m_is * p_i) / sum_i(m_is)
 * These summarize footprint inputs — not measured preferences, users won, or share.
 * Different allocations can produce the same point; the contributions explain it.
 */
import type { Footprint } from './model';
import type { Point } from './types';

export interface SegmentCentroid {
  segmentId: string;
  point: Point;
  weight: number;
  contributions: { productId: string; amount: number }[];
}

export function segmentCentroids(
  footprints: readonly Footprint[],
  positions: Record<string, Point>,
  segmentIds: readonly string[],
): SegmentCentroid[] {
  const out: SegmentCentroid[] = [];
  segmentIds.forEach((segmentId, s) => {
    let w = 0;
    let x = 0;
    let y = 0;
    const contributions: { productId: string; amount: number }[] = [];
    for (const f of footprints) {
      const m = f.amounts[s];
      if (!(m > 0)) continue;
      const p = positions[f.productId];
      if (!p) continue;
      w += m;
      x += m * p.x;
      y += m * p.y;
      contributions.push({ productId: f.productId, amount: m });
    }
    if (w > 0) {
      contributions.sort((a, b) => b.amount - a.amount);
      out.push({ segmentId, point: { x: x / w, y: y / w }, weight: w, contributions });
    }
  });
  return out;
}
