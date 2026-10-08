// Display formatting only. Never round values that are written back to data.

export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function formatDistance(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(3);
}

export function formatPercent(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  // Avoid "100%" for 99.6% or "0%" for 0.3% so small differences stay visible.
  if (digits === 0 && pct > 0 && pct < 1) return '<1%';
  if (digits === 0 && pct > 99 && pct < 100) return '>99%';
  return `${pct.toFixed(digits)}%`;
}

/** Percent for an allocation split: up to 2 decimals, trailing zeros trimmed. */
export function formatSplitPercent(fraction: number): string {
  const pct = fraction * 100;
  return `${Number(pct.toFixed(2))}%`;
}

export function formatDegrees(rad: number | null | undefined): string {
  if (rad === null || rad === undefined || !Number.isFinite(rad)) return 'undefined';
  return `${((rad * 180) / Math.PI).toFixed(1)}°`;
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

/** Parse "350000", "350,000", "350k", "1.2M", "2b". Returns null for blank. */
export function parseQuantity(input: string): { value: number | null; error?: string } {
  const raw = input.trim().replace(/[,_\s]/g, '');
  if (raw === '') return { value: null };
  const match = /^(\d+(?:\.\d+)?|\.\d+)([kmb])?$/i.exec(raw);
  if (!match) return { value: null, error: 'Enter a number such as 350000, 350,000 or 350k.' };
  const base = Number(match[1]);
  const mult = match[2] ? { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase() as 'k' | 'm' | 'b'] : 1;
  const value = base * mult;
  if (!Number.isFinite(value)) return { value: null, error: 'That number is too large.' };
  return { value };
}

export function quantityToInput(value: number | null): string {
  return value === null ? '' : String(value);
}

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'project';
}
