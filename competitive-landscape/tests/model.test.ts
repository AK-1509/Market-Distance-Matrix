import { describe, expect, it } from 'vitest';
import { allocationTotal, equalAllocations, toCustomMode, withSegments } from '../src/domain/allocation';
import { analyzeProject, type Analysis } from '../src/domain/analysis';
import { createProduct } from '../src/domain/factory';
import { createDemoProject } from '../src/domain/fixtures';
import { formatSplitPercent } from '../src/domain/format';
import { distanceFromVectors, dot, nativeAngle, thresholdVectors } from '../src/domain/geometry';
import { buildMatrices, footprintOf, groupSharedWithIdv, modeledUnion } from '../src/domain/model';
import { validateProject } from '../src/domain/validation';
import { projectFromRows, randomProject, tinyProject } from './fixtures';

function ok(project: ReturnType<typeof tinyProject>): Analysis {
  const outcome = analyzeProject(project);
  if (outcome.status !== 'ok') throw new Error(JSON.stringify(outcome.validation.issues));
  return outcome.analysis;
}

describe('overlap model — tiny fixture (brief §10)', () => {
  const a = ok(tinyProject());
  const metric = (id: string) => a.competitors.find((c) => c.id === id)!;

  it('identical footprints give distance 0', () => {
    expect(metric('b_same').distance).toBe(0);
    expect(metric('b_same').sharedMarket).toBeCloseTo(100, 12);
  });

  it('disjoint footprints give distance 1', () => {
    expect(metric('c_disjoint').distance).toBe(1);
    expect(metric('c_disjoint').sharedMarket).toBe(0);
  });

  it('SAM 30 only in P: overlap 30, exposures 30% / 100%, distance 0.6725157563', () => {
    const m = metric('d_small');
    expect(m.sharedMarket).toBeCloseTo(30, 12);
    expect(m.idvExposure).toBeCloseTo(0.3, 12);
    expect(m.competitorExposure).toBeCloseTo(1, 12);
    expect(m.distance).toBeCloseTo(0.6725157563, 9);
  });

  it('ranks closeness and absolute overlap separately', () => {
    expect(a.rankings.byDistance).toEqual(['b_same', 'd_small', 'c_disjoint']);
    expect(a.rankings.bySharedMarket[0]).toBe('b_same');
    expect(a.rankings.byCompetitorExposure.slice(0, 2).sort()).toEqual(['b_same', 'd_small']);
  });
});

describe('fictional demo fixture (brief §9)', () => {
  const project = createDemoProject();
  const a = ok(project);
  const byName = (n: string) => a.competitors.find((c) => c.name === n)!;
  // Independent hand calculation from the brief's table: d = sqrt(1 - O / sqrt(M0 * Mi)).
  const expected: Record<string, { shared: number; sam: number }> = {
    Claude: { shared: 150_000, sam: 350_000 }, // min(150k,200k) programmers
    Gemini: { shared: 300_000, sam: 350_000 }, // 100k programmers + 200k casual
    Grok: { shared: 100_000, sam: 250_000 }, // 100k image generation
    DeepSeek: { shared: 150_000, sam: 150_000 }, // 150k programmers
  };

  it('matches hand-computed overlaps and distances', () => {
    for (const [n, e] of Object.entries(expected)) {
      const m = byName(n);
      expect(m.sharedMarket).toBeCloseTo(e.shared, 6);
      expect(m.distance).toBeCloseTo(Math.sqrt(1 - e.shared / Math.sqrt(500_000 * e.sam)), 10);
    }
  });

  it('modelled union is 750,000 while SAMs sum to 1,600,000 (allowed under TAM 1,000,000)', () => {
    expect(a.union).toBeCloseTo(750_000, 6);
    expect(a.sumOfSams).toBe(1_600_000);
    expect(a.outsideModeled).toBeCloseTo(250_000, 6);
  });

  it('stores exact fractions and only formats them for display', () => {
    const chatgpt = project.products[0];
    expect(chatgpt.allocations.map((x) => x.fraction)).toEqual([150_000 / 500_000, 200_000 / 500_000, 150_000 / 500_000]);
    const claude = project.products[1];
    expect(claude.allocations[0].fraction).toBe(200_000 / 350_000);
    expect(formatSplitPercent(claude.allocations[0].fraction)).toBe('57.14%');
    expect(claude.allocations[0].fraction).toBe(4 / 7);
  });

  it('closest is Gemini, and largest overlap is Gemini; DeepSeek has 100% competitor exposure', () => {
    expect(a.rankings.byDistance.map((id) => a.names[id])).toEqual(['Gemini', 'DeepSeek', 'Claude', 'Grok']);
    expect(a.names[a.rankings.byCompetitorExposure[0]]).toBe('DeepSeek');
    expect(byName('DeepSeek').competitorExposure).toBeCloseTo(1, 12);
  });
});

