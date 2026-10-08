// Constrained radial layout (MODEL.md §4).
//
// IDV sits at the origin. Each competitor i is placed at radius r_i = d_0i
// (exact, never changed) and angle phi_i. Only the angles are optimised, to
// minimise  sum_{i<j} (|p_i - p_j| - d_ij)^2  over competitor pairs.
// A non-zero-radius anchor is fixed at angle 0 to remove rotation; the
// remaining reflection is aligned to the previous layout (or a fixed
// convention). Coordinates are never scaled.

import { LAYOUT_BUDGET, MODEL_SETTINGS } from './constants';
import type { Analysis } from './analysis';
import type { LayoutResult, Point } from './types';

export interface LayoutInput {
  inputHash: string;
  idvId: string;
  /** Competitors in stable ID order. */
  competitorIds: string[];
  /** r_i = d_0i for each competitor. */
  radii: number[];
  /** Native competitor-to-competitor distances, same order as competitorIds. */
  distances: number[][];
  anchorId: string | null;
  seed: number;
  /** Previous positions (data space) for warm start and reflection alignment. */
  previous?: Record<string, Point> | null;
  budget?: Partial<{ starts: number; maxIterations: number }>;
}

export function buildLayoutInput(analysis: Analysis, previous?: Record<string, Point> | null): LayoutInput {
  const ids = analysis.competitorIds;
  const D = analysis.matrices.distance;
  return {
    inputHash: analysis.inputHash,
    idvId: analysis.idvId,
    competitorIds: [...ids],
    radii: ids.map((id) => D[0][analysis.index[id]]),
    distances: ids.map((a) => ids.map((b) => D[analysis.index[a]][analysis.index[b]])),
    anchorId: analysis.anchorId,
    seed: analysis.seed,
    previous: previous ?? null,
  };
}

