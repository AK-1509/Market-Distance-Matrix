/**
 * Explicit Euclidean construction of the overlap geometry (used to verify the model).
 *
 * For each segment, sort the unique positive m_is into thresholds t_1 < ... < t_k (t_0 = 0).
 * For interval l, product i gets coordinate sqrt(t_l - t_(l-1)) if m_is >= t_l, else 0.
 * Then b_i · b_j = O_ij and ||b_i||^2 = M_i. With v_i = b_i / sqrt(M_i),
 * ||v_i - v_j|| / sqrt(2) = d_ij.
 */
import type { Footprint } from './model';

export function thresholdVectors(fps: readonly Footprint[]): number[][] {
  const vectors: number[][] = fps.map(() => []);
  if (fps.length === 0) return vectors;
  const nSeg = fps[0].amounts.length;
  for (let s = 0; s < nSeg; s++) {
    const thresholds = [...new Set(fps.map((f) => f.amounts[s]).filter((v) => v > 0))].sort((a, b) => a - b);
    let prev = 0;
    for (const t of thresholds) {
      const width = Math.sqrt(t - prev);
      fps.forEach((f, i) => vectors[i].push(f.amounts[s] >= t ? width : 0));
      prev = t;
    }
  }
  return vectors;
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Distances from the normalized threshold vectors: ||v_i - v_j|| / sqrt(2). */
export function vectorDistanceMatrix(fps: readonly Footprint[]): number[][] {
  const b = thresholdVectors(fps);
  const v = b.map((vec) => {
    const norm = Math.sqrt(dot(vec, vec));
    return vec.map((x) => x / norm);
  });
  return v.map((vi) =>
    v.map((vj) => {
      let s = 0;
      for (let k = 0; k < vi.length; k++) s += (vi[k] - vj[k]) ** 2;
      return Math.sqrt(s) / Math.SQRT2;
    }),
  );
}
