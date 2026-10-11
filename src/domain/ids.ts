/** Stable random identifiers. IDs are opaque; ordering by ID is used only for reproducibility. */
export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return `${prefix}_${c.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${prefix}_${s}`;
}

/** Deterministic string comparison used for stable-ID ordering (locale-independent). */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
