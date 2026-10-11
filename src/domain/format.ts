/** Display formatting. Formatting never feeds back into stored or modeled values. */

const integerFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.abs(value) >= 100 || Number.isInteger(value) ? integerFmt.format(value) : decimalFmt.format(value);
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e4) return `${trim(value / 1e3)}k`;
  return formatAmount(value);
}

function trim(v: number): string {
  return Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)).toString();
}

export function formatDistance(d: number): string {
  return d.toFixed(3);
}

export function formatShare(fraction: number): string {
  const pct = fraction * 100;
  if (pct > 0 && pct < 1) return '<1%';
  if (pct < 100 && pct > 99) return '>99%';
  return `${Math.round(pct)}%`;
}

export function formatDegrees(rad: number | null): string {
  if (rad === null) return 'undefined';
  return `${Math.round((rad * 180) / Math.PI)}°`;
}

export function formatWithUnit(value: number | null, unit: string): string {
  return value === null ? '—' : `${formatAmount(value)} ${unit}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Oxford-comma list: "A", "A and B", "A, B, and C". */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Parse a user-entered amount like "350,000" or "1 000 000.5".
 * Returns null for blank input (unknown), NaN for anything unparseable.
 */
export function parseAmountInput(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const cleaned = t.replace(/[,\s_]/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}
