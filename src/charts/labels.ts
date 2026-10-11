/**
 * Deterministic text measurement and label placement. Labels (and leader lines) may move
 * freely; data points never move.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Approximate advance widths (em) for a typical system sans-serif. */
function charWidth(ch: string): number {
  if (/[ilI.,:;'|!·]/.test(ch)) return 0.28;
  if (/[fjrt()[\]/]/.test(ch)) return 0.36;
  if (ch === ' ') return 0.28;
  if (/[mwMW]/.test(ch)) return 0.84;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[—↔%]/.test(ch)) return 0.9;
  if (ch.charCodeAt(0) > 0x2e80) return 1.0; // CJK and wide glyphs
  return 0.53;
}

export function textWidth(text: string, size: number, weight = 400): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return w * size * (weight >= 600 ? 1.06 : 1);
}

/** Truncate with an ellipsis to fit a pixel width. */
export function fitText(text: string, size: number, maxWidth: number, weight = 400): string {
  if (textWidth(text, size, weight) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, size, weight) > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Greedy word wrap to a pixel width. */
export function wrapText(text: string, size: number, maxWidth: number, weight = 400): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (textWidth(candidate, size, weight) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

export interface LabelRequest {
  key: string;
  /** Marker center in pixels. */
  px: number;
  py: number;
  markerRadius: number;
  lines: string[];
  size: number;
  weight: number;
  /** Preferred direction in screen radians (0 = right, π/2 = down). */
  preferred: number;
}

export interface PlacedLabel {
  key: string;
  lines: string[];
  size: number;
  weight: number;
  anchor: 'start' | 'middle' | 'end';
  /** x of the text anchor and baseline y of the first line. */
  x: number;
  y: number;
  box: Box;
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
}

const LINE_HEIGHT = 1.22;
const DIRECTIONS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6].map((k) => (k * Math.PI) / 6);

function candidateBox(req: LabelRequest, theta: number, offset: number): { box: Box; anchor: PlacedLabel['anchor']; x: number; y: number; ax: number; ay: number } {
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const ax = req.px + dx * offset;
  const ay = req.py + dy * offset;
  const w = Math.max(...req.lines.map((l) => textWidth(l, req.size, req.weight)));
  const h = req.lines.length * req.size * LINE_HEIGHT;
  let anchor: PlacedLabel['anchor'];
  let x0: number;
  if (dx > 0.34) {
    anchor = 'start';
    x0 = ax;
  } else if (dx < -0.34) {
    anchor = 'end';
    x0 = ax - w;
  } else {
    anchor = 'middle';
    x0 = ax - w / 2;
  }
  let y0: number;
  if (dy > 0.34) y0 = ay;
  else if (dy < -0.34) y0 = ay - h;
  else y0 = ay - h / 2;
  const x = anchor === 'start' ? x0 : anchor === 'end' ? x0 + w : x0 + w / 2;
  const y = y0 + req.size * 0.86;
  const pad = 2;
  return { box: { x0: x0 - pad, y0: y0 - pad, x1: x0 + w + pad, y1: y0 + h + pad }, anchor, x, y, ax, ay };
}

function nearestPointOnBox(b: Box, x: number, y: number): { x: number; y: number } {
  return { x: Math.min(Math.max(x, b.x0), b.x1), y: Math.min(Math.max(y, b.y0), b.y1) };
}

/**
 * Place labels greedily in request order. Each label tries offsets (nearest first) and
 * directions around its preferred direction, avoiding other labels, obstacles, and the
 * bounds. If nothing is collision-free, the least-overlapping candidate is used. Labels
 * displaced from their marker get a leader line.
 */
export function placeLabels(requests: readonly LabelRequest[], obstacles: readonly Box[], bounds: Box): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const taken: Box[] = [];
  for (const req of requests) {
    const offsets = [4, 12, 22, 36, 54, 76].map((o) => req.markerRadius + o);
    let best: { score: number; c: ReturnType<typeof candidateBox>; offset: number } | null = null;
    search: for (const offset of offsets) {
      for (const d of DIRECTIONS) {
        const c = candidateBox(req, req.preferred + d, offset);
        const b = c.box;
        let score = 0;
        const outside = Math.max(0, bounds.x0 - b.x0) + Math.max(0, b.x1 - bounds.x1) + Math.max(0, bounds.y0 - b.y0) + Math.max(0, b.y1 - bounds.y1);
        score += outside * 1000;
        for (const t of taken) score += overlapArea(b, t) * 4;
        for (const o of obstacles) score += overlapArea(b, o);
        // Gentle preference for nearer, preferred-direction placements.
        score += offset * 0.01 + Math.abs(d) * 0.01;
        if (!best || score < best.score) best = { score, c, offset };
        if (score < 1) break search;
      }
    }
    const { c, offset } = best as NonNullable<typeof best>;
    const needsLeader = offset > req.markerRadius + 14;
    let leader: PlacedLabel['leader'] = null;
    if (needsLeader) {
      const end = nearestPointOnBox(c.box, req.px, req.py);
      const ang = Math.atan2(end.y - req.py, end.x - req.px);
      leader = { x1: req.px + Math.cos(ang) * (req.markerRadius + 2), y1: req.py + Math.sin(ang) * (req.markerRadius + 2), x2: end.x, y2: end.y };
    }
    placed.push({ key: req.key, lines: req.lines, size: req.size, weight: req.weight, anchor: c.anchor, x: c.x, y: c.y, box: c.box, leader });
    taken.push(c.box);
  }
  return placed;
}
