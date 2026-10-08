// Map fit diagnostics and modelled segment centres (MODEL.md §4–5).

import { pairDistance, pairNativeAngle, type Analysis } from './analysis';
import { MODEL_SETTINGS } from './constants';
import { angularSeparation } from './geometry';
import type { LayoutResult, Point, Segment } from './types';

export interface PairDiagnostic {
  a: string;
  b: string;
  native: number;
  displayed: number;
  /** displayed - native */
  residual: number;
  nativeAngle: number | null;
  displayedAngle: number | null;
}

export interface LayoutDiagnostics {
  pairs: PairDiagnostic[];
  /** sqrt(sum residual^2 / sum native^2) over all pairs; 0 when both are 0. */
  relativeRMSError: number;
  maxAbsError: number;
  worstPair: PairDiagnostic | null;
  /** Largest |plotted radius - native IDV distance|; should be ~1e-16. */
  maxRadiusError: number;
}

export function displayedAngle(layout: LayoutResult, a: string, b: string): number | null {
  const pa = layout.angles[a];
  const pb = layout.angles[b];
  if (pa === null || pa === undefined || pb === null || pb === undefined) return null;
  return angularSeparation(pa, pb);
}

export function pairDiagnostic(analysis: Analysis, layout: LayoutResult, a: string, b: string): PairDiagnostic {
  const pa = layout.positions[a];
  const pb = layout.positions[b];
  const native = pairDistance(analysis, a, b);
  const displayed = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  return {
    a,
    b,
    native,
    displayed,
    residual: displayed - native,
    nativeAngle: pairNativeAngle(analysis, a, b),
    displayedAngle: a === analysis.idvId || b === analysis.idvId ? null : displayedAngle(layout, a, b),
  };
}

export function layoutDiagnostics(analysis: Analysis, layout: LayoutResult): LayoutDiagnostics {
  const ids = analysis.productIds;
  const pairs: PairDiagnostic[] = [];
  let sumRes = 0;
  let sumNative = 0;
  let worst: PairDiagnostic | null = null;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p = pairDiagnostic(analysis, layout, ids[i], ids[j]);
      pairs.push(p);
      sumRes += p.residual * p.residual;
      sumNative += p.native * p.native;
      if (!worst || Math.abs(p.residual) > Math.abs(worst.residual) + 1e-15) worst = p;
    }
  }
  let relativeRMSError = 0;
  if (sumNative > 0) relativeRMSError = Math.sqrt(sumRes / sumNative);
  else if (sumRes > 1e-24) relativeRMSError = Number.POSITIVE_INFINITY;
  let maxRadiusError = 0;
  for (const id of analysis.competitorIds) {
    const p = layout.positions[id];
    maxRadiusError = Math.max(maxRadiusError, Math.abs(Math.hypot(p.x, p.y) - pairDistance(analysis, analysis.idvId, id)));
  }
  const maxAbsError = worst ? Math.abs(worst.residual) : 0;
  return {
    pairs,
    relativeRMSError,
    maxAbsError,
    worstPair: worst && maxAbsError > 1e-9 ? worst : null,
    maxRadiusError,
  };
}

export interface SegmentCenter {
  segmentId: string;
  name: string;
  point: Point;
  /** sum_i m_is */
  weight: number;
  contributions: { productId: string; amount: number }[];
}

/** z_s = sum_i m_is x_i / sum_i m_is. Zero-weight segments get no marker. */
export function segmentCenters(analysis: Analysis, layout: LayoutResult, segments: readonly Segment[]): SegmentCenter[] {
  const out: SegmentCenter[] = [];
  for (const s of segments) {
    let w = 0;
    let x = 0;
    let y = 0;
    const contributions: SegmentCenter['contributions'] = [];
    for (const id of analysis.productIds) {
      const m = analysis.footprints[id].amounts[s.id] ?? 0;
      if (m <= 0) continue;
      const p = layout.positions[id];
      w += m;
      x += m * p.x;
      y += m * p.y;
      contributions.push({ productId: id, amount: m });
    }
    if (w <= 0) continue;
    contributions.sort((a, b) => b.amount - a.amount);
    out.push({ segmentId: s.id, name: s.name, point: { x: x / w, y: y / w }, weight: w, contributions });
  }
  return out;
}

/** Groups of products that sit at exactly the same plotted point. */
export function coincidentStacks(analysis: Analysis, layout: LayoutResult): string[][] {
  const tol = MODEL_SETTINGS.zeroRadiusEpsilon;
  const stacks: string[][] = [];
  for (const id of analysis.productIds) {
    const p = layout.positions[id];
    const stack = stacks.find((s) => {
      const q = layout.positions[s[0]];
      return Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol;
    });
    if (stack) stack.push(id);
    else stacks.push([id]);
  }
  return stacks;
}
