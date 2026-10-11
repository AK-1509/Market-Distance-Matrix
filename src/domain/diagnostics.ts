/**
 * Map distance error: how far displayed 2D distances deviate from native modeled distances.
 *   residual_ij = displayed_ij - native_ij
 *   relativeRMSError = sqrt(sum residual^2 / sum native^2)   (all plotted pairs, IDV pairs included)
 * This describes projection distortion only — not data confidence or wrong customers.
 */
import { compareIds } from './ids';
import { displayedAngle } from './geometry';
import type { Point } from './types';

export interface PairDiagnostic {
  a: string;
  b: string;
  native: number;
  displayed: number;
  residual: number;
  involvesIdv: boolean;
  /** Native angular separation seen from the IDV (competitor pairs only). */
  nativeAngle: number | null;
  /** Displayed angular separation seen from the IDV (competitor pairs only). */
  displayedAngle: number | null;
}

export interface LayoutDiagnostics {
  pairs: PairDiagnostic[];
  relativeRMSError: number;
  maxAbsError: number;
  worstPair: PairDiagnostic | null;
}

/**
 * @param order IDV first, then competitors (matrix order of `native`).
 * @param positions positions by product ID; the IDV is at the origin.
 * @param nativeAngles competitor × competitor native angles aligned with order.slice(1).
 */
export function layoutDiagnostics(
  order: readonly string[],
  positions: Record<string, Point>,
  native: readonly (readonly number[])[],
  nativeAngles: readonly (readonly (number | null)[])[],
): LayoutDiagnostics {
  const pos = (id: string, k: number): Point => (k === 0 ? { x: 0, y: 0 } : positions[id]);
  const pairs: PairDiagnostic[] = [];
  let sumRes2 = 0;
  let sumNat2 = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const pi = pos(order[i], i);
      const pj = pos(order[j], j);
      const displayed = Math.hypot(pi.x - pj.x, pi.y - pj.y);
      const nat = native[i][j];
      const residual = displayed - nat;
      sumRes2 += residual * residual;
      sumNat2 += nat * nat;
      const involvesIdv = i === 0;
      pairs.push({
        a: order[i],
        b: order[j],
        native: nat,
        displayed,
        residual,
        involvesIdv,
        nativeAngle: involvesIdv ? null : nativeAngles[i - 1][j - 1],
        displayedAngle: involvesIdv ? null : displayedAngle(pi.x, pi.y, pj.x, pj.y),
      });
    }
  }
  const relativeRMSError = sumNat2 === 0 ? (sumRes2 === 0 ? 0 : Number.POSITIVE_INFINITY) : Math.sqrt(sumRes2 / sumNat2);
  let worst: PairDiagnostic | null = null;
  for (const p of pairs) {
    if (
      !worst ||
      Math.abs(p.residual) > Math.abs(worst.residual) + 1e-15 ||
      (Math.abs(Math.abs(p.residual) - Math.abs(worst.residual)) <= 1e-15 && compareIds(p.a + p.b, worst.a + worst.b) < 0)
    ) {
      worst = p;
    }
  }
  const maxAbsError = worst ? Math.abs(worst.residual) : 0;
  return { pairs, relativeRMSError, maxAbsError, worstPair: worst && maxAbsError > 1e-12 ? worst : null };
}
