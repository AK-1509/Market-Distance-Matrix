import { describe, expect, it } from 'vitest';
import { allocationTotal, checkAllocations, equalAllocations, formatPercent, percentToFraction, setProductSegments } from './allocation';
import { analyzeProject } from './analysis';
import { createProduct, createProject } from './factory';
import { nativeAngle, toDegrees } from './geometry';
import { buildFootprint, buildSegmentIndex, distanceMatrix, groupShared, modeledUnion, overlap, overlapMatrix, pairDistance } from './model';
import { mulberry32 } from './radial';
import { assessProject } from './validation';
import { dot, thresholdVectors, vectorDistanceMatrix } from './vectors';
import { createExampleProject } from '../fixtures/example';
import { createTinyProject } from '../fixtures/tiny';
import type { Project } from './types';

const TINY_NARROW_DISTANCE = 0.6725157563;

function footprintsOf(project: Project) {
  const index = buildSegmentIndex(project.segments.map((s) => s.id));
  return project.products.map((p) => buildFootprint(p, index));
}

/** Deterministic random footprints for property checks. */
function randomProject(seed: number, nProducts: number, nSegments: number): Project {
  const rand = mulberry32(seed);
  const segments = Array.from({ length: nSegments }, (_, s) => ({ id: `s${s}`, name: `S${s}` }));
  const products = Array.from({ length: nProducts }, (_, i) => {
    const chosen = segments.filter(() => rand() < 0.5);
    const segs = chosen.length ? chosen : [segments[Math.floor(rand() * nSegments)]];
    const weights = segs.map(() => 0.05 + rand());
    const total = weights.reduce((a, b) => a + b, 0);
    return createProduct({
      id: `p${String(i).padStart(2, '0')}`,
      name: `P${i}`,
      description: 'x',
      sam: Math.round(10 + rand() * 1000),
      allocationMode: 'custom',
      allocations: segs.map((s, k) => ({ segmentId: s.id, fraction: weights[k] / total })),
    });
  });
  return createProject({ id: 'rand', tam: 1e9, segments, products, idvProductId: 'p00' });
}

describe('overlap model — anchor values', () => {
  const tiny = createTinyProject();
  const [idv, twin, disjoint, narrow] = footprintsOf(tiny);

  it('identical footprints have distance 0; disjoint footprints have distance 1', () => {
    expect(pairDistance(idv, twin)).toBe(0);
    expect(pairDistance(idv, disjoint)).toBe(1);
  });

  it('tiny fixture: narrow product overlaps 30, exposes 30% of IDV and 100% of itself', () => {
    expect(overlap(idv, narrow)).toBeCloseTo(30, 12);
    const a = analyzeProject(tiny);
    const m = a.competitors.find((c) => c.productId === 'p_narrow')!;
    expect(m.sharedMarket).toBeCloseTo(30, 10);
    expect(m.idvExposure).toBeCloseTo(0.3, 12);
    expect(m.competitorExposure).toBeCloseTo(1, 12);
    expect(m.distance).toBeCloseTo(TINY_NARROW_DISTANCE, 9);
  });

  it('example fixture matches independently computed distances and overlaps', () => {
    const p = createExampleProject();
    const a = analyzeProject(p);
    const byName = (name: string) => a.competitors.find((c) => a.products.get(c.productId)!.name === name)!;
    // Hand-derived overlaps (sum of per-segment minimums) and resulting distances.
    const expected: Record<string, [number, number, number, number]> = {
      Claude: [150_000, 0.800894136075, 0.3, 150 / 350],
      Gemini: [300_000, 0.531848507001, 0.6, 300 / 350],
      Grok: [100_000, 0.846851396365, 0.2, 0.4],
      DeepSeek: [150_000, 0.672515756317, 0.3, 1],
    };
    for (const [name, [shared, d, idvExp, compExp]] of Object.entries(expected)) {
      const m = byName(name);
      expect(m.sharedMarket).toBeCloseTo(shared, 6);
      expect(m.distance).toBeCloseTo(d, 10);
      expect(m.idvExposure).toBeCloseTo(idvExp, 12);
      expect(m.competitorExposure).toBeCloseTo(compExp, 12);
    }
    expect(a.modeledUnion).toBeCloseTo(750_000, 6);
    expect(a.sumOfSams).toBeCloseTo(1_600_000, 6);
    expect(a.outsideModeled).toBeCloseTo(250_000, 6);
  });
});

