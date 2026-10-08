// Draft validation. Drafts may be incomplete or invalid and are always saved;
// this decides whether the current draft can be analysed.
//
// - Incomplete competitors (no name, SAM or segment yet) are excluded from the
//   analysis and listed, so a project can be enriched progressively.
// - Invalid values (errors) block the analysis entirely. The last valid
//   snapshot may still be shown, but it is never labelled current.

import { allocationTotal } from './allocation';
import { LIMITS, MODEL_SETTINGS } from './constants';
import { compareIds } from './ids';
import { footprintOf, modeledUnion, unionFitsTam, type Footprint } from './model';
import { formatPercent, formatQuantity } from './format';
import type { Product, Project, Source } from './types';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  productId?: string;
  field?: string;
}

export interface ExcludedProduct {
  productId: string;
  name: string;
  missing: string[];
}

export interface ValidationResult {
  issues: Issue[];
  /** True when any error exists; the draft cannot be analysed. */
  blocking: boolean;
  /** Products included in the analysis: IDV first, then competitors in stable ID order. */
  analyzedIds: string[];
  excluded: ExcludedProduct[];
  /** Modelled union over analysed products, when it could be computed. */
  union: number | null;
}

/** Tag-like markup or script URLs. Text is always rendered escaped, but it is
 *  rejected so every saved project can round-trip through JSON import. */
export const MARKUP_PATTERN = /<\s*\/?\s*[a-z!?][^>]*>|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html/i;

export function hasMarkup(text: string | undefined): boolean {
  return text !== undefined && MARKUP_PATTERN.test(text);
}

