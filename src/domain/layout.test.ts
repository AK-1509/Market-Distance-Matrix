import { describe, expect, it } from 'vitest';
import { analyzeProject } from './analysis';
import { segmentCentroids } from './centroids';
import { layoutDiagnostics } from './diagnostics';
import { createProduct, createProject } from './factory';
import { LatestJobTracker } from './jobs';
import { comparePrices, formatPrice } from './price';
import { fitRadialLayout, lossAndGradient, mulberry32, resolveAnchor, type RadialInput } from './radial';
import { assessProject } from './validation';
import { createExampleProject } from '../fixtures/example';
import { createTinyProject } from '../fixtures/tiny';
import type { Analysis } from './analysis';
import type { Point, Product } from './types';

function radialInputFrom(a: Analysis, seed = 1): RadialInput {
  return {
    ids: a.competitorIds,
    radii: a.competitors.map((c) => c.distance),
    target: a.competitorIds.map((_, i) => a.competitorIds.map((__, j) => a.distance[i + 1][j + 1])),
    anchorId: null,
    seed,
  };
}

function allFinite(layout: ReturnType<typeof fitRadialLayout>): boolean {
  return Object.values(layout.positions).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(layout.loss);
}

describe('radial layout', () => {
  it('preserves every IDV radius exactly (example fixture)', () => {
    const a = analyzeProject(createExampleProject());
    const input = radialInputFrom(a);
    const layout = fitRadialLayout(input);
    a.competitors.forEach((c) => {
      const p = layout.positions[c.productId];
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(c.distance, 12);
    });
    expect(allFinite(layout)).toBe(true);
    // Anchor fixed to the reference direction.
    expect(layout.angles[layout.anchorId!]).toBeCloseTo(0, 12);
  });

  it('recovers an exactly embeddable 2D configuration (global optimum found)', () => {
    const rand = mulberry32(99);
    const pts: Point[] = Array.from({ length: 7 }, () => {
      const r = 0.2 + 0.8 * rand();
      const t = rand() * 2 * Math.PI;
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    });
    const ids = pts.map((_, i) => `c${i}`);
    const layout = fitRadialLayout({
      ids,
      radii: pts.map((p) => Math.hypot(p.x, p.y)),
      target: pts.map((p) => pts.map((q) => Math.hypot(p.x - q.x, p.y - q.y))),
      anchorId: null,
      seed: 3,
    });
    expect(layout.loss).toBeLessThan(1e-10);
  });

  it('two competitors are placed exactly at their native angle', () => {
    const layout = fitRadialLayout({ ids: ['a', 'b'], radii: [1, 1], target: [[0, 1], [1, 0]], anchorId: null, seed: 1 });
    const pa = layout.positions.a;
    const pb = layout.positions.b;
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeCloseTo(1, 9);
    expect(layout.loss).toBeLessThan(1e-16);
  });

  it('is deterministic for the same seed and input', () => {
    const a = analyzeProject(createExampleProject());
    const l1 = fitRadialLayout(radialInputFrom(a, 5));
    const l2 = fitRadialLayout(radialInputFrom(a, 5));
    expect(l2.angles).toEqual(l1.angles);
  });

  it('retains the best candidate across starts and reports the loss of the returned layout', () => {
    const a = analyzeProject(createExampleProject());
    const many = fitRadialLayout(radialInputFrom(a));
    const one = fitRadialLayout({ ...radialInputFrom(a), options: { starts: 1 } });
    expect(many.loss).toBeLessThanOrEqual(one.loss + 1e-15);
    const ids = a.competitorIds;
    const phi = Float64Array.from(ids.map((id) => many.angles[id] ?? 0));
    const recomputed = lossAndGradient(phi, a.competitors.map((c) => c.distance), radialInputFrom(a).target, null);
    expect(many.loss).toBeCloseTo(recomputed, 14);
  });

  it('aligns reflection with the previous layout among equal fits', () => {
    const a = analyzeProject(createExampleProject());
    const base = fitRadialLayout(radialInputFrom(a));
    const mirrored: Record<string, number> = {};
    for (const [id, ang] of Object.entries(base.angles)) mirrored[id] = -ang;
    const next = fitRadialLayout({ ...radialInputFrom(a), anchorId: base.anchorId, previousAngles: mirrored });
    expect(next.loss).toBeCloseTo(base.loss, 9);
    for (const id of a.competitorIds) {
      expect(next.positions[id].x).toBeCloseTo(base.positions[id].x, 6);
      expect(next.positions[id].y).toBeCloseTo(-base.positions[id].y, 6);
    }
  });

  it('keeps the requested anchor until it disappears or coincides with the IDV', () => {
    expect(resolveAnchor(['a', 'b'], [0.5, 0.3], 'a')).toBe('a');
    expect(resolveAnchor(['a', 'b'], [0.5, 0.3], 'zzz')).toBe('b');
    expect(resolveAnchor(['a', 'b'], [0, 0.3], 'a')).toBe('b');
    expect(resolveAnchor(['a', 'b'], [0, 0], 'a')).toBeNull();
  });

  it('handles degenerate cases without NaN', () => {
    const cases: RadialInput[] = [
      { ids: [], radii: [], target: [], anchorId: null, seed: 1 },
      { ids: ['a'], radii: [0.4], target: [[0]], anchorId: null, seed: 1 },
      { ids: ['a', 'b'], radii: [0, 0], target: [[0, 0], [0, 0]], anchorId: null, seed: 1 },
      { ids: ['a', 'b', 'c'], radii: [1, 1, 1], target: [[0, 1, 1], [1, 0, 1], [1, 1, 0]], anchorId: null, seed: 1 },
      { ids: ['a', 'b', 'c'], radii: [0.5, 0.5, 0.5], target: [[0, 0, 0.3], [0, 0, 0.3], [0.3, 0.3, 0]], anchorId: null, seed: 1 },
      { ids: ['a', 'b', 'c', 'd'], radii: [1, 1, 1, 1], target: [[0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0]], anchorId: null, seed: 1 },
    ];
    for (const c of cases) {
      const layout = fitRadialLayout(c);
      expect(allFinite(layout)).toBe(true);
      c.ids.forEach((id, i) => expect(Math.hypot(layout.positions[id].x, layout.positions[id].y)).toBeCloseTo(c.radii[i], 12));
    }
  });

  it('coincident competitors share a true position (no jitter)', () => {
    const layout = fitRadialLayout({ ids: ['a', 'b', 'c'], radii: [0.5, 0.5, 0.5], target: [[0, 0, 0.3], [0, 0, 0.3], [0.3, 0.3, 0]], anchorId: null, seed: 1 });
    expect(Math.hypot(layout.positions.a.x - layout.positions.b.x, layout.positions.a.y - layout.positions.b.y)).toBeLessThan(1e-6);
  });

  it('tiny fixture: zero-radius twin sits at the origin and disjoint product on the unit ring', () => {
    const a = analyzeProject(createTinyProject());
    const layout = fitRadialLayout(radialInputFrom(a));
    expect(layout.positions.p_twin).toEqual({ x: 0, y: 0 });
    const d = layout.positions.p_disjoint;
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 12);
  });
});