describe('overlap model — properties', () => {
  for (const seed of [1, 7, 42, 2026]) {
    it(`matrices are symmetric, bounded, finite, with correct diagonals (seed ${seed})`, () => {
      const fps = footprintsOf(randomProject(seed, 12, 6));
      const O = overlapMatrix(fps);
      const D = distanceMatrix(fps, O);
      for (let i = 0; i < fps.length; i++) {
        expect(O[i][i]).toBeCloseTo(fps[i].total, 9);
        expect(D[i][i]).toBe(0);
        for (let j = 0; j < fps.length; j++) {
          expect(Number.isFinite(D[i][j])).toBe(true);
          expect(O[i][j]).toBe(O[j][i]);
          expect(D[i][j]).toBe(D[j][i]);
          expect(D[i][j]).toBeGreaterThanOrEqual(0);
          expect(D[i][j]).toBeLessThanOrEqual(1);
          expect(O[i][j]).toBeGreaterThanOrEqual(0);
          expect(O[i][j]).toBeLessThanOrEqual(Math.min(fps[i].total, fps[j].total) + 1e-9);
        }
      }
    });

    it(`direct distances agree with the explicit threshold-vector construction (seed ${seed})`, () => {
      const fps = footprintsOf(randomProject(seed, 10, 5));
      const b = thresholdVectors(fps);
      const O = overlapMatrix(fps);
      for (let i = 0; i < fps.length; i++) {
        expect(dot(b[i], b[i])).toBeCloseTo(fps[i].total, 6);
        for (let j = 0; j < fps.length; j++) expect(dot(b[i], b[j])).toBeCloseTo(i === j ? fps[i].total : O[i][j], 6);
      }
      const Dv = vectorDistanceMatrix(fps);
      const D = distanceMatrix(fps, O);
      for (let i = 0; i < fps.length; i++) for (let j = 0; j < fps.length; j++) expect(Dv[i][j]).toBeCloseTo(D[i][j], 7);
    });
  }

  it('rejects non-positive SAM at the model boundary', () => {
    const index = buildSegmentIndex(['a']);
    expect(() => buildFootprint(createProduct({ id: 'x', sam: 0, allocations: [{ segmentId: 'a', fraction: 1 }] }), index)).toThrow();
    expect(() => buildFootprint(createProduct({ id: 'x', sam: -5, allocations: [{ segmentId: 'a', fraction: 1 }] }), index)).toThrow();
    expect(() => buildFootprint(createProduct({ id: 'x', sam: null, allocations: [{ segmentId: 'a', fraction: 1 }] }), index)).toThrow();
  });
});

describe('union and group overlap never double-count shared capacity', () => {
  it('group shared capacity counts each segment slice once', () => {
    const p = createProject({
      tam: 1000,
      segments: [{ id: 'P', name: 'P' }, { id: 'Q', name: 'Q' }],
      idvProductId: 'i',
      products: [
        createProduct({ id: 'i', name: 'I', description: 'x', sam: 100, allocationMode: 'custom', allocations: [{ segmentId: 'P', fraction: 0.6 }, { segmentId: 'Q', fraction: 0.4 }] }),
        createProduct({ id: 'a', name: 'A', description: 'x', sam: 60, allocations: [{ segmentId: 'P', fraction: 1 }] }),
        createProduct({ id: 'b', name: 'B', description: 'x', sam: 50, allocations: [{ segmentId: 'P', fraction: 1 }] }),
      ],
    });
    const [i, a, b] = footprintsOf(p);
    // Both competitors sit inside the IDV's 60 in P: unique shared is 60, not 110.
    expect(groupShared(i, [a, b])).toBeCloseTo(60, 12);
    expect(modeledUnion([i, a, b])).toBeCloseTo(100, 12);
  });

  it('allows summed SAMs above TAM when the modeled union fits', () => {
    const p = createExampleProject();
    const r = assessProject(p);
    expect(r.status).toBe('ready');
    expect(r.modeledUnion).toBeCloseTo(750_000, 6);
  });

  it('flags a modeled union above TAM without mutating any data', () => {
    const p = createExampleProject();
    p.tam = 700_000;
    const before = structuredClone(p);
    const r = assessProject(p);
    expect(r.status).toBe('blocked');
    expect(r.issues.some((i) => i.code === 'union-exceeds-tam')).toBe(true);
    expect(p).toEqual(before);
  });
});