function markupIssues(fields: Record<string, string | undefined>, productId?: string): Issue[] {
  return Object.entries(fields)
    .filter(([, v]) => hasMarkup(v))
    .map(([field]) => ({
      severity: 'error' as const,
      code: 'markup',
      message: `${field[0].toUpperCase()}${field.slice(1)} contains HTML-like markup or a script link; remove the angle-bracket tag.`,
      productId,
      field: field === 'reference' ? 'sources' : field,
    }));
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sourceIssues(sources: readonly Source[], productId?: string): Issue[] {
  const issues: Issue[] = [];
  sources.forEach((s, i) => {
    if (!s.url.trim()) {
      issues.push({ severity: 'error', code: 'source-url-missing', message: `Reference ${i + 1} has no URL.`, productId, field: 'sources' });
    } else if (s.url.length > LIMITS.maxUrlLength || !isHttpUrl(s.url)) {
      issues.push({
        severity: 'error',
        code: 'source-url-invalid',
        message: `Reference ${i + 1} must be an http:// or https:// link.`,
        productId,
        field: 'sources',
      });
    }
  });
  return issues;
}

/** What is still missing before a product can be analysed. */
export function missingForAnalysis(product: Product): string[] {
  const missing: string[] = [];
  if (!product.name.trim()) missing.push('name');
  if (product.sam === null) missing.push('SAM');
  if (product.allocations.length === 0) missing.push('a customer segment');
  return missing;
}

/** Field-level checks, shared by the product form (inline errors) and the project validator. */
export function productIssues(product: Product, project: Pick<Project, 'tam' | 'marketUnit' | 'segments'>): Issue[] {
  const issues: Issue[] = [];
  const pid = product.id;
  const unit = project.marketUnit || 'units';
  const err = (code: string, field: string, message: string) =>
    issues.push({ severity: 'error', code, message, productId: pid, field });
  const warn = (code: string, field: string, message: string) =>
    issues.push({ severity: 'warning', code, message, productId: pid, field });

  if (product.name.length > LIMITS.maxNameLength) err('name-too-long', 'name', `Name is longer than ${LIMITS.maxNameLength} characters.`);
  if (!product.description.trim()) warn('description-missing', 'description', 'Add a short description.');
  if (product.description.length > LIMITS.maxDescriptionLength) {
    err('description-too-long', 'description', `Description is longer than ${LIMITS.maxDescriptionLength} characters.`);
  }

  const tamValid = project.tam !== null && Number.isFinite(project.tam) && project.tam > 0;
  if (product.sam !== null) {
    if (!Number.isFinite(product.sam) || product.sam <= 0) {
      err('sam-not-positive', 'sam', 'SAM must be a positive number.');
    } else if (product.sam > LIMITS.maxQuantity) {
      err('sam-too-large', 'sam', 'SAM is too large to model reliably.');
    } else if (tamValid && product.sam > (project.tam as number)) {
      err(
        'sam-exceeds-tam',
        'sam',
        `SAM (${formatQuantity(product.sam)} ${unit}) exceeds the project TAM (${formatQuantity(project.tam)} ${unit}).`,
      );
    }
  }

  if (product.som !== null) {
    if (!Number.isFinite(product.som) || product.som < 0) {
      err('som-negative', 'som', 'SOM must be zero or more. Leave it blank if unknown.');
    } else if (product.sam !== null && Number.isFinite(product.sam) && product.som > product.sam) {
      err('som-exceeds-sam', 'som', `SOM (${formatQuantity(product.som)}) cannot exceed SAM (${formatQuantity(product.sam)}).`);
    }
  }

  const segmentIds = new Set(project.segments.map((s) => s.id));
  const seen = new Set<string>();
  for (const a of product.allocations) {
    if (seen.has(a.segmentId)) err('allocation-duplicate', 'allocations', 'A segment is selected twice.');
    seen.add(a.segmentId);
    if (!segmentIds.has(a.segmentId)) err('allocation-dangling', 'allocations', 'A selected segment no longer exists.');
    if (!Number.isFinite(a.fraction) || a.fraction < 0 || a.fraction > 1) {
      err('allocation-range', 'allocations', 'Each segment share must be between 0% and 100%.');
    }
  }
  if (product.allocationMode === 'custom' && product.allocations.length > 0) {
    const total = allocationTotal(product.allocations);
    if (Math.abs(total - 1) > MODEL_SETTINGS.allocationTolerance) {
      err('allocation-total', 'allocations', `Custom segment split totals ${formatPercent(total, 2)}; it must total 100%.`);
    }
    const zero = product.allocations.filter((a) => a.fraction === 0);
    if (zero.length > 0) {
      const names = zero.map((a) => project.segments.find((s) => s.id === a.segmentId)?.name ?? 'a segment');
      warn('allocation-zero', 'allocations', `${names.join(', ')} ${zero.length === 1 ? 'has' : 'have'} 0% in the custom split.`);
    }
  }

  const price = product.price;
  if (price.kind === 'published') {
    if (price.amount === undefined) warn('price-amount-missing', 'price', 'Published price has no amount; it is not compared.');
    else if (!Number.isFinite(price.amount) || price.amount < 0) err('price-amount-invalid', 'price', 'Price must be zero or more.');
    if (!price.currency?.trim()) warn('price-currency-missing', 'price', 'Published price has no currency; it is not compared.');
    if (!price.period) warn('price-period-missing', 'price', 'Published price has no billing period; it is not compared.');
  }

  issues.push(...sourceIssues(product.sources, pid));
  issues.push(
    ...markupIssues(
      {
        name: product.name,
        description: product.description,
        notes: product.notes,
        somHorizon: product.somHorizon,
        price: [product.price.basis, product.price.note, product.price.currency].join(' '),
        reference: product.sources.map((s) => [s.title, s.note].join(' ')).join(' '),
      },
      pid,
    ),
  );
  return issues;
}

export function validateProject(project: Project): ValidationResult {
  const issues: Issue[] = [];
  const unit = project.marketUnit || 'units';

  if (!project.name.trim()) issues.push({ severity: 'warning', code: 'project-name-missing', message: 'Give the project a name.' });
  if (!project.marketUnit.trim()) issues.push({ severity: 'warning', code: 'unit-missing', message: 'Choose a market-size unit.' });

  if (project.tam === null) {
    issues.push({ severity: 'error', code: 'tam-missing', message: 'Enter the project TAM (a positive number).', field: 'tam' });
  } else if (!Number.isFinite(project.tam) || project.tam <= 0) {
    issues.push({ severity: 'error', code: 'tam-invalid', message: 'TAM must be a positive number.', field: 'tam' });
  } else if (project.tam > LIMITS.maxQuantity) {
    issues.push({ severity: 'error', code: 'tam-too-large', message: 'TAM is too large to model reliably.', field: 'tam' });
  }

  if (project.products.length > LIMITS.maxProducts) {
    issues.push({
      severity: 'error',
      code: 'too-many-products',
      message: `This MVP supports up to ${LIMITS.maxProducts} products including the IDV (currently ${project.products.length}).`,
    });
  }
  if (project.segments.length > LIMITS.maxSegments) {
    issues.push({
      severity: 'error',
      code: 'too-many-segments',
      message: `This MVP supports up to ${LIMITS.maxSegments} customer segments (currently ${project.segments.length}).`,
    });
  }

  const ids = new Set<string>();
  for (const p of project.products) {
    if (ids.has(p.id)) issues.push({ severity: 'error', code: 'duplicate-id', message: `Duplicate product ID ${p.id}.` });
    ids.add(p.id);
  }
  const segIds = new Set<string>();
  for (const s of project.segments) {
    if (segIds.has(s.id)) issues.push({ severity: 'error', code: 'duplicate-segment-id', message: `Duplicate segment ID ${s.id}.` });
    segIds.add(s.id);
  }
  issues.push(...sourceIssues(project.sources));
  issues.push(
    ...markupIssues({
      'project name': project.name,
      'market description': project.marketDescription,
      'project notes': project.notes,
      unit: project.marketUnit,
      'segment name': project.segments.map((x) => x.name).join(' '),
      reference: project.sources.map((x) => [x.title, x.note].join(' ')).join(' '),
    }),
  );

  const idv = project.products.find((p) => p.id === project.idvProductId) ?? null;
  if (project.products.length === 0) {
    issues.push({ severity: 'error', code: 'no-products', message: 'Add your IDV — the main product being evaluated.' });
  } else if (project.idvProductId === null) {
    issues.push({ severity: 'error', code: 'no-idv', message: 'Mark one product as the IDV (the main product being evaluated).' });
  } else if (!idv) {
    issues.push({ severity: 'error', code: 'idv-missing', message: 'The IDV refers to a product that no longer exists. Mark another product as IDV.' });
  }

  const excluded: ExcludedProduct[] = [];
  const analyzable: Product[] = [];
  for (const p of project.products) {
    issues.push(...productIssues(p, project));
    const missing = missingForAnalysis(p);
    if (missing.length === 0) {
      analyzable.push(p);
    } else if (p === idv) {
      issues.push({
        severity: 'error',
        code: 'idv-incomplete',
        message: `The IDV${p.name.trim() ? ` (${p.name})` : ''} needs ${missing.join(', ')} before the landscape can be analysed.`,
        productId: p.id,
      });
    } else {
      excluded.push({ productId: p.id, name: p.name.trim() || 'Untitled product', missing });
      issues.push({
        severity: 'info',
        code: 'product-incomplete',
        message: `${p.name.trim() || 'An untitled product'} is not in the analysis yet: it needs ${missing.join(', ')}.`,
        productId: p.id,
      });
    }
  }

  let blocking = issues.some((i) => i.severity === 'error');
  const competitors = analyzable.filter((p) => p !== idv).sort((a, b) => compareIds(a.id, b.id));
  const analyzedIds = idv && analyzable.includes(idv) ? [idv.id, ...competitors.map((p) => p.id)] : [];

  let union: number | null = null;
  if (!blocking && analyzedIds.length > 0 && project.tam !== null) {
    const byId = new Map(project.products.map((p) => [p.id, p]));
    const footprints: Footprint[] = analyzedIds.map((id) => footprintOf(byId.get(id) as Product));
    union = modeledUnion(footprints);
    if (!unionFitsTam(union, project.tam)) {
      blocking = true;
      issues.push({
        severity: 'error',
        code: 'union-exceeds-tam',
        message:
          `The modelled union of the product footprints (${formatQuantity(union)} ${unit}) exceeds the TAM ` +
          `(${formatQuantity(project.tam)} ${unit}). Reconcile the TAM, the SAMs, or the segment splits — ` +
          `${unionHint(footprints, project)}. Nothing has been rescaled.`,
      });
    }
  }

  if (!blocking && analyzedIds.length === 1) {
    issues.push({ severity: 'info', code: 'no-competitors', message: 'Add a competitor to compare against the IDV.' });
  }

  return { issues, blocking, analyzedIds: blocking ? [] : analyzedIds, excluded, union };
}

function unionHint(footprints: readonly Footprint[], project: Project): string {
  // Name the segments whose largest footprint contributes most to the union.
  const maxBySegment = new Map<string, number>();
  for (const f of footprints) {
    for (const [s, v] of Object.entries(f.amounts)) maxBySegment.set(s, Math.max(maxBySegment.get(s) ?? 0, v));
  }
  const top = [...maxBySegment.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const names = top.map(([s, v]) => `${project.segments.find((x) => x.id === s)?.name ?? s} ${formatQuantity(v)}`);
  return `the largest per-segment footprints are ${names.join(', ')}`;
}

