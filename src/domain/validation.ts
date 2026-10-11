/**
 * Analysis readiness. Drafts may be incomplete or invalid; this decides what can be
 * analyzed and explains everything else. It never mutates data.
 */
import { checkAllocations } from './allocation';
import { formatAmount } from './format';
import { buildFootprint, buildSegmentIndex, marketTolerance, modeledUnion } from './model';
import { MODEL_SETTINGS } from './settings';
import type { Product, Project } from './types';

export type IssueSeverity = 'error' | 'warning';
export type IssueField =
  | 'tam'
  | 'idv'
  | 'name'
  | 'description'
  | 'sam'
  | 'som'
  | 'segments'
  | 'allocations'
  | 'price'
  | 'limits'
  | 'union';

export interface Issue {
  code: string;
  severity: IssueSeverity;
  message: string;
  productId?: string;
  field: IssueField;
}

export type ReadinessStatus = 'empty' | 'blocked' | 'ready';

export interface Readiness {
  status: ReadinessStatus;
  issues: Issue[];
  /** IDV first, then analyzable competitors in project order. */
  analyzableIds: string[];
  /** Competitors left out because they are incomplete drafts (missing SAM or segments). */
  excludedIds: string[];
  modeledUnion: number | null;
}

function label(p: Product): string {
  return p.name.trim() || 'Unnamed product';
}

export function productIsComplete(p: Product): boolean {
  return p.sam !== null && p.allocations.length > 0;
}

