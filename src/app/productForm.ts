/**
 * Product form state and validation (pure). Raw strings are kept so invalid input is never
 * lost; only valid values are converted into the stored Product.
 */
import { effectiveAllocations } from '../domain/allocation';
import { formatAmount, parseAmountInput } from '../domain/format';
import { MODEL_SETTINGS, TEXT_LIMITS } from '../domain/settings';
import { containsExecutableMarkup } from '../domain/text';
import type { EvidenceStatus, PriceKind, PricePeriod, Product } from '../domain/types';
import { fromSourceDrafts, sourceErrors, toSourceDrafts, type SourceDraft } from './sources';

export const BASIS_OPTIONS = ['per user', 'per team', 'per unit'] as const;

export interface ProductFormState {
  id: string;
  name: string;
  description: string;
  isIdv: boolean;
  sam: string;
  som: string;
  somHorizon: string;
  segmentIds: string[];
  allocationMode: 'equal' | 'custom';
  percents: Record<string, string>;
  /** Stored fractions with the text they were displayed as; untouched shares keep exact values. */
  originalFractions: Record<string, { text: string; fraction: number }>;
  priceKind: PriceKind;
  priceAmount: string;
  currency: string;
  period: PricePeriod;
  basis: string;
  basisCustom: string;
  priceNote: string;
  evidenceStatus: EvidenceStatus;
  sources: SourceDraft[];
  notes: string;
}

export type FormField =
  | 'name'
  | 'description'
  | 'sam'
  | 'som'
  | 'somHorizon'
  | 'segments'
  | 'split'
  | 'priceAmount'
  | 'currency'
  | 'basis'
  | 'priceNote'
  | 'sources'
  | 'notes';

export interface FormCheck {
  errors: Partial<Record<FormField, string>>;
  warnings: Partial<Record<FormField, string>>;
  splitTotal: number | null;
}

