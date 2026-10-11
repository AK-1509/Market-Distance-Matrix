/**
 * Constrained radial layout. The IDV sits at the origin; each competitor's radius is fixed
 * to its native distance d_0i. Only angles are optimized, minimizing
 *   loss = sum_{i<j} (||p_i - p_j|| - d_ij)^2
 * over competitor pairs. Coordinates are never scaled. This is a constrained fit, not MDS:
 * IDV radii are exact, competitor-to-competitor distances are approximated.
 *
 * Optimizer: seeded, bounded multistart gradient descent with backtracking line search
 * (monotone), analytic gradient, convergence stop on loss improvement. Starts: warm start
 * from the previous layout (if any), a classical-MDS-derived ordering, an even angular
 * ordering, then seeded random starts. The lowest-loss candidate is retained.
 */
import { compareIds } from './ids';
import { MODEL_SETTINGS } from './settings';
import { normalizeAngle } from './geometry';
import type { Point } from './types';

export interface RadialInput {
  /** Competitor IDs in stable-ID order. */
  ids: string[];
  /** Native IDV distances d_0i, aligned with ids. */
  radii: number[];
  /** Native competitor-to-competitor distances, aligned with ids. */
  target: number[][];
  /** Requested anchor; resolved with `resolveAnchor`. */
  anchorId: string | null;
  seed: number;
  /** Previous layout angles by product ID, for warm start and reflection alignment. */
  previousAngles?: Record<string, number> | null;
  options?: Partial<OptimizerOptions>;
}

export interface OptimizerOptions {
  starts: number;
  maxIterations: number;
  convergenceTolerance: number;
  patience: number;
  equalFitTolerance: number;
}

export interface RadialLayout {
  anchorId: string | null;
  /** Angles (radians, [0, 2π)) for competitors with nonzero radius. */
  angles: Record<string, number>;
  /** Positions for every competitor in model units (zero-radius → origin). */
  positions: Record<string, Point>;
  loss: number;
  startsRun: number;
  bestStart: number;
  bestStartKind: StartKind;
  iterations: number;
}

export type StartKind = 'previous' | 'mds' | 'even' | 'random';

const DEFAULTS: OptimizerOptions = {
  starts: MODEL_SETTINGS.optimizer.starts,
  maxIterations: MODEL_SETTINGS.optimizer.maxIterations,
  convergenceTolerance: MODEL_SETTINGS.optimizer.convergenceTolerance,
  patience: MODEL_SETTINGS.optimizer.patience,
  equalFitTolerance: MODEL_SETTINGS.optimizer.equalFitTolerance,
};

/** Deterministic PRNG (mulberry32). */
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

/**
 * Keep the requested anchor while it exists with a nonzero radius; otherwise use the
 * nearest nonzero-radius competitor (ties by stable ID). Null when none qualifies.
 */
export function resolveAnchor(ids: readonly string[], radii: readonly number[], requested: string | null | undefined): string | null {
  const z = MODEL_SETTINGS.zeroRadius;
  if (requested) {
    const k = ids.indexOf(requested);
    if (k >= 0 && radii[k] > z) return requested;
  }
  let best = -1;
  for (let k = 0; k < ids.length; k++) {
    if (radii[k] <= z) continue;
    if (best < 0 || radii[k] < radii[best] || (radii[k] === radii[best] && compareIds(ids[k], ids[best]) < 0)) best = k;
  }
  return best >= 0 ? ids[best] : null;
}

/** Loss and analytic gradient with respect to angles. */
export function lossAndGradient(
  phi: Float64Array,
  r: readonly number[],
  target: readonly (readonly number[])[],
  grad: Float64Array | null,
): number {
  const n = phi.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = r[i] * Math.cos(phi[i]);
    y[i] = r[i] * Math.sin(phi[i]);
  }
  if (grad) grad.fill(0);
  let loss = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const e = Math.sqrt(dx * dx + dy * dy);
      const res = e - target[i][j];
      loss += res * res;
      if (grad && e > 1e-12) {
        // d e_ij / d phi_i = (x_j y_i - x_i y_j) / e ; d e_ij / d phi_j = -(same)
        const c = (2 * res * (x[j] * y[i] - x[i] * y[j])) / e;
        grad[i] += c;
        grad[j] -= c;
      }
    }
  }
  return loss;
}