describe('layout diagnostics', () => {
  it('computes residuals, relative RMS error, max error, and worst pair accurately', () => {
    // IDV at origin, A at (1,0), B at (0,1). Native: IDV–A 1, IDV–B 1, A–B 1 (displayed √2).
    const order = ['idv', 'a', 'b'];
    const native = [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ];
    const diag = layoutDiagnostics(order, { a: { x: 1, y: 0 }, b: { x: 0, y: 1 } }, native, [
      [0, Math.PI / 3],
      [Math.PI / 3, 0],
    ]);
    const res = Math.SQRT2 - 1;
    expect(diag.relativeRMSError).toBeCloseTo(Math.sqrt((res * res) / 3), 12);
    expect(diag.maxAbsError).toBeCloseTo(res, 12);
    expect(diag.worstPair).toMatchObject({ a: 'a', b: 'b' });
    const ab = diag.pairs.find((p) => p.a === 'a' && p.b === 'b')!;
    expect(ab.displayedAngle).toBeCloseTo(Math.PI / 2, 12);
    expect(ab.nativeAngle).toBeCloseTo(Math.PI / 3, 12);
  });

  it('defines error as zero when all distances are zero', () => {
    const diag = layoutDiagnostics(['idv', 'a'], { a: { x: 0, y: 0 } }, [[0, 0], [0, 0]], [[null]]);
    expect(diag.relativeRMSError).toBe(0);
    expect(diag.worstPair).toBeNull();
  });
});

describe('segment centroids', () => {
  it('two equal weights give the midpoint', () => {
    const c = segmentCentroids(
      [
        { productId: 'a', total: 10, amounts: [10] },
        { productId: 'b', total: 10, amounts: [10] },
      ],
      { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      ['s'],
    );
    expect(c[0].point.x).toBeCloseTo(0.5, 14);
    expect(c[0].point.y).toBeCloseTo(0.5, 14);
  });

  it('centroids stay inside the convex hull of contributing points; zero-weight segments have none', () => {
    const tri: Record<string, Point> = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, c: { x: 0, y: 1 } };
    const rand = mulberry32(11);
    for (let k = 0; k < 50; k++) {
      const w = [rand(), rand(), rand()].map((v) => v * 100);
      const [cent] = segmentCentroids(
        [
          { productId: 'a', total: w[0], amounts: [w[0], 0] },
          { productId: 'b', total: w[1], amounts: [w[1], 0] },
          { productId: 'c', total: w[2], amounts: [w[2], 0] },
        ],
        tri,
        ['s', 'empty'],
      );
      expect(cent.point.x).toBeGreaterThanOrEqual(-1e-12);
      expect(cent.point.y).toBeGreaterThanOrEqual(-1e-12);
      expect(cent.point.x + cent.point.y).toBeLessThanOrEqual(1 + 1e-12);
    }
    const out = segmentCentroids([{ productId: 'a', total: 5, amounts: [5, 0] }], tri, ['s', 'empty']);
    expect(out.map((c) => c.segmentId)).toEqual(['s']);
  });
});