/** Small seeded PRNG (mulberry32) so alternate starts are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function computeLayout(input: LayoutInput): LayoutResult {
  const started = now();
  const { competitorIds: ids, radii, distances: D } = input;
  const n = ids.length;
  const eps = MODEL_SETTINGS.zeroRadiusEpsilon;
  const maxStarts = Math.max(1, input.budget?.starts ?? LAYOUT_BUDGET.starts);
  const maxIterations = Math.max(1, input.budget?.maxIterations ?? LAYOUT_BUDGET.maxIterations);

  const anchorIdx = input.anchorId ? ids.indexOf(input.anchorId) : -1;
  const hasRadius = radii.map((r) => r > eps);
  // Competitors with identical footprints (native distance 0) share one angle,
  // so a coincident pair is drawn as an exact stack rather than a near miss.
  const rep = ids.map((_, i) => i);
  for (let i = 0; i < n; i++) {
    if (!hasRadius[i]) continue;
    for (let j = 0; j < i; j++) {
      if (hasRadius[j] && rep[j] === j && D[i][j] <= 1e-12) {
        rep[i] = j;
        break;
      }
    }
  }
  if (anchorIdx >= 0) {
    // The anchor always represents its own coincident group.
    const anchorRep = rep[anchorIdx];
    for (let i = 0; i < n; i++) if (rep[i] === anchorRep) rep[i] = anchorIdx;
  }
  const free: number[] = [];
  for (let i = 0; i < n; i++) if (hasRadius[i] && i !== anchorIdx && rep[i] === i) free.push(i);
  const followers: number[] = [];
  for (let i = 0; i < n; i++) if (hasRadius[i] && rep[i] !== i) followers.push(i);

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const grad = new Float64Array(n);

  /** Loss over all competitor pairs; fills `grad` (w.r.t. angles) when asked. */
  const evaluate = (theta: Float64Array, withGrad: boolean): number => {
    for (const i of followers) theta[i] = theta[rep[i]];
    for (let i = 0; i < n; i++) {
      xs[i] = hasRadius[i] ? radii[i] * Math.cos(theta[i]) : 0;
      ys[i] = hasRadius[i] ? radii[i] * Math.sin(theta[i]) : 0;
    }
    if (withGrad) grad.fill(0);
    let loss = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = xs[i] - xs[j];
        const dy = ys[i] - ys[j];
        const e = Math.sqrt(dx * dx + dy * dy);
        const res = e - D[i][j];
        loss += res * res;
        if (withGrad && e > 1e-12) {
          // d e_ij / d phi_i = (x_j y_i - x_i y_j) / e_ij ; d e_ij / d phi_j is its negative.
          const de = (xs[j] * ys[i] - xs[i] * ys[j]) / e;
          grad[i] += 2 * res * de;
          grad[j] -= 2 * res * de;
        }
      }
    }
    if (withGrad) for (const i of followers) grad[rep[i]] += grad[i];
    return loss;
  };

  const baseTheta = (): Float64Array => new Float64Array(n);

  const trivial = anchorIdx < 0 || free.length === 0;
  let bestTheta = baseTheta();
  let bestLoss = Number.POSITIVE_INFINITY;
  let bestStart = 'trivial';
  let startsTried = 0;
  let totalIterations = 0;

  // Previous angles expressed relative to the current anchor's previous direction.
  let prevAngles: Map<number, number> | null = null;
  if (input.previous && anchorIdx >= 0) {
    const pa = input.previous[ids[anchorIdx]];
    const offset = pa && Math.hypot(pa.x, pa.y) > eps ? Math.atan2(pa.y, pa.x) : 0;
    prevAngles = new Map();
    for (const i of free) {
      const p = input.previous[ids[i]];
      if (p && Math.hypot(p.x, p.y) > eps) prevAngles.set(i, wrapAngle(Math.atan2(p.y, p.x) - offset));
    }
    if (prevAngles.size === 0) prevAngles = null;
  }

  /** Sequential placement by the law of cosines against already-placed points. */
  const greedy = (preset: Map<number, number> | null): Float64Array => {
    const theta = baseTheta();
    const placed: number[] = anchorIdx >= 0 ? [anchorIdx] : [];
    if (preset) {
      for (const [i, a] of preset) {
        theta[i] = a;
        placed.push(i);
      }
    }
    for (const i of free) {
      if (preset?.has(i)) continue;
      let bestA = 0;
      let bestCost = Number.POSITIVE_INFINITY;
      for (const p of placed) {
        const c = (radii[p] ** 2 + radii[i] ** 2 - D[p][i] ** 2) / (2 * radii[p] * radii[i]);
        const delta = Math.acos(Math.max(-1, Math.min(1, c)));
        for (const cand of [theta[p] + delta, theta[p] - delta]) {
          let cost = 0;
          for (const q of placed) {
            const e = Math.sqrt(radii[i] ** 2 + radii[q] ** 2 - 2 * radii[i] * radii[q] * Math.cos(cand - theta[q]));
            cost += (e - D[i][q]) ** 2;
          }
          if (cost < bestCost - 1e-15) {
            bestCost = cost;
            bestA = cand;
          }
        }
      }
      theta[i] = wrapAngle(bestA);
      placed.push(i);
    }
    for (const i of followers) theta[i] = theta[rep[i]];
    return theta;
  };

  const optimise = (start: Float64Array): { theta: Float64Array; loss: number; iterations: number } => {
    const theta = Float64Array.from(start);
    const m = new Float64Array(n);
    const v = new Float64Array(n);
    const b1 = 0.9;
    const b2 = 0.999;
    const best = Float64Array.from(theta);
    let bestL = evaluate(theta, false);
    let windowStart = bestL;
    let iterations = 0;
    for (let t = 1; t <= maxIterations; t++) {
      iterations = t;
      const loss = evaluate(theta, true);
      if (loss < bestL) {
        bestL = loss;
        best.set(theta);
      }
      if (bestL <= 1e-24) break;
      if (t % LAYOUT_BUDGET.windowSize === 0) {
        if (windowStart - bestL <= LAYOUT_BUDGET.absoluteTolerance + LAYOUT_BUDGET.relativeTolerance * windowStart) break;
        windowStart = bestL;
      }
      // Exponentially decaying step so the final iterations refine rather than oscillate.
      const lr = LAYOUT_BUDGET.learningRate * Math.pow(1e-3, t / maxIterations);
      for (const k of free) {
        const g = grad[k];
        m[k] = b1 * m[k] + (1 - b1) * g;
        v[k] = b2 * v[k] + (1 - b2) * g * g;
        const mh = m[k] / (1 - Math.pow(b1, t));
        const vh = v[k] / (1 - Math.pow(b2, t));
        theta[k] -= (lr * mh) / (Math.sqrt(vh) + 1e-12);
      }
    }
    // Polish: monotone gradient descent with backtracking line search.
    theta.set(best);
    let loss = evaluate(theta, true);
    const trial = new Float64Array(n);
    for (let k = 0; k < 200 && loss > 1e-24; k++) {
      let g2 = 0;
      for (const i of free) g2 += grad[i] * grad[i];
      if (g2 < 1e-28) break;
      let step = 1;
      let improved = false;
      const g = Float64Array.from(grad);
      for (let h = 0; h < 40; h++) {
        trial.set(theta);
        for (const i of free) trial[i] -= step * g[i];
        const l2 = evaluate(trial, false);
        if (l2 <= loss - 1e-4 * step * g2) {
          theta.set(trial);
          loss = evaluate(theta, true);
          improved = true;
          break;
        }
        step /= 2;
      }
      iterations += 1;
      if (!improved) break;
    }
    for (let i = 0; i < n; i++) theta[i] = wrapAngle(theta[i]);
    for (const i of followers) theta[i] = theta[rep[i]];
    return { theta, loss: evaluate(theta, false), iterations };
  };

  if (trivial) {
    bestTheta = baseTheta();
    bestLoss = evaluate(bestTheta, false);
  } else {
    const starts: { label: string; theta: Float64Array }[] = [];
    if (prevAngles) starts.push({ label: 'warm', theta: greedy(prevAngles) });
    starts.push({ label: 'greedy', theta: greedy(null) });
    const rng = mulberry32(input.seed);
    for (let k = 1; starts.length < maxStarts; k++) {
      const theta = baseTheta();
      for (const i of free) theta[i] = rng() * 2 * Math.PI - Math.PI;
      for (const i of followers) theta[i] = theta[rep[i]];
      starts.push({ label: `random-${k}`, theta });
    }
    for (const s of starts) {
      const r = optimise(s.theta);
      startsTried += 1;
      totalIterations += r.iterations;
      // Strictly better only: earlier starts (warm, then greedy) win ties.
      if (!Number.isFinite(bestLoss) || r.loss < bestLoss - 1e-15 * Math.max(1, bestLoss)) {
        bestLoss = r.loss;
        bestTheta = r.theta;
        bestStart = s.label;
      }
    }
  }

  // Reflection about the anchor axis leaves the loss unchanged; pick the one
  // closest to the previous layout, else a fixed convention.
  let reflect = false;
  if (!trivial) {
    if (prevAngles) {
      let same = 0;
      let mirrored = 0;
      for (const [i, pa] of prevAngles) {
        const r = radii[i];
        const px = r * Math.cos(pa);
        const py = r * Math.sin(pa);
        const x = r * Math.cos(bestTheta[i]);
        const y = r * Math.sin(bestTheta[i]);
        same += (x - px) ** 2 + (y - py) ** 2;
        mirrored += (x - px) ** 2 + (-y - py) ** 2;
      }
      reflect = mirrored < same - 1e-12;
    } else {
      const first = free.find((i) => Math.abs(Math.sin(bestTheta[i])) > 1e-9);
      reflect = first !== undefined && Math.sin(bestTheta[first]) < 0;
    }
  }

  const angles: Record<string, number | null> = {};
  const positions: Record<string, Point> = { [input.idvId]: { x: 0, y: 0 } };
  for (let i = 0; i < n; i++) {
    if (!hasRadius[i]) {
      angles[ids[i]] = null;
      positions[ids[i]] = { x: 0, y: 0 };
      continue;
    }
    const a = wrapAngle(reflect ? -bestTheta[i] : bestTheta[i]);
    angles[ids[i]] = a;
    positions[ids[i]] = { x: radii[i] * Math.cos(a), y: radii[i] * Math.sin(a) };
  }

  return {
    inputHash: input.inputHash,
    anchorId: anchorIdx >= 0 ? ids[anchorIdx] : null,
    angles,
    positions,
    loss: bestLoss,
    startsTried,
    iterations: totalIterations,
    bestStart,
    computeMs: Math.round(now() - started),
  };
}
