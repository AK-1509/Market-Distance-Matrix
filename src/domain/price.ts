/**
 * Comparable price context. Price never enters the geometry. Prices are compared only
 * when currency and billing basis match; yearly amounts get a monthly equivalent only
 * inside such a group. No currency conversion, no invented seat counts, and quotes or
 * unknowns are never treated as free.
 */
import { compareIds } from './ids';
import type { Price, PricePeriod, Product } from './types';

export type PriceCadence = 'recurring' | 'one-time' | 'usage';

export interface PriceEntry {
  productId: string;
  amount: number;
  currency: string;
  basis: string;
  period: PricePeriod;
  /** Monthly equivalent for recurring prices (yearly / 12); null otherwise. */
  monthlyEquivalent: number | null;
  /** The value used for ordering within a group. */
  comparableAmount: number;
}

export interface PriceGroup {
  key: string;
  currency: string;
  basis: string;
  cadence: PriceCadence;
  entries: PriceEntry[];
}

export interface PriceComparison {
  /** Groups with at least two directly comparable published prices. */
  groups: PriceGroup[];
  /** Published prices with no comparable counterpart. */
  standalone: PriceEntry[];
  /** Published prices missing amount, currency, period, or basis. */
  incomplete: string[];
  free: string[];
  quote: string[];
  unknown: string[];
}

export function normalizeCurrency(c: string | undefined): string {
  return (c ?? '').trim().toUpperCase();
}

export function normalizeBasis(b: string | undefined): string {
  return (b ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function cadenceOf(period: PricePeriod): PriceCadence {
  return period === 'month' || period === 'year' ? 'recurring' : period;
}

/** Monthly equivalent of a recurring price; only meaningful inside a matching group. */
export function monthlyEquivalent(amount: number, period: PricePeriod): number | null {
  if (period === 'month') return amount;
  if (period === 'year') return amount / 12;
  return null;
}

export function toPriceEntry(p: Pick<Product, 'id' | 'price'>): PriceEntry | null {
  const { amount, period } = p.price;
  const currency = normalizeCurrency(p.price.currency);
  const basis = normalizeBasis(p.price.basis);
  if (p.price.kind !== 'published' || amount === undefined || !Number.isFinite(amount) || amount < 0 || !period || !currency || !basis) {
    return null;
  }
  const monthly = monthlyEquivalent(amount, period);
  return { productId: p.id, amount, currency, basis, period, monthlyEquivalent: monthly, comparableAmount: monthly ?? amount };
}

export function comparePrices(products: readonly Pick<Product, 'id' | 'price'>[]): PriceComparison {
  const result: PriceComparison = { groups: [], standalone: [], incomplete: [], free: [], quote: [], unknown: [] };
  const byKey = new Map<string, PriceGroup>();
  for (const p of products) {
    switch (p.price.kind) {
      case 'free':
        result.free.push(p.id);
        continue;
      case 'quote':
        result.quote.push(p.id);
        continue;
      case 'unknown':
        result.unknown.push(p.id);
        continue;
    }
    const entry = toPriceEntry(p);
    if (!entry) {
      result.incomplete.push(p.id);
      continue;
    }
    const cadence = cadenceOf(entry.period);
    const key = `${entry.currency}|${entry.basis}|${cadence}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, currency: entry.currency, basis: entry.basis, cadence, entries: [] };
      byKey.set(key, g);
    }
    g.entries.push(entry);
  }
  for (const g of [...byKey.values()].sort((a, b) => compareIds(a.key, b.key))) {
    g.entries.sort((a, b) => a.comparableAmount - b.comparableAmount || compareIds(a.productId, b.productId));
    if (g.entries.length >= 2) result.groups.push(g);
    else result.standalone.push(...g.entries);
  }
  return result;
}

export function formatMoney(amount: number, currency: string): string {
  const code = normalizeCurrency(currency);
  try {
    if (/^[A-Z]{3}$/.test(code)) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount);
    }
  } catch {
    /* fall through for unrecognized codes */
  }
  return `${Number(amount.toFixed(2))} ${code}`.trim();
}

const PERIOD_LABEL: Record<PricePeriod, string> = { month: '/ month', year: '/ year', 'one-time': 'one-time', usage: 'usage-based' };

/** Human-readable original price, preserving billing period and basis. */
export function formatPrice(price: Price): string {
  switch (price.kind) {
    case 'free':
      return 'Free';
    case 'quote':
      return 'Contact for quote';
    case 'unknown':
      return 'Unknown';
    case 'published': {
      if (price.amount === undefined || !Number.isFinite(price.amount)) return 'Published (amount not entered)';
      const parts = [formatMoney(price.amount, price.currency ?? '')];
      if (price.period) parts.push(PERIOD_LABEL[price.period]);
      if (price.basis) parts.push(price.basis.trim());
      return parts.join(' ');
    }
  }
}
