import { describe, expect, it } from 'vitest';
import { analyzeProject, type Analysis } from '../src/domain/analysis';
import { createDemoProject } from '../src/domain/fixtures';
import { coincidentStacks, layoutDiagnostics, segmentCenters } from '../src/domain/diagnostics';
import { buildLayoutInput, computeLayout } from '../src/domain/layout';
import type { LayoutResult, Project } from '../src/domain/types';
import { projectFromRows, randomProject, tinyProject } from './fixtures';

function analyse(project: Project): Analysis {
  const o = analyzeProject(project);
  if (o.status !== 'ok') throw new Error(JSON.stringify(o.validation.issues));
  return o.analysis;
}

function layout(a: Analysis, previous?: LayoutResult | null, starts?: number): LayoutResult {
  const input = buildLayoutInput(a, previous?.positions ?? null);
  if (starts) input.budget = { starts };
  return computeLayout(input);
}

function allFinite(l: LayoutResult): boolean {
  return Object.values(l.positions).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(l.loss);
}

describe('radial layout', () => {
  it('plots every competitor at exactly its native IDV distance', () => {
    for (const project of [createDemoProject(), tinyProject(), randomProject(5, 20, 6)]) {
      const a = analyse(project);
      const l = layout(a);
      expect(allFinite(l)).toBe(true);
      const d = layoutDiagnostics(a, l);
      expect(d.maxRadiusError).toBeLessThan(1e-12);
      expect(l.positions[a.idvId]).toEqual({ x: 0, y: 0 });
    }
  });

  it('fixes the anchor at angle 0 and keeps it across edits', () => {
    const project = createDemoProject();
    const a = analyse(project);
    const l = layout(a);
    expect(a.anchorId).toBe(project.products[1].id); // earliest non-zero-radius competitor
    expect(l.angles[a.anchorId!]).toBe(0);
    // Add a product created later: the anchor must not move.
    const p2 = structuredClone(project);
    p2.layoutSettings.anchorProductId = a.anchorId!;
    p2.products.push({ ...structuredClone(project.products[4]), id: 'prd_zzzzzzzzzzzz', name: 'Later' });
    const a2 = analyse(p2);
    expect(a2.anchorId).toBe(a.anchorId);
  });

  it('reproduces exactly embeddable configurations (two competitors) with ~0 error', () => {
    const a = analyse(tinyProject());
    // b_same has radius 0, so only c_disjoint and d_small have directions: a triangle always fits in 2-D.
    const l = layout(a);
    const d = layoutDiagnostics(a, l);
    expect(d.relativeRMSError).toBeLessThan(1e-6);
    expect(d.maxAbsError).toBeLessThan(1e-6);
  });

  it('computes residuals and relative RMS error accurately', () => {
    const a = analyse(randomProject(8, 14, 7));
    const l = layout(a);
    const d = layoutDiagnostics(a, l);
    // Independent recomputation from raw positions and the native matrix.
    let num = 0;
    let den = 0;
    let maxAbs = 0;
    const ids = a.productIds;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const p = l.positions[ids[i]];
        const q = l.positions[ids[j]];
        const shown = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
        const native = a.matrices.distance[i][j];
        num += (shown - native) ** 2;
        den += native ** 2;
        maxAbs = Math.max(maxAbs, Math.abs(shown - native));
      }
    }
    expect(d.pairs).toHaveLength((ids.length * (ids.length - 1)) / 2);
    expect(d.relativeRMSError).toBeCloseTo(Math.sqrt(num / den), 12);
    expect(d.maxAbsError).toBeCloseTo(maxAbs, 12);
    expect(Math.abs(d.worstPair!.residual)).toBeCloseTo(maxAbs, 12);
    // The optimiser's loss is the competitor-pair part of the same residuals.
    let compLoss = 0;
    for (const p of d.pairs) if (p.a !== a.idvId && p.b !== a.idvId) compLoss += p.residual ** 2;
    expect(l.loss).toBeCloseTo(compLoss, 10);
  });

  it('keeps the lowest-loss candidate across starts', () => {
    const a = analyse(randomProject(21, 16, 8));
    const one = layout(a, null, 1);
    const many = layout(a, null, 12);
    expect(many.startsTried).toBe(12);
    expect(many.loss).toBeLessThanOrEqual(one.loss + 1e-12);
  });

  it('is deterministic for the same inputs and seed', () => {
    const a = analyse(randomProject(13, 10, 5));
    const l1 = layout(a);
    const l2 = layout(a);
    expect(l2.positions).toEqual(l1.positions);
  });

  it('warm start never does worse than the previous layout and aligns reflection', () => {
    const a = analyse(createDemoProject());
    const first = layout(a);
    const mirrored: LayoutResult = {
      ...first,
      positions: Object.fromEntries(Object.entries(first.positions).map(([k, p]) => [k, { x: p.x, y: -p.y }])),
    };
    const again = layout(a, mirrored);
    expect(again.loss).toBeLessThanOrEqual(first.loss + 1e-9);
    // Same fit, but the reflection follows the (mirrored) previous layout.
    for (const id of a.competitorIds) {
      expect(again.positions[id].y * mirrored.positions[id].y).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it('handles the 50-product / 30-segment limit within budget', () => {
    const a = analyse(randomProject(77, 50, 30));
    const l = layout(a);
    expect(allFinite(l)).toBe(true);
    expect(l.startsTried).toBe(12);
    expect(l.computeMs).toBeLessThan(20_000);
  });

  describe('degenerate cases render finite coordinates', () => {
    it('IDV only', () => {
      const a = analyse(projectFromRows([{ id: 'idv', sam: 10, amounts: { A: 10 } }], 100));
      const l = layout(a);
      expect(l.positions).toEqual({ idv: { x: 0, y: 0 } });
      expect(layoutDiagnostics(a, l).relativeRMSError).toBe(0);
    });

    it('one competitor', () => {
      const a = analyse(projectFromRows([{ id: 'idv', sam: 10, amounts: { A: 10 } }, { id: 'c', sam: 5, amounts: { A: 3, B: 2 } }], 100));
      const l = layout(a);
      expect(allFinite(l)).toBe(true);
      expect(l.positions.c.y).toBe(0);
      expect(l.positions.c.x).toBeCloseTo(a.competitors[0].distance, 12);
    });

    it('all distances zero (every footprint identical)', () => {
      const rows = ['idv', 'b', 'c'].map((id) => ({ id, sam: 10, amounts: { A: 6, B: 4 } }));
      const a = analyse(projectFromRows(rows, 100));
      const l = layout(a);
      expect(allFinite(l)).toBe(true);
      expect(a.anchorId).toBeNull();
      expect(l.angles.b).toBeNull();
      const d = layoutDiagnostics(a, l);
      expect(d.relativeRMSError).toBe(0);
      expect(coincidentStacks(a, l)).toEqual([['idv', 'b', 'c']]);
    });

    it('disjoint products and equal radii', () => {
      const a = analyse(
        projectFromRows(
          [
            { id: 'idv', sam: 10, amounts: { A: 10 } },
            { id: 'b', sam: 10, amounts: { B: 10 } },
            { id: 'c', sam: 10, amounts: { C: 10 } },
            { id: 'd', sam: 10, amounts: { D: 10 } },
          ],
          100,
        ),
      );
      const l = layout(a);
      expect(allFinite(l)).toBe(true);
      for (const id of ['b', 'c', 'd']) expect(Math.hypot(l.positions[id].x, l.positions[id].y)).toBeCloseTo(1, 12);
    });

    it('coincident competitors share one exact position (a stack), no jitter', () => {
      const a = analyse(
        projectFromRows(
          [
            { id: 'idv', sam: 10, amounts: { A: 10 } },
            { id: 'b', sam: 8, amounts: { A: 4, B: 4 } },
            { id: 'c', sam: 8, amounts: { A: 4, B: 4 } },
            { id: 'd', sam: 6, amounts: { C: 6 } },
          ],
          100,
        ),
      );
      const l = layout(a);
      expect(l.positions.b).toEqual(l.positions.c);
      const stacks = coincidentStacks(a, l);
      expect(stacks).toContainEqual(['b', 'c']);
    });
  });
});

describe('modelled segment centres', () => {
  it('two equal weights give the midpoint', () => {
    const a = analyse(
      projectFromRows(
        [
          { id: 'idv', sam: 10, amounts: { A: 10 } },
          { id: 'b', sam: 10, amounts: { B: 5, A: 5 } },
          { id: 'c', sam: 5, amounts: { B: 5 } },
        ],
        100,
      ),
    );
    const l = layout(a);
    const centers = segmentCenters(a, l, [{ id: 'seg_B', name: 'B' }]);
    // B: b has 5, c has 5 -> midpoint of b and c.
    expect(centers[0].point.x).toBeCloseTo((l.positions.b.x + l.positions.c.x) / 2, 12);
    expect(centers[0].point.y).toBeCloseTo((l.positions.b.y + l.positions.c.y) / 2, 12);
  });

  it('stay inside the convex hull of contributing points; zero-weight segments get no marker', () => {
    const project = createDemoProject();
    project.segments.push({ id: 'seg_unused', name: 'Unused' });
    const a = analyse(project);
    const l = layout(a);
    const centers = segmentCenters(a, l, project.segments);
    expect(centers.find((c) => c.segmentId === 'seg_unused')).toBeUndefined();
    for (const c of centers) {
      const pts = c.contributions.map((x) => l.positions[x.productId]);
      expect(insideHull(c.point, pts)).toBe(true);
    }
  });
});

function insideHull(p: { x: number; y: number }, pts: { x: number; y: number }[]): boolean {
  const tol = 1e-9;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < tol;
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: typeof p, a: typeof p, b: typeof p) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof pts = [];
  for (const q of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: typeof pts = [];
  for (const q of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length < 3) {
    // Collinear points: the centroid must lie on the segment between the extremes.
    const [a, b] = [sorted[0], sorted[sorted.length - 1]];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
    return Math.abs(cross(a, b, p)) / len < tol && t >= -tol && t <= 1 + tol;
  }
  return hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], p) >= -tol);
}