describe('unknowns and price context', () => {
  it('blank SOM stays null (not zero) and blank price stays unknown (not free)', () => {
    const p = createExampleProject();
    const a = analyzeProject(p);
    for (const prod of a.products.values()) {
      expect(prod.som).toBeNull();
      expect(prod.price.kind).toBe('unknown');
    }
    expect(a.price.free).toEqual([]);
    expect(a.price.unknown.length).toBe(5);
    expect(formatPrice({ kind: 'unknown' })).toBe('Unknown');
    expect(formatPrice({ kind: 'quote' })).toBe('Contact for quote');
  });

  it('zero SOM is a valid scenario estimate distinct from blank', () => {
    const p = createTinyProject();
    p.products[1].som = 0;
    const r = assessProject(p);
    expect(r.status).toBe('ready');
    expect(p.products[1].som).toBe(0);
    expect(p.products[2].som).toBeNull();
  });

  it('compares prices only when currency and basis match; yearly becomes a monthly equivalent', () => {
    const mk = (id: string, price: Product['price']) => createProduct({ id, price });
    const cmp = comparePrices([
      mk('m', { kind: 'published', amount: 20, currency: 'usd', period: 'month', basis: 'per user' }),
      mk('y', { kind: 'published', amount: 180, currency: 'USD', period: 'year', basis: 'Per user' }),
      mk('team', { kind: 'published', amount: 25, currency: 'USD', period: 'month', basis: 'per team' }),
      mk('eur', { kind: 'published', amount: 15, currency: 'EUR', period: 'month', basis: 'per user' }),
      mk('q', { kind: 'quote' }),
      mk('f', { kind: 'free' }),
      mk('u', { kind: 'unknown' }),
      mk('partial', { kind: 'published', amount: 10 }),
    ]);
    expect(cmp.groups).toHaveLength(1);
    const g = cmp.groups[0];
    expect(g.currency).toBe('USD');
    expect(g.basis).toBe('per user');
    expect(g.entries.map((e) => e.productId)).toEqual(['y', 'm']);
    expect(g.entries[0].monthlyEquivalent).toBe(15);
    expect(g.entries[0].amount).toBe(180); // original preserved
    expect(cmp.standalone.map((e) => e.productId).sort()).toEqual(['eur', 'team']);
    expect(cmp.quote).toEqual(['q']);
    expect(cmp.free).toEqual(['f']);
    expect(cmp.unknown).toEqual(['u']);
    expect(cmp.incomplete).toEqual(['partial']);
  });
});

describe('stale layout results', () => {
  it('rejects a response from a job superseded by a later edit', () => {
    const t = new LatestJobTracker();
    const first = t.issue('hash-A', 1);
    const second = t.issue('hash-B', 2);
    expect(t.accepts(first, 'hash-A')).toBe(false);
    expect(t.accepts(second, 'hash-A')).toBe(false);
    expect(t.accepts(second, 'hash-B')).toBe(true);
    t.clear();
    expect(t.accepts(second, 'hash-B')).toBe(false);
  });
});

describe('readiness for drafts', () => {
  it('excludes incomplete competitors without blocking, and blocks invalid values', () => {
    const p = createProject({
      tam: 100,
      segments: [{ id: 's', name: 'S' }],
      idvProductId: 'i',
      products: [
        createProduct({ id: 'i', name: 'I', description: 'x', sam: 50, allocations: [{ segmentId: 's', fraction: 1 }] }),
        createProduct({ id: 'draft', name: 'Draft', description: 'x' }),
      ],
    });
    const r = assessProject(p);
    expect(r.status).toBe('ready');
    expect(r.excludedIds).toEqual(['draft']);
    p.products[1].sam = 500;
    p.products[1].allocations = [{ segmentId: 's', fraction: 1 }];
    const r2 = assessProject(p);
    expect(r2.status).toBe('blocked');
    expect(r2.issues.find((i) => i.code === 'sam-exceeds-tam')?.productId).toBe('draft');
  });
});