describe('matrix properties', () => {
  for (const seed of [1, 7, 42, 2024]) {
    it(`symmetric, finite, bounded, exact diagonal (seed ${seed})`, () => {
      const project = randomProject(seed, 12, 6);
      const fps = project.products.map(footprintOf);
      const { overlap: O, distance: D, similarity: G } = buildMatrices(fps);
      for (let i = 0; i < fps.length; i++) {
        expect(O[i][i]).toBe(fps[i].sam);
        expect(D[i][i]).toBe(0);
        for (let j = 0; j < fps.length; j++) {
          expect(Number.isFinite(D[i][j])).toBe(true);
          expect(O[i][j]).toBe(O[j][i]);
          expect(D[i][j]).toBe(D[j][i]);
          expect(D[i][j]).toBeGreaterThanOrEqual(0);
          expect(D[i][j]).toBeLessThanOrEqual(1);
          expect(G[i][j]).toBeGreaterThanOrEqual(0);
          expect(G[i][j]).toBeLessThanOrEqual(1);
          expect(O[i][j]).toBeGreaterThanOrEqual(0);
          expect(O[i][j]).toBeLessThanOrEqual(Math.min(fps[i].sam, fps[j].sam) * (1 + 1e-12));
        }
      }
    });
  }
});

describe('explicit threshold-vector construction agrees with the direct formula', () => {
  const fixtures = [tinyProject(), createDemoProject(), randomProject(3, 10, 5), randomProject(99, 8, 3)];
  fixtures.forEach((project, k) => {
    it(`fixture ${k}: b_i·b_j = O_ij, |b_i|² = M_i, and distances match`, () => {
      const fps = project.products.map(footprintOf);
      const { overlap: O, distance: D } = buildMatrices(fps);
      const B = thresholdVectors(fps);
      for (let i = 0; i < fps.length; i++) {
        expect(dot(B[i], B[i])).toBeCloseTo(fps[i].sam, 6);
        for (let j = 0; j < fps.length; j++) {
          expect(dot(B[i], B[j])).toBeCloseTo(O[i][j], 6);
          expect(distanceFromVectors(B[i], fps[i].sam, B[j], fps[j].sam)).toBeCloseTo(D[i][j], 6);
        }
      }
    });
  });
});

describe('union and group overlap count each slice once', () => {
  const project = projectFromRows(
    [
      { id: 'idv', sam: 100, amounts: { A: 50, B: 50 } },
      { id: 'c1', sam: 40, amounts: { A: 40 } },
      { id: 'c2', sam: 30, amounts: { A: 30 } },
      { id: 'c3', sam: 60, amounts: { A: 20, B: 40 } },
    ],
    1000,
  );
  const fps = project.products.map(footprintOf);

  it('modelled union = sum of per-segment maxima', () => {
    // A: max(50,40,30,20) = 50; B: max(50,40) = 50
    expect(modeledUnion(fps)).toBeCloseTo(100, 12);
  });

  it('group shared overlap does not double count', () => {
    // A: min(50, max(40,30)) = 40, not 40 + 30
    expect(groupSharedWithIdv(fps[0], [fps[1], fps[2]]).total).toBeCloseTo(40, 12);
    // A: min(50, max(40,20)) = 40; B: min(50, 40) = 40
    expect(groupSharedWithIdv(fps[0], [fps[1], fps[3]]).total).toBeCloseTo(80, 12);
  });
});

describe('TAM reconciliation', () => {
  it('flags modelled union above TAM without mutating any data', () => {
    const project = createDemoProject();
    project.tam = 700_000; // union is 750,000
    const before = structuredClone(project);
    const outcome = analyzeProject(project);
    expect(outcome.status).toBe('blocked');
    expect(outcome.validation.issues.some((i) => i.code === 'union-exceeds-tam')).toBe(true);
    expect(project).toEqual(before);
  });

  it('allows the sum of SAMs above TAM when the union fits', () => {
    const project = createDemoProject();
    project.tam = 750_000;
    expect(analyzeProject(project).status).toBe('ok');
  });
});

