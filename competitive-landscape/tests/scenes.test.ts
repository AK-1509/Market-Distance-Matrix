import { describe, expect, it } from 'vitest';
import { analyzeProject, type Analysis } from '../src/domain/analysis';
import { layoutDiagnostics } from '../src/domain/diagnostics';
import { createDemoProject } from '../src/domain/fixtures';
import { buildLayoutInput, computeLayout } from '../src/domain/layout';
import { buildDistanceScene } from '../src/charts/distanceScene';
import { productIdentities } from '../src/charts/palette';
import { buildRadialScene, type ChartVariant } from '../src/charts/radialScene';
import type { Prim, Scene } from '../src/charts/scene';
import type { Project } from '../src/domain/types';
import { randomProject } from './fixtures';

function texts(prims: Prim[], out: { text: string; x: number; y: number }[] = []) {
  for (const p of prims) {
    if (p.t === 'text') out.push({ text: p.text, x: p.x, y: p.y });
    else if (p.t === 'g') texts(p.children, out);
  }
  return out;
}

function setup(project: Project) {
  const o = analyzeProject(project);
  if (o.status !== 'ok') throw new Error('must analyse');
  const a: Analysis = o.analysis;
  const layout = computeLayout(buildLayoutInput(a));
  return { a, layout, diagnostics: layoutDiagnostics(a, layout), identities: productIdentities(project) };
}

function landscape(project: Project, variant: ChartVariant, showSegments = true): Scene {
  const { a, layout, diagnostics, identities } = setup(project);
  return buildRadialScene({ analysis: a, layout, project, identities, width: 1920, height: 1080, variant, showSegments, diagnostics, generatedAt: '2026-10-08T00:00:00Z' });
}

const crowded = () => {
  const p = randomProject(404, 40, 12);
  p.products.forEach((x, i) => (x.name = `Product ${String.fromCharCode(65 + (i % 26))}${i}`));
  p.products[5].allocations = structuredClone(p.products[6].allocations); // force a coincident pair
  p.products[5].allocationMode = p.products[6].allocationMode;
  p.products[5].sam = p.products[6].sam;
  return p;
};

describe('export scenes carry every product name', () => {
  for (const [label, make] of [
    ['demo', createDemoProject],
    ['40 products', crowded],
  ] as const) {
    for (const variant of ['export', 'clean'] as const) {
      it(`${label} / ${variant}: each name is a direct label or in a complete keyed list`, () => {
        const project = make();
        const scene = landscape(project, variant);
        const all = texts(scene.prims).map((t) => t.text);
        const joined = all.join('\n');
        for (const p of project.products) {
          expect(joined.includes(p.name), p.name).toBe(true);
        }
      });
    }
  }

  it('all text sits inside the 1920 × 1080 canvas', () => {
    for (const project of [createDemoProject(), crowded()]) {
      for (const t of texts(landscape(project, 'export').prims)) {
        expect(t.x, t.text).toBeGreaterThanOrEqual(0);
        expect(t.x, t.text).toBeLessThanOrEqual(1920);
        expect(t.y, t.text).toBeGreaterThanOrEqual(0);
        expect(t.y, t.text).toBeLessThanOrEqual(1080);
      }
    }
  });

  it('distance chart lists every competitor with its exact value on a fixed 0–1 axis', () => {
    const project = crowded();
    const { a, identities } = setup(project);
    const scene = buildDistanceScene({ analysis: a, project, identities, width: 1920, variant: 'export' });
    const all = texts(scene.prims).map((t) => t.text);
    for (const id of a.competitorIds) {
      expect(all).toContain(a.names[id]);
      const d = a.matrices.distance[0][a.index[id]];
      expect(all.some((t) => t.startsWith(d.toFixed(3)))).toBe(true);
    }
    for (const tick of ['0.00', '0.25', '0.50', '0.75', '1.00', 'Near IDV', 'Farther']) expect(all).toContain(tick);
    expect(scene.width).toBe(1920);
    expect(scene.height).toBeGreaterThanOrEqual(1080);
  });

  it('screen scenes stay finite at narrow widths', () => {
    const project = crowded();
    const { a, layout, diagnostics, identities } = setup(project);
    const scene = buildRadialScene({ analysis: a, layout, project, identities, width: 300, height: 320, variant: 'screen', showSegments: true, diagnostics });
    for (const t of texts(scene.prims)) {
      expect(Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
    }
  });
});