/** Monotone gradient descent with backtracking (Armijo) on the free angles. */
function descend(
  phi0: Float64Array,
  free: readonly boolean[],
  r: readonly number[],
  target: readonly (readonly number[])[],
  opts: OptimizerOptions,
): { phi: Float64Array; loss: number; iterations: number } {
  const n = phi0.length;
  let phi = Float64Array.from(phi0);
  const grad = new Float64Array(n);
  const trial = new Float64Array(n);
  let loss = lossAndGradient(phi, r, target, grad);
  let step = 0.1;
  let stall = 0;
  let it = 0;
  for (; it < opts.maxIterations; it++) {
    let g2 = 0;
    for (let i = 0; i < n; i++) {
      if (!free[i]) grad[i] = 0;
      g2 += grad[i] * grad[i];
    }
    if (g2 < 1e-28 || loss < 1e-24) break;
    let accepted = false;
    let newLoss = loss;
    while (step > 1e-16) {
      for (let i = 0; i < n; i++) trial[i] = phi[i] - step * grad[i];
      newLoss = lossAndGradient(trial, r, target, null);
      if (newLoss <= loss - 1e-4 * step * g2) {
        accepted = true;
        break;
      }
      step *= 0.5;
    }
    if (!accepted) break;
    const improvement = loss - newLoss;
    phi = Float64Array.from(trial);
    loss = lossAndGradient(phi, r, target, grad);
    step = Math.min(step * 1.5, 10);
    if (improvement <= opts.convergenceTolerance * Math.max(loss, 1e-30)) {
      stall++;
      if (stall >= opts.patience) {
        it++;
        break;
      }
    } else {
      stall = 0;
    }
  }
  return { phi, loss, iterations: it };
}

/**
 * Initial angles from classical MDS of the full native distance matrix (IDV included),
 * read as directions from the IDV's embedded position. Returns null if degenerate.
 */
export function mdsInitialAngles(radii: readonly number[], target: readonly (readonly number[])[]): number[] | null {
  const m = radii.length + 1;
  const d2 = (i: number, j: number): number => {
    if (i === j) return 0;
    if (i === 0) return radii[j - 1] ** 2;
    if (j === 0) return radii[i - 1] ** 2;
    return target[i - 1][j - 1] ** 2;
  };
  const rowMean = new Float64Array(m);
  let grand = 0;
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += d2(i, j);
    rowMean[i] = s / m;
    grand += s;
  }
  grand /= m * m;
  const B: Float64Array[] = Array.from({ length: m }, (_, i) => {
    const row = new Float64Array(m);
    for (let j = 0; j < m; j++) row[j] = -0.5 * (d2(i, j) - rowMean[i] - rowMean[j] + grand);
    return row;
  });
  const vecs: Float64Array[] = [];
  const vals: number[] = [];
  for (let k = 0; k < 2; k++) {
    let v = new Float64Array(m);
    for (let i = 0; i < m; i++) v[i] = 1 + ((i * 7919 + k * 104729) % 97) / 97;
    let lambda = 0;
    for (let iter = 0; iter < 300; iter++) {
      const w = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        let s = 0;
        for (let j = 0; j < m; j++) s += B[i][j] * v[j];
        w[i] = s;
      }
      for (let q = 0; q < vecs.length; q++) {
        let proj = 0;
        for (let i = 0; i < m; i++) proj += w[i] * vecs[q][i];
        for (let i = 0; i < m; i++) w[i] -= proj * vecs[q][i];
      }
      let norm = 0;
      for (let i = 0; i < m; i++) norm += w[i] * w[i];
      norm = Math.sqrt(norm);
      if (norm < 1e-15) {
        lambda = 0;
        break;
      }
      lambda = norm;
      for (let i = 0; i < m; i++) w[i] /= norm;
      v = w;
    }
    vecs.push(v);
    vals.push(lambda);
  }
  if (!(vals[0] > 1e-12)) return null;
  const sx = Math.sqrt(vals[0]);
  const sy = Math.sqrt(Math.max(0, vals[1]));
  const X = (i: number) => vecs[0][i] * sx;
  const Y = (i: number) => vecs[1][i] * sy;
  const out: number[] = [];
  for (let i = 1; i < m; i++) out.push(Math.atan2(Y(i) - Y(0), X(i) - X(0)));
  return out.every(Number.isFinite) ? out : null;
}

function positionsFrom(phi: ArrayLike<number>, r: readonly number[]): Point[] {
  return r.map((ri, i) => ({ x: ri * Math.cos(phi[i]), y: ri * Math.sin(phi[i]) }));
}

function displacement(a: Point[], b: Point[], mask: readonly boolean[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) s += (a[i].x - b[i].x) ** 2 + (a[i].y - b[i].y) ** 2;
  return s;
}