/** Format a stored number for editing without losing precision (grouping only). */
export function formatExactInput(n: number): string {
  const s = String(n);
  if (/e/i.test(s)) return s;
  const [int, dec] = s.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = sign ? int.slice(1) : int;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${dec ? `.${dec}` : ''}`;
}

function trimNumber(n: number): string {
  return String(Number(n.toFixed(6)));
}

/** Default custom split derived from an equal split, rounded to 2 decimals totaling exactly 100. */
export function defaultPercents(segmentIds: readonly string[]): Record<string, string> {
  const k = segmentIds.length;
  if (k === 0) return {};
  const base = Math.floor((10000 / k)) / 100;
  const out: Record<string, string> = {};
  segmentIds.forEach((id, i) => {
    out[id] = i === k - 1 ? trimNumber(100 - base * (k - 1)) : trimNumber(base);
  });
  return out;
}

export function formFromProduct(p: Product, isIdv: boolean): ProductFormState {
  const basis = p.price.basis ?? 'per user';
  const known = (BASIS_OPTIONS as readonly string[]).includes(basis);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isIdv,
    sam: p.sam === null ? '' : formatExactInput(p.sam),
    som: p.som === null ? '' : formatExactInput(p.som),
    somHorizon: p.somHorizon ?? '',
    segmentIds: p.allocations.map((a) => a.segmentId),
    allocationMode: p.allocationMode,
    percents:
      p.allocationMode === 'custom'
        ? Object.fromEntries(p.allocations.map((a) => [a.segmentId, trimNumber(a.fraction * 100)]))
        : defaultPercents(p.allocations.map((a) => a.segmentId)),
    originalFractions:
      p.allocationMode === 'custom'
        ? Object.fromEntries(p.allocations.map((a) => [a.segmentId, { text: trimNumber(a.fraction * 100), fraction: a.fraction }]))
        : {},
    priceKind: p.price.kind,
    priceAmount: p.price.amount === undefined ? '' : String(p.price.amount),
    currency: p.price.currency ?? 'USD',
    period: p.price.period ?? 'month',
    basis: known ? basis : 'other',
    basisCustom: known ? '' : basis,
    priceNote: p.price.note ?? '',
    evidenceStatus: p.evidenceStatus,
    sources: toSourceDrafts(p.sources),
    notes: p.notes ?? '',
  };
}

const MARKUP = 'Remove script-like markup (for example <script> or javascript:).';

function textCheck(value: string, max: number, label: string, required: boolean): string | undefined {
  if (required && !value.trim()) return `${label} is required.`;
  if (value.length > max) return `${label} must be at most ${max} characters.`;
  if (containsExecutableMarkup(value)) return MARKUP;
  return undefined;
}

export function checkProductForm(f: ProductFormState, ctx: { tam: number | null; unit: string }): FormCheck {
  const errors: FormCheck['errors'] = {};
  const warnings: FormCheck['warnings'] = {};
  const set = (field: FormField, msg: string | undefined) => {
    if (msg) errors[field] = msg;
  };

  set('name', textCheck(f.name, TEXT_LIMITS.name, 'Name', true));
  set('description', textCheck(f.description, TEXT_LIMITS.description, 'A short description', true));

  const sam = parseAmountInput(f.sam);
  if (sam === null) warnings.sam = 'SAM is required for analysis. You can save without it as a draft.';
  else if (Number.isNaN(sam) || !Number.isFinite(sam)) errors.sam = 'Enter SAM as a number, for example 350,000.';
  else if (sam <= 0) errors.sam = 'SAM must be greater than 0.';
  else if (ctx.tam !== null && sam > ctx.tam * (1 + MODEL_SETTINGS.marketTolerance)) {
    warnings.sam = `This exceeds the project TAM of ${formatAmount(ctx.tam)} ${ctx.unit}. You can save it, but the analysis pauses until TAM or SAM is reconciled.`;
  }

  const som = parseAmountInput(f.som);
  if (som !== null) {
    if (Number.isNaN(som) || !Number.isFinite(som)) errors.som = 'Enter SOM as a number, or leave it blank if unknown.';
    else if (som < 0) errors.som = 'SOM cannot be negative. Leave it blank if unknown.';
    else if (sam !== null && Number.isFinite(sam) && sam > 0 && som > sam) errors.som = `SOM must be between 0 and SAM (${formatAmount(sam)}).`;
  }
  set('somHorizon', textCheck(f.somHorizon, 80, 'SOM horizon', false));

  if (f.segmentIds.length === 0) warnings.segments = 'Select at least one customer segment for analysis.';
  if (f.segmentIds.length > MODEL_SETTINGS.maxSegments) errors.segments = `At most ${MODEL_SETTINGS.maxSegments} segments.`;

  let splitTotal: number | null = null;
  if (f.allocationMode === 'custom' && f.segmentIds.length > 0) {
    let total = 0;
    for (const id of f.segmentIds) {
      const raw = (f.percents[id] ?? '').trim();
      const original = f.originalFractions[id];
      const v = original && original.text === raw ? original.fraction * 100 : raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        errors.split = 'Each share must be a number between 0 and 100.';
        total = Number.NaN;
        break;
      }
      total += v;
    }
    splitTotal = Number.isNaN(total) ? null : total;
    if (splitTotal !== null && Math.abs(splitTotal - 100) > 1e-4) {
      errors.split = `The custom split totals ${Number(splitTotal.toFixed(4))}%. Adjust it to total exactly 100%, or reset to an equal split.`;
    }
  }

  if (f.priceKind === 'published') {
    const amount = parseAmountInput(f.priceAmount);
    if (amount === null) errors.priceAmount = 'Enter the published amount, or choose Unknown.';
    else if (!Number.isFinite(amount) || amount < 0) errors.priceAmount = 'Price must be a number of 0 or more.';
    set('currency', textCheck(f.currency, 12, 'Currency', true));
    if (f.basis === 'other') set('basis', textCheck(f.basisCustom, 60, 'Billing basis', true));
  }
  set('priceNote', textCheck(f.priceNote, TEXT_LIMITS.description, 'Price note', false));
  if (f.sources.some((s) => sourceErrors(s) !== null)) errors.sources = 'Fix or remove the highlighted references.';
  set('notes', textCheck(f.notes, TEXT_LIMITS.notes, 'Notes', false));
  return { errors, warnings, splitTotal };
}

/** Convert a form that passed `checkProductForm` (no errors) into a stored Product. */
export function productFromForm(f: ProductFormState): Product {
  const sam = parseAmountInput(f.sam);
  const som = parseAmountInput(f.som);
  const allocations =
    f.allocationMode === 'equal'
      ? effectiveAllocations({ allocationMode: 'equal', allocations: f.segmentIds.map((segmentId) => ({ segmentId, fraction: 0 })) })
      : f.segmentIds.map((segmentId) => {
          const raw = (f.percents[segmentId] ?? '').trim();
          const original = f.originalFractions[segmentId];
          if (original && original.text === raw) return { segmentId, fraction: original.fraction };
          return { segmentId, fraction: (raw === '' ? 0 : Number(raw)) / 100 };
        });
  const basis = f.basis === 'other' ? f.basisCustom.trim() : f.basis;
  return {
    id: f.id,
    name: f.name.trim(),
    description: f.description.trim(),
    sam: sam === null ? null : sam,
    som: som === null ? null : som,
    ...(f.somHorizon.trim() ? { somHorizon: f.somHorizon.trim() } : {}),
    allocations,
    allocationMode: f.allocationMode,
    price:
      f.priceKind === 'published'
        ? {
            kind: 'published',
            amount: parseAmountInput(f.priceAmount) as number,
            currency: f.currency.trim().toUpperCase(),
            period: f.period,
            basis,
            ...(f.priceNote.trim() ? { note: f.priceNote.trim() } : {}),
          }
        : { kind: f.priceKind, ...(f.priceNote.trim() ? { note: f.priceNote.trim() } : {}) },
    evidenceStatus: f.evidenceStatus,
    sources: fromSourceDrafts(f.sources),
    ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
  };
}
