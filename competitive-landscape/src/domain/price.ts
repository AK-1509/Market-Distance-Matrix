// Comparable price is context only; it never enters the geometry.

import type { Price, Product } from './types';

export function normalizeBasis(basis: string | undefined): string {
  return (basis ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeCurrency(currency: string | undefined): string {
  return (currency ?? '').trim().toUpperCase();
}

const PERIOD_LABEL: Record<string, string> = {
  month: 'month',
  year: 'year',
  'one-time': 'one-time',
  usage: 'usage',
};

export function formatMoney(amount: number, currency: string): string {
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    // Unknown currency code: show it verbatim rather than guessing a symbol.
    return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${code}`.trim();
  }
}

/** Human description that preserves the original price exactly as entered. */
export function describePrice(price: Price): string {
  switch (price.kind) {
    case 'free':
      return 'Free';
    case 'quote':
      return 'Contact for quote';
    case 'unknown':
      return 'Unknown';
    case 'published': {
      if (price.amount === undefined || !price.currency) return 'Published price (incomplete)';
      const money = formatMoney(price.amount, price.currency);
      const period = price.period ? PERIOD_LABEL[price.period] : undefined;
      const basis = price.basis?.trim();
      let text = money;
      if (period === 'one-time') text += ' one-time';
      else if (period === 'usage') text += ' usage-based';
      else if (period) text += ` / ${period}`;
      if (basis) text += ` ${basis}`;
      return text;
    }
  }
}

export interface MonthlyEquivalent {
  amount: number;
  currency: string;
  basis: string;
  /** True when derived by dividing an annual price by 12. */
  fromAnnual: boolean;
}

/**
 * Monthly equivalent for recurring published prices only. One-time, usage,
 * quote and unknown prices have no monthly equivalent. Free is handled by
 * the caller (it is a real price of zero, never a stand-in for unknowns).
 */
export function monthlyEquivalent(price: Price): MonthlyEquivalent | null {
  if (price.kind !== 'published') return null;
  if (price.amount === undefined || !Number.isFinite(price.amount) || price.amount < 0) return null;
  if (!price.currency) return null;
  if (price.period === 'month') {
    return { amount: price.amount, currency: normalizeCurrency(price.currency), basis: normalizeBasis(price.basis), fromAnnual: false };
  }
  if (price.period === 'year') {
    return { amount: price.amount / 12, currency: normalizeCurrency(price.currency), basis: normalizeBasis(price.basis), fromAnnual: true };
  }
  return null;
}

export interface ComparablePriceEntry {
  productId: string;
  name: string;
  original: string;
  monthly: number;
  fromAnnual: boolean;
  isFree: boolean;
}

export interface PriceContext {
  /** Currency + basis the comparison uses (IDV's), or null if IDV has none. */
  reference: { currency: string; basis: string } | null;
  comparable: ComparablePriceEntry[];
  notComparable: { productId: string; name: string; original: string; reason: string }[];
}

/**
 * Compare only like with like: same currency and the same billing basis as
 * the IDV's recurring published price. Free entries are comparable at zero.
 * Quotes and unknowns are listed separately and never ranked as free.
 */
export function priceContext(idv: Product, competitors: readonly Product[]): PriceContext {
  const ref = monthlyEquivalent(idv.price);
  const all = [idv, ...competitors];
  const comparable: ComparablePriceEntry[] = [];
  const notComparable: PriceContext['notComparable'] = [];
  const reference = ref ? { currency: ref.currency, basis: ref.basis } : null;

  for (const p of all) {
    const original = describePrice(p.price);
    if (p.price.kind === 'free') {
      comparable.push({ productId: p.id, name: p.name, original, monthly: 0, fromAnnual: false, isFree: true });
      continue;
    }
    if (p.price.kind === 'quote') {
      notComparable.push({ productId: p.id, name: p.name, original, reason: 'quote only' });
      continue;
    }
    if (p.price.kind === 'unknown') {
      notComparable.push({ productId: p.id, name: p.name, original, reason: 'unknown' });
      continue;
    }
    const m = monthlyEquivalent(p.price);
    if (!m) {
      notComparable.push({ productId: p.id, name: p.name, original, reason: 'not a recurring monthly or annual price' });
      continue;
    }
    if (!reference) {
      notComparable.push({ productId: p.id, name: p.name, original, reason: 'IDV has no recurring published price to compare against' });
      continue;
    }
    if (m.currency !== reference.currency) {
      notComparable.push({ productId: p.id, name: p.name, original, reason: `different currency (${m.currency})` });
      continue;
    }
    if (m.basis !== reference.basis) {
      notComparable.push({ productId: p.id, name: p.name, original, reason: `different billing basis (${m.basis || 'unspecified'})` });
      continue;
    }
    comparable.push({ productId: p.id, name: p.name, original, monthly: m.amount, fromAnnual: m.fromAnnual, isFree: false });
  }
  // With no reference, free entries alone do not make a comparison.
  const finalComparable = reference ? comparable : [];
  if (!reference) {
    for (const c of comparable) {
      notComparable.push({ productId: c.productId, name: c.name, original: c.original, reason: 'IDV has no recurring published price to compare against' });
    }
  }
  finalComparable.sort((a, b) => a.monthly - b.monthly || (a.productId < b.productId ? -1 : 1));
  return { reference, comparable: finalComparable, notComparable };
}
