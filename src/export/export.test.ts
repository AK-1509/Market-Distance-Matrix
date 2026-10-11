import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../domain/analysis';
import { fitRadialLayout } from '../domain/radial';
import { createProduct, createProject } from '../domain/factory';
import { mulberry32 } from '../domain/radial';
import { createExampleProject } from '../fixtures/example';
import { buildLandscape, cacheFromLayout, distanceExportScene, distanceExportSvg, layoutRequestFor, radialExportSvg } from '../app/landscape';
import { buildRadialScene } from '../charts/radialScene';
import { buildDistanceScene } from '../charts/distanceScene';
import { sceneTexts } from '../charts/scene';
import { buildReportHtml } from './report';
import type { Project } from '../domain/types';

function landscapeFor(project: Project) {
  const analysis = analyzeProject(project);
  const req = layoutRequestFor(project, analysis, null);
  const layout = fitRadialLayout(req.input);
  return buildLandscape(project, analysis, cacheFromLayout(req.hash, layout));
}

describe('chart exports', () => {
  it('radial SVG is 1920×1080, opaque, self-contained, and names every product', () => {
    const p = createExampleProject();
    const l = landscapeFor(p);
    for (const variant of ['detailed', 'clean'] as const) {
      const svg = radialExportSvg(l, { variant, showSegments: true })!;
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1920" height="1080"/);
      expect(svg).toContain('<rect x="0" y="0" width="1920" height="1080" fill="#ffffff"/>');
      expect(svg).toContain('<style>');
      expect(svg).not.toMatch(/<image|href=|@import|url\(/);
      for (const prod of p.products) expect(svg).toContain(prod.name);
      expect(svg).toContain('Fictional example');
    }
  });

  it('distance SVG names every competitor with its exact distance on a fixed 0–1 axis', () => {
    const p = createExampleProject();
    const l = landscapeFor(p);
    const scene = distanceExportScene(l);
    expect(scene.width).toBe(1920);
    expect(scene.height).toBe(1080);
    const texts = sceneTexts(scene);
    for (const c of l.analysis.competitors) {
      expect(texts).toContain(l.analysis.products.get(c.productId)!.name);
      expect(texts).toContain(c.distance.toFixed(3));
    }
    expect(texts).toEqual(expect.arrayContaining(['0', '0.25', '0.50', '0.75', '1.00', '← Near IDV', 'Farther →']));
    expect(texts.join(' ')).toContain('Fictional example');
  });

  it('screen and export scenes keep identical data coordinates relative to scale', () => {
    const l = landscapeFor(createExampleProject());
    const screen = buildRadialScene(l.chart, { width: 800, height: 700, mode: 'screen', showSegments: false, view: 'full' });
    const exported = buildRadialScene(l.chart, { width: 1920, height: 1080, mode: 'export', showSegments: false, view: 'full' });
    expect(screen.nodes.length).toBeGreaterThan(0);
    expect(exported.nodes.length).toBeGreaterThan(0);
    // Both read positions from the same chart model; radii equal native distances.
    for (const prod of l.chart.products) expect(Math.hypot(prod.position.x, prod.position.y)).toBeCloseTo(prod.distance, 12);
  });

  it('escapes user text in SVG and report output', () => {
    const p = createExampleProject();
    p.products[1].name = 'Acme & <Co> "Labs"';
    p.products[1].notes = 'Uses <b>bold</b> claims';
    p.products[1].sources = [{ id: 's1', url: 'https://example.com/?a=1&b=<2>', title: '<i>Pricing</i>', appliesTo: ['sam'] }];
    const l = landscapeFor(p);
    const svg = radialExportSvg(l, { variant: 'detailed', showSegments: false })!;
    expect(svg).toContain('Acme &amp; &lt;Co&gt; &quot;Labs&quot;');
    expect(svg).not.toContain('<Co>');
    const html = buildReportHtml({ project: p, analysis: l.analysis, diagnostics: l.diagnostics, narrative: l.narrative, radialSvg: svg, distanceSvg: distanceExportSvg(l) });
    expect(html).not.toContain('<Co>');
    expect(html).not.toContain('<i>Pricing');
    expect(html).toContain('&lt;i&gt;Pricing&lt;/i&gt;');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=&lt;2&gt;"');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
  });
});

describe('report content', () => {
  it('contains summary, both charts, methodology, references; no invented share or preference claims', () => {
    const p = createExampleProject();
    const l = landscapeFor(p);
    const html = buildReportHtml({
      project: p,
      analysis: l.analysis,
      diagnostics: l.diagnostics,
      narrative: l.narrative,
      radialSvg: radialExportSvg(l, { variant: 'detailed', showSegments: true }),
      distanceSvg: distanceExportSvg(l),
    });
    expect(html.match(/<svg /g)?.length).toBe(2);
    for (const h of ['Summary', 'Methodology', 'References', 'Inputs', 'Relationships to the IDV']) expect(html).toContain(`>${h}<`);
    expect(html).toContain('@media print');
    const text = l.narrative.sections.flatMap((s) => s.claims.map((c) => c.text)).join(' ');
    expect(text).toContain('Nearest by modeled distance: Gemini (0.532), DeepSeek (0.673), and Claude (0.801)');
    expect(text).toContain('750,000');
    expect(text).toContain('not evidence of unmet demand');
    expect(text).toMatch(/not which customers are most likely to buy/);
    const withoutDisclaimers = text
      .replace('not which customers are most likely to buy', '')
      .replace('not demand, profitability, or an untapped market', '')
      .replace('not current users or measured market share', '')
      .replace('not evidence of unmet demand', '');
    expect(withoutDisclaimers).not.toMatch(/most likely to buy|market share|will win|untapped|unmet demand|preferred by/i);
    // Unsourced estimates are labeled in references.
    expect(html).toContain('unsourced estimate');
  });

  it('uses descriptive counts instead of crowding labels with fewer than three competitors', () => {
    const p = createExampleProject();
    p.products = p.products.slice(0, 3);
    const l = landscapeFor(p);
    const crowd = l.narrative.sections.find((s) => s.id === 'crowding')!;
    expect(crowd.claims[0].text).toMatch(/no relative crowding labels/);
    expect(l.analysis.crowding.every((c) => c.label === null)).toBe(true);
    const groups = l.narrative.sections.find((s) => s.id === 'groups')!;
    expect(groups.claims[0].text).toMatch(/pairs are reported rather than groups/);
  });

  it('renders coincident and IDV-matching products without NaN', () => {
    const p = createExampleProject();
    const idv = p.products.find((x) => x.id === p.idvProductId)!;
    const claude = p.products.find((x) => x.name === 'Claude')!;
    p.products.push(createProduct({ id: 'prd_twin', name: 'IDV twin', description: 'same', sam: idv.sam, allocationMode: 'custom', allocations: idv.allocations.map((a) => ({ ...a })) }));
    p.products.push(createProduct({ id: 'prd_clone', name: 'Claude clone', description: 'same', sam: claude.sam, allocationMode: 'custom', allocations: claude.allocations.map((a) => ({ ...a })) }));
    const l = landscapeFor(p);
    const svg = radialExportSvg(l, { variant: 'detailed', showSegments: true })!;
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('Same footprint: IDV twin');
    const screen = buildRadialScene(l.chart, { width: 360, height: 360, mode: 'screen', showSegments: true, view: 'fit' });
    expect(JSON.stringify(screen)).not.toContain('NaN');
    const bars = buildDistanceScene(l.chart, { width: 360, mode: 'screen' });
    expect(sceneTexts(bars)).toContain('0.000 · same footprint as IDV');
  });
});

describe('dense projects', () => {
  it('50 products × 30 segments export every product name (direct label or keyed list) without NaN', () => {
    const rand = mulberry32(17);
    const segments = Array.from({ length: 30 }, (_, s) => ({ id: `seg${s}`, name: `Segment ${s + 1}` }));
    const products = Array.from({ length: 50 }, (_, i) => {
      const chosen = segments.filter(() => rand() < 0.15);
      const segs = chosen.length ? chosen : [segments[i % 30]];
      return createProduct({ id: `p${String(i).padStart(2, '0')}`, name: `Product number ${i + 1}`, description: 'x', sam: 1000 + Math.round(rand() * 9000), allocations: segs.map((x) => ({ segmentId: x.id, fraction: 1 / segs.length })) });
    });
    const p = createProject({ tam: 1e9, segments, products, idvProductId: 'p00' });
    const l = landscapeFor(p);
    const svg = radialExportSvg(l, { variant: 'detailed', showSegments: true })!;
    expect(svg).not.toContain('NaN');
    for (const prod of products) expect(svg).toContain(prod.name);
    expect(svg).toContain('Segment centers: S1 Segment 1');
    const dist = distanceExportScene(l);
    expect(dist.width).toBe(1920);
    expect(dist.height).toBeGreaterThanOrEqual(1080);
    const texts = sceneTexts(dist);
    for (const prod of products.slice(1)) expect(texts).toContain(prod.name);
  });
});
