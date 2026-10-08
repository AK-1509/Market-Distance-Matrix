// Native high-dimensional geometry (MODEL.md §2) and angular separation.

import { MODEL_SETTINGS } from './constants';
import { clamp, type Footprint } from './model';

/**
 * Explicit threshold-vector construction. For each segment, sort the unique
 * positive amounts t_1 < ... < t_k (t_0 = 0). Product i gets coordinate
 * sqrt(t_l - t_{l-1}) on interval l when m_is >= t_l. Then b_i . b_j = O_ij
 * and |b_i|^2 = sum_s m_is = M_i. Used to verify the direct formula.
 */
export function thresholdVectors(footprints: readonly Footprint[]): number[][] {
  const segmentIds = [...new Set(footprints.flatMap((f) => Object.keys(f.amounts)))].sort();
  const vectors: number[][] = footprints.map(() => []);
  for (const segmentId of segmentIds) {
    const thresholds = [
      ...new Set(footprints.map((f) => f.amounts[segmentId] ?? 0).filter((v) => v > 0)),
    ].sort((a, b) => a - b);
    let previous = 0;
    for (const t of thresholds) {
      const width = Math.sqrt(t - previous);
      footprints.forEach((f, i) => {
        vectors[i].push((f.amounts[segmentId] ?? 0) >= t ? width : 0);
      });
      previous = t;
    }
  }
  return vectors;
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** d_ij recovered from the explicit vectors: |v_i - v_j| / sqrt(2), v = b / sqrt(M). */
export function distanceFromVectors(a: readonly number[], samA: number, b: readonly number[], samB: number): number {
  let s = 0;
  const na = Math.sqrt(samA);
  const nb = Math.sqrt(samB);
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] / na - b[i] / nb;
    s += diff * diff;
  }
  return Math.sqrt(s) / Math.SQRT2;
}

/**
 * Native angular separation between competitors i and j viewed from IDV,
 * from the law of cosines. Null when either radius is numerically zero
 * (the footprint matches IDV, so its direction is undefined).
 */
export function nativeAngle(d0i: number, d0j: number, dij: number): number | null {
  const eps = MODEL_SETTINGS.zeroRadiusEpsilon;
  if (d0i <= eps || d0j <= eps) return null;
  const cos = (d0i * d0i + d0j * d0j - dij * dij) / (2 * d0i * d0j);
  if (!Number.isFinite(cos)) return null;
  // Clamp only floating-point rounding. Valid inputs come from a Euclidean
  // embedding, so |cos| exceeding 1 by more than rounding signals a bug.
  if (Math.abs(cos) > 1 + 1e-6) {
    throw new Error(`Invalid geometry: cos(angle) = ${cos}`);
  }
  return Math.acos(clamp(cos, -1, 1));
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Smallest absolute difference between two angles, in [0, pi]. */
export function angularSeparation(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}
