// Radial landscape scene. IDV at the centre; each competitor at radius d_0i
// (exact) and its fitted angle. One identical scale in x and y. Zoom and pan
// are viewing transforms only; data coordinates are never altered.

import type { Analysis } from '../domain/analysis';
import { MODEL_VERSION } from '../domain/constants';
import { coincidentStacks, segmentCenters, type LayoutDiagnostics } from '../domain/diagnostics';
import { formatDistance, formatPercent, formatQuantity } from '../domain/format';
import type { LayoutResult, Project } from '../domain/types';
import { overlaps, placeLabels, type Box, type LabelRequest } from './labels';
import { INK, type ProductIdentity } from './palette';
import { diamondPath, fitText, starPath, textWidth, type Prim, type Scene } from './scene';
import { wrapText } from './text';

export type ChartVariant = 'screen' | 'export' | 'clean';

export interface RadialSceneInput {
  analysis: Analysis;
  layout: LayoutResult;
  project: Project;
  identities: Record<string, ProductIdentity>;
  width: number;
  height: number;
  variant: ChartVariant;
  showSegments: boolean;
  diagnostics: LayoutDiagnostics | null;
  selectedId?: string | null;
  selectedSegmentId?: string | null;
  pair?: [string, string] | null;
  view?: { zoom: number; panX: number; panY: number };
  generatedAt?: string;
  /** Internal: a clean export whose labels could not name every product uses the wide legend panel. */
  cleanNeedsList?: boolean;
}

export const RING_VALUES = [0.25, 0.5, 0.75, 1] as const;

interface Frame {
  cx: number;
  cy: number;
  R: number;
  bounds: Box;
  font: number;
  ringFont: number;
  markerR: number;
  stroke: number;
}

function exportFrame(w: number, h: number, clean: boolean): Frame {
  // Header 0..150, footer from h-96; map on the left, legend panel on the right.
  const top = 150;
  const bottom = h - 100;
  const mapRight = clean ? w - 520 : w - 700;
  const side = Math.min(mapRight - 80, bottom - top);
  const R = side / 2 - 34;
  return {
    cx: 40 + (mapRight - 40) / 2,
    cy: top + (bottom - top) / 2,
    R,
    bounds: { x0: 40, y0: top - 10, x1: mapRight, y1: bottom },
    font: 22,
    ringFont: 17,
    markerR: 11,
    stroke: 2.5,
  };
}

function screenFrame(w: number, h: number, view: { zoom: number; panX: number; panY: number }): Frame {
  const mx = Math.min(130, Math.max(44, w * 0.14));
  const my = 30;
  const base = Math.max(40, Math.min(w - 2 * mx, h - 2 * my) / 2);
  return {
    cx: w / 2 + view.panX,
    cy: h / 2 + view.panY,
    R: base * view.zoom,
    bounds: { x0: 4, y0: 4, x1: w - 4, y1: h - 4 },
    font: w < 480 ? 11 : 12.5,
    ringFont: 11,
    markerR: 6.5,
    stroke: 2,
  };
}