export function assessProject(project: Project): Readiness {
  const issues: Issue[] = [];
  const unit = project.marketUnit || 'units';
  const segIds = new Set(project.segments.map((s) => s.id));
  const tam = project.tam;
  const tamValid = tam !== null && Number.isFinite(tam) && tam > 0;

  if (project.products.length === 0) {
    return { status: 'empty', issues: [], analyzableIds: [], excludedIds: [], modeledUnion: null };
  }

  if (tam === null) {
    issues.push({ code: 'tam-missing', severity: 'error', field: 'tam', message: 'Set a positive project TAM to analyze the landscape.' });
  } else if (!tamValid) {
    issues.push({ code: 'tam-invalid', severity: 'error', field: 'tam', message: 'Project TAM must be a positive number.' });
  }

  if (project.products.length > MODEL_SETTINGS.maxProducts) {
    issues.push({
      code: 'too-many-products',
      severity: 'error',
      field: 'limits',
      message: `This MVP analyzes up to ${MODEL_SETTINGS.maxProducts} products including the IDV; this project has ${project.products.length}. Remove some products to continue.`,
    });
  }
  if (project.segments.length > MODEL_SETTINGS.maxSegments) {
    issues.push({
      code: 'too-many-segments',
      severity: 'error',
      field: 'limits',
      message: `This MVP supports up to ${MODEL_SETTINGS.maxSegments} customer segments; this project has ${project.segments.length}. Merge or remove segments to continue.`,
    });
  }

  const idv = project.products.find((p) => p.id === project.idvProductId) ?? null;
  if (!idv) {
    issues.push({ code: 'idv-missing', severity: 'error', field: 'idv', message: 'Mark one product as the IDV (the main product being evaluated).' });
  }

  const analyzable: string[] = [];
  const excluded: string[] = [];

  for (const p of project.products) {
    const isIdv = p.id === project.idvProductId;
    const name = label(p);
    let productOk = true;

    if (!p.name.trim()) {
      issues.push({ code: 'name-missing', severity: 'error', field: 'name', productId: p.id, message: 'A product is missing its name.' });
      productOk = false;
    }
    if (!p.description.trim()) {
      issues.push({ code: 'description-missing', severity: 'warning', field: 'description', productId: p.id, message: `${name}: add a short description.` });
    }

    // SAM
    if (p.sam === null) {
      if (isIdv) {
        issues.push({ code: 'idv-sam-missing', severity: 'error', field: 'sam', productId: p.id, message: `${name} (IDV): enter a SAM to start the analysis.` });
      }
      productOk = false;
    } else if (!Number.isFinite(p.sam) || p.sam <= 0) {
      issues.push({ code: 'sam-invalid', severity: 'error', field: 'sam', productId: p.id, message: `${name}: SAM must be a positive number.` });
      productOk = false;
    } else if (tamValid && p.sam > (tam as number) + marketTolerance(tam as number)) {
      issues.push({
        code: 'sam-exceeds-tam',
        severity: 'error',
        field: 'sam',
        productId: p.id,
        message: `${name}: SAM of ${formatAmount(p.sam)} ${unit} exceeds the project TAM of ${formatAmount(tam)} ${unit}. Reconcile TAM or SAM; nothing is rescaled automatically.`,
      });
      productOk = false;
    }

    // Segments & allocations
    const problems = checkAllocations(p, segIds);
    for (const prob of problems) {
      if (prob.code === 'no-segments') {
        if (isIdv) {
          issues.push({ code: 'idv-segments-missing', severity: 'error', field: 'segments', productId: p.id, message: `${name} (IDV): select at least one customer segment.` });
        }
        productOk = false;
      } else if (prob.code === 'total-not-100') {
        issues.push({
          code: 'allocation-total',
          severity: 'error',
          field: 'allocations',
          productId: p.id,
          message: `${name}: custom segment split totals ${formatPercent(prob.total, 2)}; it must total 100%. Adjust the split or reset it to equal.`,
        });
        productOk = false;
      } else if (prob.code === 'invalid-fraction') {
        issues.push({ code: 'allocation-invalid', severity: 'error', field: 'allocations', productId: p.id, message: `${name}: each segment share must be between 0% and 100%.` });
        productOk = false;
      } else if (prob.code === 'duplicate-segment') {
        issues.push({ code: 'allocation-duplicate', severity: 'error', field: 'allocations', productId: p.id, message: `${name}: a segment is selected twice.` });
        productOk = false;
      } else if (prob.code === 'unknown-segment') {
        issues.push({ code: 'allocation-unknown', severity: 'error', field: 'allocations', productId: p.id, message: `${name}: refers to a segment that no longer exists.` });
        productOk = false;
      }
    }

    // SOM (context only, but must be a valid scenario estimate)
    if (p.som !== null) {
      if (!Number.isFinite(p.som) || p.som < 0) {
        issues.push({ code: 'som-invalid', severity: 'error', field: 'som', productId: p.id, message: `${name}: SOM must be zero or a positive number, or left blank if unknown.` });
      } else if (p.sam !== null && Number.isFinite(p.sam) && p.som > p.sam + marketTolerance(p.sam)) {
        issues.push({ code: 'som-exceeds-sam', severity: 'error', field: 'som', productId: p.id, message: `${name}: SOM (${formatAmount(p.som)}) cannot exceed SAM (${formatAmount(p.sam)}).` });
      }
    }

    // Price (context only)
    if (p.price.kind === 'published') {
      const a = p.price.amount;
      if (a !== undefined && (!Number.isFinite(a) || a < 0)) {
        issues.push({ code: 'price-invalid', severity: 'error', field: 'price', productId: p.id, message: `${name}: published price must be zero or positive.` });
      } else if (a === undefined) {
        issues.push({ code: 'price-amount-missing', severity: 'warning', field: 'price', productId: p.id, message: `${name}: published price has no amount, so it is not compared.` });
      }
    }

    const hasBlockingError = issues.some((i) => i.productId === p.id && i.severity === 'error');
    if (productOk && !hasBlockingError) {
      analyzable.push(p.id);
    } else if (!isIdv && !hasBlockingError) {
      excluded.push(p.id);
    }
  }

  if (excluded.length > 0) {
    const names = excluded.map((id) => label(project.products.find((p) => p.id === id) as Product));
    issues.push({
      code: 'competitors-incomplete',
      severity: 'warning',
      field: 'sam',
      message: `Not yet analyzed (needs SAM and at least one segment): ${names.join(', ')}.`,
    });
  }

  let union: number | null = null;
  const blocked = issues.some((i) => i.severity === 'error');
  if (!blocked && idv && tamValid) {
    const index = buildSegmentIndex(project.segments.map((s) => s.id));
    const ordered = [idv.id, ...analyzable.filter((id) => id !== idv.id)];
    const fps = ordered.map((id) => buildFootprint(project.products.find((p) => p.id === id) as Product, index));
    union = modeledUnion(fps);
    if (union > (tam as number) + marketTolerance(tam as number)) {
      issues.push({
        code: 'union-exceeds-tam',
        severity: 'error',
        field: 'union',
        message: `The modeled footprints cover ${formatAmount(union)} ${unit}, more than the TAM of ${formatAmount(tam)} ${unit}. Reconcile the TAM, SAMs, or segment splits; values are never rescaled automatically.`,
      });
    }
    analyzable.splice(0, analyzable.length, ...ordered);
  }

  const status: ReadinessStatus = issues.some((i) => i.severity === 'error') ? 'blocked' : 'ready';
  return { status, issues, analyzableIds: status === 'ready' ? analyzable : [], excludedIds: excluded, modeledUnion: union };
}

function formatPercent(fraction: number, digits: number): string {
  return `${Number((fraction * 100).toFixed(digits))}%`;
}