export function fitRadialLayout(input: RadialInput): RadialLayout {
  const opts: OptimizerOptions = { ...DEFAULTS, ...input.options };
  const { ids, radii, target } = input;
  const n = ids.length;
  const z = MODEL_SETTINGS.zeroRadius;
  const active = radii.map((r) => r > z);
  const anchorId = resolveAnchor(ids, radii, input.anchorId);
  const anchor = anchorId ? ids.indexOf(anchorId) : -1;
  const free = active.map((a, i) => a && i !== anchor);
  const freeCount = free.filter(Boolean).length;

  const prev = input.previousAngles ?? null;
  const prevMask = ids.map((id, i) => active[i] && prev !== null && Number.isFinite(prev[id]));
  const hasPrev = prevMask.some((m, i) => m && i !== anchor);

  // Align a previous layout so its anchor (if present) sits at angle 0.
  const prevAligned: Float64Array | null = hasPrev
    ? (() => {
        const rot = anchorId && prev && Number.isFinite(prev[anchorId]) ? prev[anchorId] : 0;
        return Float64Array.from(ids.map((id, i) => (prevMask[i] ? (prev as Record<string, number>)[id] - rot : 0)));
      })()
    : null;
  const prevPositions = prevAligned ? positionsFrom(prevAligned, radii) : null;

  const rotateToAnchor = (phi: Float64Array): Float64Array => {
    const rot = anchor >= 0 ? phi[anchor] : 0;
    return Float64Array.from(phi, (v, i) => (active[i] ? v - rot : 0));
  };

  // Trivial cases: nothing to optimize.
  if (freeCount === 0) {
    const phi = new Float64Array(n);
    return finish(phi, 0, 'even', 0);
  }

  const mds = mdsInitialAngles(radii, target);
  const starts: { kind: StartKind; phi: Float64Array }[] = [];
  if (prevAligned) {
    const fill = mds ?? ids.map((_, i) => (2 * Math.PI * i) / n);
    starts.push({ kind: 'previous', phi: Float64Array.from(ids.map((_, i) => (prevMask[i] ? prevAligned[i] : fill[i]))) });
  }
  if (mds) starts.push({ kind: 'mds', phi: Float64Array.from(mds) });
  starts.push({ kind: 'even', phi: Float64Array.from(ids.map((_, i) => (2 * Math.PI * i) / n)) });
  const rand = mulberry32(input.seed);
  while (starts.length < Math.max(1, opts.starts)) {
    starts.push({ kind: 'random', phi: Float64Array.from(ids, () => rand() * 2 * Math.PI) });
  }
  starts.length = Math.max(1, Math.min(starts.length, opts.starts));

  let best: { phi: Float64Array; loss: number; start: number; kind: StartKind; closeness: number } | null = null;
  let totalIterations = 0;
  starts.forEach((s, k) => {
    const res = descend(rotateToAnchor(s.phi), free, radii, target, opts);
    totalIterations += res.iterations;
    const phi = orient(res.phi);
    const closeness = prevPositions ? displacement(positionsFrom(phi, radii), prevPositions, prevMask) : 0;
    if (!best) {
      best = { phi, loss: res.loss, start: k, kind: s.kind, closeness };
      return;
    }
    const tol = opts.equalFitTolerance * Math.max(res.loss, best.loss) + 1e-15;
    if (res.loss < best.loss - tol || (Math.abs(res.loss - best.loss) <= tol && closeness < best.closeness - 1e-12)) {
      best = { phi, loss: res.loss, start: k, kind: s.kind, closeness };
    }
  });
  const chosen = best as unknown as { phi: Float64Array; start: number; kind: StartKind };
  return finish(chosen.phi, chosen.start, chosen.kind, totalIterations, starts.length);

  /** Pick the reflection (y → -y about the anchor axis) that matches the previous layout. */
  function orient(phi: Float64Array): Float64Array {
    const mirrored = Float64Array.from(phi, (v) => -v);
    if (prevPositions) {
      const a = displacement(positionsFrom(phi, radii), prevPositions, prevMask);
      const b = displacement(positionsFrom(mirrored, radii), prevPositions, prevMask);
      return b < a - 1e-12 ? mirrored : phi;
    }
    // Deterministic convention: first free competitor (stable order) above the anchor axis.
    for (let i = 0; i < n; i++) {
      if (!free[i]) continue;
      const s = Math.sin(phi[i]);
      if (Math.abs(s) > 1e-9) return s > 0 ? phi : mirrored;
    }
    return phi;
  }

  function finish(phi: Float64Array, start: number, kind: StartKind, iterations: number, startsRun = 0): RadialLayout {
    const angles: Record<string, number> = {};
    const positions: Record<string, Point> = {};
    ids.forEach((id, i) => {
      if (active[i]) {
        const a = normalizeAngle(phi[i]);
        angles[id] = a;
        positions[id] = { x: radii[i] * Math.cos(a), y: radii[i] * Math.sin(a) };
      } else {
        positions[id] = { x: 0, y: 0 };
      }
    });
    const finalLoss = lossAndGradient(Float64Array.from(ids.map((id, i) => (active[i] ? angles[id] : 0))), radii, target, null);
    return { anchorId, angles, positions, loss: finalLoss, startsRun, bestStart: start, bestStartKind: kind, iterations };
  }
}
