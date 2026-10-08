import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/domain/analysis';
import { createDemoProject } from '../src/domain/fixtures';
import { buildLayoutInput, computeLayout } from '../src/domain/layout';
import { layoutDiagnostics } from '../src/domain/diagnostics';
import { buildNarrative, inlineToText } from '../src/domain/narrative';
import { monthlyEquivalent, priceContext } from '../src/domain/price';
import { createProduct } from '../src/domain/factory';
import { validateProject } from '../src/domain/validation';
import type { Product } from '../src/domain/types';
import { tinyProject } from './fixtures';

describe('price context', () => {
  const base = (name: string, price: Product['price']) => createProduct({ id: `p_${name}`, name, price });

  it('divides annual by 12 only for recurring published prices, keeping the original', () => {
    expect(monthlyEquivalent({ kind: 'published', amount: 240, currency: 'usd', period: 'year', basis: 'per user' })).toEqual({
      amount: 20,
      currency: 'USD',
      basis: 'per user',
      fromAnnual: true,
    });
    expect(monthlyEquivalent({ kind: 'published', amount: 99, currency: 'USD', period: 'one-time' })).toBeNull();
    expect(monthlyEquivalent({ kind: 'quote' })).toBeNull();
    expect(monthlyEquivalent({ kind: 'unknown' })).toBeNull();
  });

  it('compares only matching currency and basis; never ranks quotes or unknowns as free', () => {
    const idv = base('idv', { kind: 'published', amount: 20, currency: 'USD', period: 'month', basis: 'per user' });
    const ctx = priceContext(idv, [
      base('annual', { kind: 'published', amount: 120, currency: 'USD', period: 'year', basis: 'Per User' }),
      base('team', { kind: 'published', amount: 50, currency: 'USD', period: 'month', basis: 'per team' }),
      base('eur', { kind: 'published', amount: 15, currency: 'EUR', period: 'month', basis: 'per user' }),
      base('free', { kind: 'free' }),
      base('quote', { kind: 'quote' }),
      base('unknown', { kind: 'unknown' }),
    ]);
    expect(ctx.comparable.map((c) => [c.name, c.monthly])).toEqual([
      ['free', 0],
      ['annual', 10],
      ['idv', 20],
    ]);
    const reasons = Object.fromEntries(ctx.notComparable.map((c) => [c.name, c.reason]));
    expect(reasons.team).toMatch(/basis/);
    expect(reasons.eur).toMatch(/currency/);
    expect(reasons.quote).toBe('quote only');
    expect(reasons.unknown).toBe('unknown');
  });
});

describe('unknowns stay distinct from zero', () => {
  it('blank SOM is null (unknown) and is never reported as zero', () => {
    const project = tinyProject();
    const outcome = analyzeProject(project);
    expect(outcome.status).toBe('ok');
    expect(project.products.every((p) => p.som === null)).toBe(true);
    if (outcome.status !== 'ok') return;
    const text = buildNarrative(project, outcome.analysis, null)
      .sections.flatMap((s) => [...s.paragraphs, ...(s.list ?? [])])
      .map(inlineToText)
      .join(' ');
    expect(text).toMatch(/blank SOM means unknown, not zero/);
  });

  it('SOM of zero is valid, SOM above SAM is an error', () => {
    const project = tinyProject();
    project.products[1].som = 0;
    expect(validateProject(project).blocking).toBe(false);
    project.products[1].som = 101;
    const v = validateProject(project);
    expect(v.blocking).toBe(true);
    expect(v.issues.find((i) => i.code === 'som-exceeds-sam')).toBeTruthy();
  });
});

describe('validation and progressive drafts', () => {
  it('excludes incomplete competitors but keeps analysing the rest', () => {
    const project = tinyProject();
    project.products.push(createProduct({ id: 'z_draft', name: 'Draft' }));
    const v = validateProject(project);
    expect(v.blocking).toBe(false);
    expect(v.excluded).toEqual([{ productId: 'z_draft', name: 'Draft', missing: ['SAM', 'a customer segment'] }]);
    expect(v.analyzedIds).not.toContain('z_draft');
  });

  it('blocks when SAM exceeds TAM, with the numbers in the message', () => {
    const project = tinyProject();
    project.products[2].sam = 5000;
    const v = validateProject(project);
    expect(v.blocking).toBe(true);
    expect(v.issues.find((i) => i.code === 'sam-exceeds-tam')?.message).toMatch(/5,000.*1,000/);
  });

  it('rejects non-positive and non-finite SAM', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const project = tinyProject();
      project.products[3].sam = bad;
      expect(validateProject(project).issues.some((i) => i.code === 'sam-not-positive')).toBe(true);
    }
  });

  it('blocks when the IDV is incomplete', () => {
    const project = tinyProject();
    project.products[0].allocations = [];
    const v = validateProject(project);
    expect(v.blocking).toBe(true);
    expect(v.issues.some((i) => i.code === 'idv-incomplete')).toBe(true);
  });
});

describe('narrative', () => {
  const project = createDemoProject();
  const outcome = analyzeProject(project);
  if (outcome.status !== 'ok') throw new Error('demo must analyse');
  const a = outcome.analysis;
  const l = computeLayout(buildLayoutInput(a));
  const n = buildNarrative(project, a, layoutDiagnostics(a, l));
  const text = n.sections.flatMap((s) => [s.title, ...s.paragraphs.map(inlineToText), ...(s.list ?? []).map(inlineToText)]).join('\n');

  it('covers the required sections in order', () => {
    expect(n.sections.map((s) => s.id)).toEqual(['scope', 'nearest', 'overlap', 'idv-allocation', 'groups', 'crowding', 'price', 'assumptions']);
  });

  it('reports nearest, overlap, allocation and union facts from the metrics', () => {
    expect(text).toMatch(/Gemini is closest to ChatGPT, at a modelled distance of 0\.532/);
    expect(text).toMatch(/300,000 potential customers/);
    expect(text).toMatch(/largest modelled segment allocation is Casual\/daily users \(200,000 potential customers, 40% of its SAM\)/);
    expect(text).toMatch(/modelled union of all footprints is 750,000/);
    expect(text).toMatch(/250,000 potential customers outside the modelled footprints/);
  });

  it('labels unsourced inputs and never claims market share or customer preference', () => {
    expect(text).toMatch(/unsourced estimate/);
    expect(text).not.toMatch(/most likely to buy(?!\.)/);
    expect(text).not.toMatch(/\bwill (win|capture)\b/i);
    expect(text).not.toMatch(/market share of/i);
  });

  it('uses relative crowding labels with three or more competitors', () => {
    expect(text).toMatch(/Programmers: 3 of 4 competitors .* — More crowded\./);
  });
});