export function buildRadialScene(input: RadialSceneInput): Scene {
  const { analysis, layout, project, identities, width: w, height: h, variant } = input;
  const exporting = variant !== 'screen';
  const clean = variant === 'clean';
  const narrowPanel = clean && !input.cleanNeedsList;
  const f = exporting ? exportFrame(w, h, narrowPanel) : screenFrame(w, h, input.view ?? { zoom: 1, panX: 0, panY: 0 });
  const toPx = (x: number, y: number) => ({ x: f.cx + x * f.R, y: f.cy - y * f.R });
  const name = (id: string) => analysis.names[id] || 'Untitled product';
  const idvName = name(analysis.idvId);
  const prims: Prim[] = [];
  const obstacles: Box[] = [];

  // Rings with readable numeric labels, placed along the direction that
  // keeps every label clear of the product markers.
  for (const v of RING_VALUES) {
    prims.push({ t: 'circle', cx: f.cx, cy: f.cy, r: v * f.R, fill: 'none', stroke: v === 1 ? INK.axis : INK.grid, sw: exporting ? 1.5 : 1 });
  }
  const markerBoxes: Box[] = analysis.productIds.map((id) => {
    const P = toPx(layout.positions[id].x, layout.positions[id].y);
    const m = f.markerR + 4;
    return { x0: P.x - m, y0: P.y - m, x1: P.x + m, y1: P.y + m };
  });
  const longOuter = exporting || w >= 520;
  const ringBoxes = (angle: number) =>
    RING_VALUES.map((v) => {
      const label = v === 1 && longOuter ? '1.00 · no shared segments' : v.toFixed(2);
      const px = f.cx + Math.cos(angle) * v * f.R;
      const py = f.cy + Math.sin(angle) * v * f.R;
      const width = textWidth(label, f.ringFont);
      const right = Math.cos(angle) >= -0.2;
      const x0 = right ? px + 4 : px - 4 - width;
      const above = Math.sin(angle) <= 0.2;
      const y1 = above ? py - 3 : py + 3 + f.ringFont;
      return { label, x: x0, y: y1 - 2, box: { x0, y0: y1 - f.ringFont, x1: x0 + width, y1 } };
    });
  const candidates = [-Math.PI / 2, (-2 * Math.PI) / 3, -Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3, Math.PI / 3, (-5 * Math.PI) / 6, -Math.PI / 6];
  let best = ringBoxes(candidates[0]);
  let bestHits = Number.POSITIVE_INFINITY;
  for (const a of candidates) {
    const boxes = ringBoxes(a);
    const outside = boxes.filter((b) => b.box.x0 < f.bounds.x0 || b.box.x1 > f.bounds.x1 || b.box.y0 < f.bounds.y0 || b.box.y1 > f.bounds.y1).length;
    const hits = boxes.reduce((n, b) => n + markerBoxes.filter((m) => overlaps(b.box, m)).length, 0) + outside * 10;
    if (hits < bestHits) {
      best = boxes;
      bestHits = hits;
      if (hits === 0) break;
    }
  }
  for (const b of best) {
    prims.push({ t: 'text', x: b.x, y: b.y, text: b.label, size: f.ringFont, fill: INK.muted, tabular: true });
    obstacles.push(b.box);
  }

  // Selected pair connector.
  if (input.pair) {
    const [a, b] = input.pair;
    const pa = layout.positions[a];
    const pb = layout.positions[b];
    if (pa && pb) {
      const A = toPx(pa.x, pa.y);
      const B = toPx(pb.x, pb.y);
      prims.push({ t: 'line', x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: INK.secondary, sw: f.stroke * 0.9 });
    }
  }

  // Segment centres (optional overlay).
  const centers = input.showSegments ? segmentCenters(analysis, layout, project.segments) : [];
  const segPrims: Prim[] = [];
  const segRequests: LabelRequest[] = [];
  const dR = f.markerR * 0.95;
  for (const c of centers) {
    const P = toPx(c.point.x, c.point.y);
    const selected = input.selectedSegmentId === c.segmentId;
    const children: Prim[] = [
      { t: 'circle', cx: P.x, cy: P.y, r: Math.max(12, dR + 6), fill: 'transparent' },
      { t: 'path', d: diamondPath(P.x, P.y, dR + 1.5), fill: INK.surface },
      { t: 'path', d: diamondPath(P.x, P.y, dR), fill: INK.surface, stroke: INK.secondary, sw: f.stroke * 0.9 },
    ];
    if (selected) children.push({ t: 'path', d: diamondPath(P.x, P.y, dR + 5), fill: 'none', stroke: INK.primary, sw: 2 });
    segPrims.push({
      t: 'g',
      children,
      hit: { kind: 'segment', ids: [c.segmentId], label: `Modelled segment center: ${c.name}` },
      testId: 'segment-marker',
      selected,
    });
    obstacles.push({ x0: P.x - dR, y0: P.y - dR, x1: P.x + dR, y1: P.y + dR });
    if (centers.length <= 6 || selected) {
      segRequests.push({
        key: `seg:${c.segmentId}`,
        x: P.x,
        y: P.y,
        r: dR,
        lines: [c.name],
        size: f.ringFont + (exporting ? 1 : 0),
        prefer: Math.atan2(P.y - f.cy, P.x - f.cx) || Math.PI / 2,
      });
    }
  }

  // Products, grouped into exact-coincidence stacks.
  const stacks = coincidentStacks(analysis, layout).map((ids) =>
    [...ids].sort((a, b) => (a === analysis.idvId ? -1 : b === analysis.idvId ? 1 : a < b ? -1 : 1)),
  );
  const order = [...stacks].sort((a, b) => {
    const ia = a.includes(analysis.idvId) ? -1 : 0;
    const ib = b.includes(analysis.idvId) ? -1 : 0;
    if (ia !== ib) return ia - ib;
    const da = analysis.matrices.distance[0][analysis.index[a[0]]];
    const db = analysis.matrices.distance[0][analysis.index[b[0]]];
    return da - db || (a[0] < b[0] ? -1 : 1);
  });

  const productPrims: Prim[] = [];
  const requests: LabelRequest[] = [];
  /** Request key -> products whose full names that label shows (used to decide on the keyed list). */
  const fullyNamed = new Map<string, string[]>();
  for (const stack of order) {
    const lead = stack[0];
    const pos = layout.positions[lead];
    const P = toPx(pos.x, pos.y);
    const hasIdv = lead === analysis.idvId;
    const ident = identities[lead];
    const r = f.markerR;
    const children: Prim[] = [{ t: 'circle', cx: P.x, cy: P.y, r: Math.max(13, r + 7), fill: 'transparent' }];
    if (hasIdv) {
      children.push({ t: 'path', d: starPath(P.x, P.y, r * 1.55 + 2), fill: INK.surface });
      children.push({ t: 'path', d: starPath(P.x, P.y, r * 1.55), fill: INK.primary });
    } else {
      children.push({ t: 'circle', cx: P.x, cy: P.y, r: r + 2, fill: INK.surface });
      children.push({ t: 'circle', cx: P.x, cy: P.y, r, fill: ident?.color ?? INK.muted });
    }
    if (stack.length > 1) {
      const bx = P.x + r * 1.15;
      const by = P.y - r * 1.15;
      const br = exporting ? 11 : 7.5;
      children.push({ t: 'circle', cx: bx, cy: by, r: br + 1.5, fill: INK.surface });
      children.push({ t: 'circle', cx: bx, cy: by, r: br, fill: INK.primary });
      children.push({ t: 'text', x: bx, y: by, text: String(stack.length), size: br * 1.25, fill: INK.surface, anchor: 'middle', baseline: 'middle', weight: 700 });
    }
    const selected = stack.includes(input.selectedId ?? '');
    if (selected) children.push({ t: 'circle', cx: P.x, cy: P.y, r: r + 6, fill: 'none', stroke: INK.primary, sw: 2 });
    const names = stack.map(name);
    const dist = analysis.matrices.distance[0][analysis.index[lead]];
    productPrims.push({
      t: 'g',
      children,
      hit:
        stack.length > 1
          ? { kind: 'stack', ids: stack, label: `${stack.length} products at the same position: ${names.join(', ')}` }
          : {
              kind: 'product',
              ids: stack,
              label: hasIdv ? `${idvName}, the IDV, at the centre` : `${names[0]}, modelled distance ${formatDistance(dist)} from ${idvName}`,
            },
      testId: hasIdv ? 'idv-marker' : stack.length > 1 ? 'stack-marker' : 'product-marker',
      selected,
    });
    obstacles.push({ x0: P.x - r - 2, y0: P.y - r - 2, x1: P.x + r + 2, y1: P.y + r + 2 });

    const shown = stack.length > 3 ? [...names.slice(0, 2), `+${stack.length - 2} more`] : names;
    const lines = shown.map((n, i) => (stack[i] === analysis.idvId ? `${n} (IDV)` : n));
    const keys = stack.filter((id) => id !== analysis.idvId).map((id) => identities[id]?.key ?? 0);
    const outward = Math.atan2(P.y - f.cy, P.x - f.cx);
    const fitted = lines.map((l) => fitText(l, f.font, exporting ? 360 : Math.max(90, w * 0.32)));
    fullyNamed.set(
      stack.join('|'),
      stack.length > 3 || fitted.some((l, i) => l !== lines[i]) ? [] : stack,
    );
    requests.push({
      key: stack.join('|'),
      x: P.x,
      y: P.y,
      r: r + (stack.length > 1 ? 6 : 1),
      lines: fitted,
      size: f.font,
      weight: hasIdv ? 650 : 500,
      short: hasIdv ? undefined : keys.join(','),
      prefer: hasIdv || Math.hypot(P.x - f.cx, P.y - f.cy) < 2 ? -Math.PI / 4 : outward,
    });
  }

  const labelBounds = exporting ? f.bounds : { x0: f.bounds.x0, y0: f.bounds.y0, x1: f.bounds.x1, y1: f.bounds.y1 };
  const placed = placeLabels([...requests, ...segRequests], obstacles, labelBounds);
  const labelPrims: Prim[] = [];
  const named = new Set<string>();
  for (const p of placed) {
    const isSeg = p.key.startsWith('seg:');
    if (isSeg && p.overlapping) continue; // never force segment labels into a dense map
    if (!isSeg && !p.keyed && !p.overlapping) for (const id of fullyNamed.get(p.key) ?? []) named.add(id);
    if (p.leader) labelPrims.push({ t: 'line', ...p.leader, stroke: INK.axis, sw: exporting ? 1.5 : 1 });
    const lineH = p.size * 1.2;
    p.lines.forEach((line, i) => {
      // A surface halo keeps labels legible over rings and markers.
      labelPrims.push({
        t: 'text',
        x: p.x,
        y: p.y + i * lineH,
        text: line,
        size: p.size,
        fill: isSeg ? INK.secondary : INK.primary,
        anchor: p.anchor,
        weight: p.weight,
        italic: isSeg,
      });
    });
  }

  prims.push(...segPrims, ...productPrims, ...labelPrims);

  const competitorsByDistance = analysis.rankings.byDistance;
  const errText = input.diagnostics ? formatPercent(input.diagnostics.relativeRMSError, 1) : 'pending';
  const anchorName = layout.anchorId ? name(layout.anchorId) : null;
  const scene: Scene = {
    width: w,
    height: h,
    title: `Competitive landscape for ${idvName}`,
    desc:
      `Radial map with ${idvName} (IDV) at the centre. Each competitor's distance from the centre is its exact modelled market distance; ` +
      `competitor-to-competitor spacing is fitted (map distance error ${errText}). ` +
      competitorsByDistance.map((id) => `${name(id)} ${formatDistance(analysis.matrices.distance[0][analysis.index[id]])}`).join('; ') +
      '.',
    prims,
  };

  if (!exporting) return scene;

  // ---- Export chrome: title, legend, keyed list, footnote (all inside the SVG).
  scene.background = '#ffffff';
  const chrome: Prim[] = [];
  chrome.push({ t: 'text', x: 40, y: 64, text: fitText(project.name || 'Untitled project', 40, w - 80, 700), size: 40, weight: 700, fill: INK.primary });
  const sub = `Competitive landscape · IDV: ${idvName} · TAM ${formatQuantity(analysis.tam)} ${analysis.unit} · ${project.referenceDate}`;
  chrome.push({ t: 'text', x: 40, y: 104, text: fitText(sub, 22, w - 80), size: 22, fill: INK.secondary });

  const panelX = narrowPanel ? w - 480 : w - 660;
  const panelW = w - 40 - panelX;
  let y = 170;
  const legendFont = 20;
  const legendItem = (marker: Prim[], text: string) => {
    chrome.push(...marker, { t: 'text', x: panelX + 34, y: y + 7, text: fitText(text, legendFont, panelW - 34), size: legendFont, fill: INK.secondary });
    y += 34;
  };
  chrome.push({ t: 'text', x: panelX, y, text: 'Legend', size: 22, weight: 650, fill: INK.primary });
  y += 36;
  legendItem([{ t: 'path', d: starPath(panelX + 12, y, 13), fill: INK.primary }], `IDV (${fitText(idvName, legendFont, 300)}) at the centre`);
  legendItem([{ t: 'circle', cx: panelX + 12, cy: y, r: 10, fill: INK.muted }], 'Competitor: distance from centre is exact');
  if (input.showSegments) {
    legendItem([{ t: 'path', d: diamondPath(panelX + 12, y, 10), fill: INK.surface, stroke: INK.secondary, sw: 2.5 }], 'Modelled segment center');
  }
  legendItem([{ t: 'circle', cx: panelX + 12, cy: y, r: 10, fill: 'none', stroke: INK.axis, sw: 2 }], 'Rings: modelled distance from IDV');

  // The clean variant drops the keyed list only when every product is named directly.
  const needList = !clean || analysis.productIds.some((id) => !named.has(id));
  if (needList && narrowPanel) return buildRadialScene({ ...input, cleanNeedsList: true });
  if (needList) {
    y += 14;
    chrome.push({ t: 'text', x: panelX, y, text: 'Products by distance from IDV', size: 22, weight: 650, fill: INK.primary });
    y += 34;
    const entries = [analysis.idvId, ...competitorsByDistance];
    const available = h - 110 - y;
    const twoCols = entries.length * 30 > available;
    const rowH = Math.max(18, Math.min(30, (twoCols ? Math.ceil(entries.length / 2) : entries.length) > 0 ? available / (twoCols ? Math.ceil(entries.length / 2) : entries.length) : 30));
    const size = Math.min(20, rowH * 0.72);
    const colW = twoCols ? (w - 40 - panelX) / 2 : w - 40 - panelX;
    const perCol = twoCols ? Math.ceil(entries.length / 2) : entries.length;
    entries.forEach((id, i) => {
      const col = Math.floor(i / perCol);
      const rx = panelX + col * colW;
      const ry = y + (i % perCol) * rowH;
      const ident = identities[id];
      const isIdv = id === analysis.idvId;
      if (isIdv) chrome.push({ t: 'path', d: starPath(rx + 10, ry, size * 0.55), fill: INK.primary });
      else chrome.push({ t: 'circle', cx: rx + 10, cy: ry, r: size * 0.4, fill: ident?.color ?? INK.muted });
      const keyText = isIdv ? '' : `${ident?.key ?? ''}  `;
      const value = isIdv ? 'IDV' : formatDistance(analysis.matrices.distance[0][analysis.index[id]]);
      chrome.push({ t: 'text', x: rx + 26, y: ry, text: fitText(`${keyText}${name(id)}`, size, colW - 110), size, fill: INK.primary, baseline: 'middle' });
      chrome.push({ t: 'text', x: rx + colW - 16, y: ry, text: value, size, fill: INK.secondary, anchor: 'end', baseline: 'middle', tabular: true });
    });
  }

  const date = (input.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const note = clean
    ? `Modelled market distance from SAM and segment splits (nested-overlap assumption); not customer share. Map distance error ${errText}. ${date}.`
    : `Modelled market distance from SAM and segment splits under a nested-overlap assumption — not customer share or preference. ` +
      `Distance from the centre is exact; competitor-to-competitor spacing is fitted in 2-D (map distance error ${errText}, relative RMS). ` +
      `Rotation is arbitrary${anchorName ? ` (${anchorName} sets the reference direction)` : ''}. Generated ${date} · Market Landscape · model ${MODEL_VERSION}.`;
  const noteLines = wrapText(note, 16, w - 80);
  noteLines.slice(0, 3).forEach((line, i) => {
    chrome.push({ t: 'text', x: 40, y: h - 70 + i * 22, text: line, size: 16, fill: INK.secondary });
  });
  chrome.push({ t: 'line', x1: 40, y1: h - 94, x2: w - 40, y2: h - 94, stroke: INK.grid, sw: 1.5 });
  scene.prims = [...chrome, ...prims];
  return scene;
}
