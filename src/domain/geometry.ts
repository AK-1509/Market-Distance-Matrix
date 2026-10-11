/** Angle helpers for native (high-dimensional) geometry viewed from the IDV. */
import { MODEL_SETTINGS } from './settings';

/** Rounding slack allowed on cosAngle before geometry is considered invalid. */
const COS_SLACK = 1e-6;

/**
 * Native angular separation between competitors i and j as seen from the IDV:
 *   cos = (d0i^2 + d0j^2 - dij^2) / (2 d0i d0j)
 * Returns null when either radius is numerically zero (footprint matches the IDV).
 * Only floating-point rounding is clamped; grossly invalid geometry throws.
 */
export function nativeAngle(d0i: number, d0j: number, dij: number): number | null {
  if (d0i <= MODEL_SETTINGS.zeroRadius || d0j <= MODEL_SETTINGS.zeroRadius) return null;
  const cos = (d0i * d0i + d0j * d0j - dij * dij) / (2 * d0i * d0j);
  if (!Number.isFinite(cos) || cos > 1 + COS_SLACK || cos < -1 - COS_SLACK) {
    throw new Error(`Invalid geometry: cosAngle=${cos}`);
  }
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

/** Angle between two displayed position vectors (from the IDV at the origin), or null. */
export function displayedAngle(ax: number, ay: number, bx: number, by: number): number | null {
  const ra = Math.hypot(ax, ay);
  const rb = Math.hypot(bx, by);
  if (ra <= MODEL_SETTINGS.zeroRadius || rb <= MODEL_SETTINGS.zeroRadius) return null;
  const cos = (ax * bx + ay * by) / (ra * rb);
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

export const toDegrees = (rad: number): number => (rad * 180) / Math.PI;
export const toRadians = (deg: number): number => (deg * Math.PI) / 180;

export function normalizeAngle(a: number): number {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}