describe('allocations', () => {
  it('equal split sums to 1 for many segment counts', () => {
    for (let k = 1; k <= 30; k++) {
      const a = equalAllocations(Array.from({ length: k }, (_, i) => `s${i}`));
      expect(Math.abs(allocationTotal(a) - 1)).toBeLessThan(1e-12);
      for (const x of a) expect(x.fraction).toBe(1 / k);
    }
  });

  it('custom percentages convert to exact fractions and validate', () => {
    const allocations = [33.33, 33.33, 33.34].map((pct, i) => ({ segmentId: `s${i}`, fraction: percentToFraction(pct) }));
    const known = new Set(['s0', 's1', 's2']);
    expect(checkAllocations({ allocations, allocationMode: 'custom' }, known)).toEqual([]);
    expect(allocations[0].fraction).toBe(0.3333);
  });

  it('formatting does not corrupt stored fractions', () => {
    const fraction = 1 / 3;
    expect(formatPercent(fraction)).toBe('33.3%');
    expect(fraction).toBe(1 / 3);
    const p = createExampleProject();
    const idv = p.products.find((x) => x.id === p.idvProductId)!;
    expect(idv.allocations.map((a) => a.fraction)).toEqual([0.3, 0.4, 0.3]);
  });

  it('preserves custom splits when segments change and reports the resulting total', () => {
    const product = {
      allocationMode: 'custom' as const,
      allocations: [
        { segmentId: 'a', fraction: 0.7 },
        { segmentId: 'b', fraction: 0.3 },
      ],
    };
    const added = setProductSegments(product, ['a', 'b', 'c']);
    expect(added).toEqual([
      { segmentId: 'a', fraction: 0.7 },
      { segmentId: 'b', fraction: 0.3 },
      { segmentId: 'c', fraction: 0 },
    ]);
    const removed = setProductSegments(product, ['a']);
    expect(removed).toEqual([{ segmentId: 'a', fraction: 0.7 }]);
    const problems = checkAllocations({ allocationMode: 'custom', allocations: removed }, new Set(['a']));
    expect(problems).toEqual([{ code: 'total-not-100', total: 0.7 }]);
  });

  it('detects malformed allocations', () => {
    const known = new Set(['a']);
    expect(checkAllocations({ allocationMode: 'custom', allocations: [{ segmentId: 'zzz', fraction: 1 }] }, known)[0].code).toBe('unknown-segment');
    expect(checkAllocations({ allocationMode: 'custom', allocations: [{ segmentId: 'a', fraction: Number.NaN }] }, known)[0].code).toBe('invalid-fraction');
    expect(checkAllocations({ allocationMode: 'custom', allocations: [{ segmentId: 'a', fraction: -0.2 }] }, known)[0].code).toBe('invalid-fraction');
  });
});

describe('native angles', () => {
  it('is null for zero-radius products and valid otherwise', () => {
    expect(nativeAngle(0, 0.5, 0.5)).toBeNull();
    expect(nativeAngle(0.5, 0, 0.5)).toBeNull();
    expect(toDegrees(nativeAngle(1, 1, 1)!)).toBeCloseTo(60, 10);
    expect(toDegrees(nativeAngle(0.5, 0.5, 0)!)).toBeCloseTo(0, 5);
  });

  it('throws on grossly invalid geometry rather than clamping it', () => {
    expect(() => nativeAngle(0.1, 0.1, 0.9)).toThrow(/Invalid geometry/);
  });

  it('example native angles match independent values', () => {
    const p = createExampleProject();
    const a = analyzeProject(p);
    const idx = (name: string) => a.competitorIds.findIndex((id) => a.products.get(id)!.name === name);
    expect(toDegrees(a.nativeAngles[idx('Claude')][idx('Grok')]!)).toBeCloseTo(50.343, 2);
    expect(toDegrees(a.nativeAngles[idx('Claude')][idx('DeepSeek')]!)).toBeCloseTo(45.996, 2);
    expect(toDegrees(a.nativeAngles[idx('Gemini')][idx('DeepSeek')]!)).toBeCloseTo(76.122, 2);
  });

  it('twin of the IDV has an undefined direction', () => {
    const a = analyzeProject(createTinyProject());
    const k = a.competitorIds.indexOf('p_twin');
    expect(a.competitors[k].matchesIdv).toBe(true);
    expect(a.nativeAngles[k].every((v) => v === null)).toBe(true);
    expect(a.grouping.matchingIdvIds).toEqual(['p_twin']);
  });
});

describe('analysis is independent of input order', () => {
  it('shuffling products and segments leaves substantive metrics unchanged', () => {
    const p = createExampleProject();
    const a = analyzeProject(p);
    const q = structuredClone(p);
    q.products.reverse();
    q.segments.reverse();
    const b = analyzeProject(q);
    expect(b.competitorIds).toEqual(a.competitorIds);
    for (const id of a.competitorIds) {
      const ma = a.competitors.find((c) => c.productId === id)!;
      const mb = b.competitors.find((c) => c.productId === id)!;
      expect(mb.distance).toBeCloseTo(ma.distance, 14);
      expect(mb.sharedMarket).toBeCloseTo(ma.sharedMarket, 8);
    }
    expect(b.rankings).toEqual(a.rankings);
    expect(b.modeledUnion).toBeCloseTo(a.modeledUnion, 8);
    expect(b.grouping.groups.map((g) => g.memberIds)).toEqual(a.grouping.groups.map((g) => g.memberIds));
  });
});