describe('allocations', () => {
  it('equal splits sum to 1 for 1..30 segments', () => {
    for (let k = 1; k <= 30; k++) {
      const allocs = equalAllocations(Array.from({ length: k }, (_, i) => `s${i}`));
      expect(Math.abs(allocationTotal(allocs) - 1)).toBeLessThan(1e-12);
    }
  });

  it('custom split is preserved when segments change (never silently reset)', () => {
    let p = createProduct({ sam: 100, allocationMode: 'equal', allocations: equalAllocations(['a', 'b', 'c']) });
    p = toCustomMode(p);
    p = { ...p, allocations: [{ segmentId: 'a', fraction: 0.5 }, { segmentId: 'b', fraction: 0.3 }, { segmentId: 'c', fraction: 0.2 }] };
    const added = withSegments(p, ['a', 'b', 'c', 'd']);
    expect(added.allocations).toEqual([
      { segmentId: 'a', fraction: 0.5 },
      { segmentId: 'b', fraction: 0.3 },
      { segmentId: 'c', fraction: 0.2 },
      { segmentId: 'd', fraction: 0 },
    ]);
    const removed = withSegments(p, ['a', 'b']);
    expect(removed.allocations).toEqual([
      { segmentId: 'a', fraction: 0.5 },
      { segmentId: 'b', fraction: 0.3 },
    ]);
    expect(removed.allocationMode).toBe('custom');
  });

  it('equal mode re-splits evenly and keeps exact thirds', () => {
    const p = createProduct({ sam: 90, allocationMode: 'equal', allocations: [] });
    const three = withSegments(p, ['a', 'b', 'c']);
    expect(three.allocations.map((x) => x.fraction)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(formatSplitPercent(three.allocations[0].fraction)).toBe('33.33%');
    expect(three.allocations[0].fraction).toBe(1 / 3);
  });

  it('custom split not totalling 100% blocks analysis with a useful message', () => {
    const project = tinyProject();
    project.products[3].allocations = [{ segmentId: 'seg_P', fraction: 0.9 }];
    const v = validateProject(project);
    expect(v.blocking).toBe(true);
    expect(v.issues.find((i) => i.code === 'allocation-total')?.message).toMatch(/90\.00%.*100%/);
  });
});

describe('native angles', () => {
  it('are null when a radius is zero, valid otherwise', () => {
    expect(nativeAngle(0, 0.5, 0.5)).toBeNull();
    expect(nativeAngle(0.5, 0, 0.5)).toBeNull();
    const a = nativeAngle(0.6, 0.8, 1.0)!; // 3-4-5 right triangle at IDV
    expect(a).toBeCloseTo(Math.PI / 2, 12);
  });

  it('match the angle at v_0 in the explicit high-dimensional embedding', () => {
    const project = createDemoProject();
    const fps = project.products.map(footprintOf);
    const B = thresholdVectors(fps);
    const V = B.map((b, i) => b.map((x) => x / Math.sqrt(fps[i].sam) / Math.SQRT2));
    const { distance: D } = buildMatrices(fps);
    for (let i = 1; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        const u = V[i].map((x, k) => x - V[0][k]);
        const w = V[j].map((x, k) => x - V[0][k]);
        const independent = Math.acos(dot(u, w) / Math.sqrt(dot(u, u) * dot(w, w)));
        expect(nativeAngle(D[0][i], D[0][j], D[i][j])).toBeCloseTo(independent, 6);
      }
    }
  });
});

describe('input order does not change substantive metrics', () => {
  it('shuffling products and segments yields identical per-product metrics', () => {
    const p1 = randomProject(11, 9, 5);
    const p2 = structuredClone(p1);
    p2.products.reverse();
    p2.segments.reverse();
    p2.products.forEach((p) => p.allocations.reverse());
    const a1 = ok(p1);
    const a2 = ok(p2);
    expect(a2.productIds).toEqual(a1.productIds);
    expect(a2.inputHash).toBe(a1.inputHash);
    for (const c of a1.competitors) {
      const d = a2.competitors.find((x) => x.id === c.id)!;
      expect(d.distance).toBeCloseTo(c.distance, 12);
      expect(d.sharedMarket).toBeCloseTo(c.sharedMarket, 9);
    }
    expect(a2.rankings).toEqual(a1.rankings);
    expect(a2.groups.map((g) => g.memberIds)).toEqual(a1.groups.map((g) => g.memberIds));
  });
});
