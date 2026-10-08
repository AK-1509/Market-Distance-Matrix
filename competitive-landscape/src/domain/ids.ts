// Stable, time-ordered identifiers. Sorting IDs lexicographically yields
// creation order, which the layout uses for reproducible ordering and for the
// default anchor (a product added later never displaces an earlier anchor).

let lastTime = 0;
let sequence = 0;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomSuffix(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}

export function newId(prefix: string): string {
  let time = Date.now();
  if (time <= lastTime) {
    time = lastTime;
    sequence += 1;
    if (sequence >= 36 * 36) {
      time = lastTime + 1;
      sequence = 0;
    }
  } else {
    sequence = 0;
  }
  lastTime = time;
  const t = time.toString(36).padStart(9, '0');
  const s = sequence.toString(36).padStart(2, '0');
  return `${prefix}_${t}${s}${randomSuffix(4)}`;
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Deterministic comparison used everywhere a "stable ID order" is required. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
