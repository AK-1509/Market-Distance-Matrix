// Greedy, deterministic label placement. Labels may move (with leader lines);
// data points never do.

import { textWidth } from './scene';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelRequest {
  key: string;
  x: number;
  y: number;
  /** Marker radius around the anchor point. */
  r: number;
  lines: string[];
  size: number;
  weight?: number;
  /** Fallback short text (e.g. a key number) when the full label cannot fit. */
  short?: string;
  /** Preferred direction in radians (screen space, y down), e.g. away from the origin. */
  prefer?: number;
}

export interface PlacedLabel {
  key: string;
  lines: string[];
  size: number;
  weight?: number;
  /** Text x and first-line baseline y. */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  box: Box;
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
  /** True when only the short key could be placed. */
  keyed: boolean;
  /** True when no free spot existed and the label overlaps something. */
  overlapping: boolean;
}

export function overlaps(a: Box, b: Box, pad = 0): boolean {
  return a.x0 < b.x1 + pad && a.x1 + pad > b.x0 && a.y0 < b.y1 + pad && a.y1 + pad > b.y0;
}

const DIRECTIONS = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI];

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

function boxFor(lines: string[], size: number, weight: number | undefined, x: number, cy: number, anchor: 'start' | 'middle' | 'end') {
  const width = Math.max(...lines.map((l) => textWidth(l, size, weight)));
  const lineH = size * 1.2;
  const height = lineH * lines.length;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  const y0 = cy - height / 2;
  // First baseline sits ~0.8em below the top of the first line box.
  return { box: { x0, y0, x1: x0 + width, y1: y0 + height }, baseline: y0 + size * 0.9 };
}

export function placeLabels(requests: readonly LabelRequest[], obstacles: readonly Box[], bounds: Box): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const blocked: Box[] = [...obstacles];

  const inside = (b: Box) => b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1;
  const free = (b: Box) => inside(b) && !blocked.some((o) => overlaps(b, o, 2));

  const tryPlace = (req: LabelRequest, lines: string[], gaps: number[]) => {
    const order = [...DIRECTIONS].sort(
      (a, b) => angleDiff(a, req.prefer ?? 0) - angleDiff(b, req.prefer ?? 0) || DIRECTIONS.indexOf(a) - DIRECTIONS.indexOf(b),
    );
    for (const gap of gaps) {
      for (const dir of order) {
        const dx = Math.cos(dir);
        const dy = Math.sin(dir);
        const dist = req.r + gap;
        const px = req.x + dx * dist;
        const py = req.y + dy * dist;
        const anchor: 'start' | 'middle' | 'end' = Math.abs(dx) < 0.3 ? 'middle' : dx > 0 ? 'start' : 'end';
        // Vertical directions: sit the label box just above / below the point.
        const h = lines.length * req.size * 1.2;
        const cy = Math.abs(dx) < 0.3 ? py + Math.sign(dy) * (h / 2) : py;
        const { box, baseline } = boxFor(lines, req.size, req.weight, px, cy, anchor);
        if (free(box)) {
          const leader = gap > 10 ? { x1: req.x + dx * (req.r + 2), y1: req.y + dy * (req.r + 2), x2: px - dx * 3, y2: py - dy * 3 } : null;
          return { x: px, y: baseline, anchor, box, leader };
        }
      }
    }
    return null;
  };

  for (const req of requests) {
    let spot = tryPlace(req, req.lines, [5, 16, 30, 48, 70]);
    let keyed = false;
    let lines = req.lines;
    if (!spot && req.short) {
      lines = [req.short];
      spot = tryPlace(req, lines, [4, 14, 26]);
      keyed = Boolean(spot);
    }
    let overlapping = false;
    if (!spot) {
      // Nothing free: keep the full label at the preferred side, even if it overlaps.
      lines = req.lines;
      const dir = req.prefer ?? 0;
      const px = req.x + Math.cos(dir) * (req.r + 5);
      const anchor: 'start' | 'end' = Math.cos(dir) >= 0 ? 'start' : 'end';
      const { box, baseline } = boxFor(lines, req.size, req.weight, px, req.y, anchor);
      spot = { x: px, y: baseline, anchor, box, leader: null };
      overlapping = true;
    }
    blocked.push(spot.box);
    placed.push({ key: req.key, lines, size: req.size, weight: req.weight, keyed, overlapping, ...spot });
  }
  return placed;
}
