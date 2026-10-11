/**
 * Radial landscape scene. IDV at the origin; competitors at (d_0i cos φ_i, d_0i sin φ_i).
 * One identical scale in x and y, circular distance rings, uniform marker areas, and
 * coincident products drawn as a selectable stack at their true position.
 * Viewing options (fit-to-products) change only the pixel scale, never the data.
 */
import { formatDistance, formatShare } from '../domain/format';
import { MODEL_SETTINGS } from '../domain/settings';
import type { ChartModel, ChartProduct } from './chartModel';
import { fitText, placeLabels, textWidth, wrapText, type Box, type LabelRequest } from './labels';
import type { GroupNode, Scene, SceneNode, Target, TextNode } from './scene';

export interface RadialOptions {
  width: number;
  height: number;
  mode: 'screen' | 'export';
  variant?: 'detailed' | 'clean';
  showSegments: boolean;
  view: 'full' | 'fit';
  selected?: Target | null;
}

interface Stack {
  key: string;
  products: ChartProduct[];
  hasIdv: boolean;
  x: number;
  y: number;
  distance: number;
}

export function viewMaximum(model: ChartModel, view: RadialOptions['view']): { max: number; step: number } {
  if (view === 'full') return { max: 1, step: 0.25 };
  const m = Math.max(0, ...model.products.map((p) => p.distance));
  if (m <= MODEL_SETTINGS.zeroRadius) return { max: 1, step: 0.25 };
  const step = m <= 0.2 ? 0.05 : m <= 0.5 ? 0.1 : 0.25;
  const max = Math.min(1, Math.ceil(m / step - 1e-9) * step);
  return { max: Math.max(max, step), step };
}

function stacksOf(model: ChartModel): Stack[] {
  const tol = MODEL_SETTINGS.coincidenceTolerance;
  const stacks: Stack[] = [];
  for (const p of model.products) {
    const s = stacks.find((st) => Math.hypot(st.x - p.position.x, st.y - p.position.y) <= tol);
    if (s) {
      s.products.push(p);
      if (p.isIdv) s.hasIdv = true;
    } else {
      stacks.push({ key: p.id, products: [p], hasIdv: p.isIdv, x: p.position.x, y: p.position.y, distance: p.distance });
    }
  }
  return stacks;
}

function targetOf(stack: Stack): Target {
  return stack.products.length === 1 ? { type: 'product', id: stack.products[0].id } : { type: 'stack', ids: stack.products.map((p) => p.id) };
}

function isSelected(stack: Stack, selected: Target | null | undefined): boolean {
  if (!selected) return false;
  if (selected.type === 'product') return stack.products.some((p) => p.id === selected.id);
  if (selected.type === 'stack') return selected.ids.some((id) => stack.products.some((p) => p.id === id));
  return false;
}

export function buildRadialScene(model: ChartModel, opts: RadialOptions): Scene {
  const exp = opts.mode === 'export';
  const narrow = !exp && opts.width < 520;
  const W = opts.width;
  const H = opts.height;
  const fs = exp ? 21 : narrow ? 12 : 13;
  const ringFs = exp ? 16 : 11;
  const markerR = exp ? 10 : 6.5;
  const nodes: SceneNode[] = [];

  // Plot geometry.
  let cx: number, cy: number, R: number, bounds: Box;
  if (exp) {
    cx = 600;
    cy = 610;
    R = 350;
    bounds = { x0: 64, y0: 176, x1: 1110, y1: 1000 };
  } else {
    const margin = narrow ? 34 : 70;
    cx = W / 2;
    cy = H / 2;
    R = Math.max(40, Math.min(W, H) / 2 - margin);
    bounds = { x0: 4, y0: 4, x1: W - 4, y1: H - 4 };
  }
  const { max: viewMax, step } = viewMaximum(model, opts.view);
  const scale = R / viewMax;
  const toPx = (x: number, y: number) => ({ px: cx + x * scale, py: cy - y * scale });

  const stacks = stacksOf(model);

  // Distance rings with numeric labels (same scale in x and y; no feature axes). Ring labels go
  // in the direction with the most angular clearance from plotted products (top preferred).
  const markerAngles = stacks
    .filter((s) => s.distance > MODEL_SETTINGS.zeroRadius)
    .map((s) => Math.atan2(-(s.y * scale), s.x * scale));
  let labelAngle = -Math.PI / 2;
  let bestClearance = -1;
  for (let k = 0; k < 24; k++) {
    const cand = -Math.PI / 2 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);
    const clearance = markerAngles.length
      ? Math.min(...markerAngles.map((a) => Math.abs(Math.atan2(Math.sin(a - cand), Math.cos(a - cand)))))
      : Math.PI;
    if (clearance > bestClearance + 1e-9 && (bestClearance < 0.45 || k === 0)) {
      bestClearance = clearance;
      labelAngle = cand;
    }
  }
  const obstacles: Box[] = [];
  const ringCount = Math.round(viewMax / step);
  for (let k = 1; k <= ringCount; k++) {
    const v = k * step;
    const r = v * scale;
    nodes.push({ kind: 'circle', cx, cy, r, fill: 'none', stroke: k === ringCount ? 'axis' : 'grid', strokeWidth: 1 });
    const label = v.toFixed(2);
    const lw = textWidth(label, ringFs);
    const lx = cx + r * Math.cos(labelAngle) + 4;
    const ly = cy + r * Math.sin(labelAngle) - 4;
    nodes.push({ kind: 'text', x: lx, y: ly, text: label, size: ringFs, fill: 'muted', tabular: true });
    obstacles.push({ x0: lx - 2, y0: ly - ringFs, x1: lx + lw + 2, y1: ly + 3 });
  }

  for (const s of stacks) {
    const { px, py } = toPx(s.x, s.y);
    obstacles.push({ x0: px - markerR - 3, y0: py - markerR - 3, x1: px + markerR + 3, y1: py + markerR + 3 });
  }

  // Segment centers (optional overlay).
  const segNodes: SceneNode[] = [];
  const segLabelReqs: LabelRequest[] = [];
  const labelAllSegments = model.centroids.length <= (exp ? 8 : 6);
  if (opts.showSegments) {
    const h = exp ? 10 : 6.5;
    for (const c of model.centroids) {
      const { px, py } = toPx(c.point.x, c.point.y);
      const selected = opts.selected?.type === 'segment' && opts.selected.id === c.id;
      const children: SceneNode[] = [
        { kind: 'circle', cx: px, cy: py, r: h + 6, fill: 'none', className: 'viz-hit', screenOnly: true },
        { kind: 'circle', cx: px, cy: py, r: h + 5, fill: 'none', stroke: 'accent', strokeWidth: 2, className: 'viz-focus', screenOnly: true },
        { kind: 'path', d: `M${px},${py - h}L${px + h},${py}L${px},${py + h}L${px - h},${py}Z`, fill: 'surface', stroke: 'segment', strokeWidth: exp ? 2.5 : 1.75 },
      ];
      if (selected) children.unshift({ kind: 'circle', cx: px, cy: py, r: h + 5, fill: 'none', stroke: 'accent', strokeWidth: 2.5, screenOnly: true });
      segNodes.push({
        kind: 'group',
        children,
        target: { type: 'segment', id: c.id },
        label: `Modeled segment center: ${c.name}`,
        tooltip: [c.name, 'Modeled segment center', 'Coverage-weighted average of product positions'],
      });
      obstacles.push({ x0: px - h - 2, y0: py - h - 2, x1: px + h + 2, y1: py + h + 2 });
      if (labelAllSegments || selected || exp) {
        const text = labelAllSegments || !exp ? c.name : `S${c.index}`;
        segLabelReqs.push({ key: `seg:${c.id}`, px, py, markerRadius: h, lines: [text], size: fs - (exp ? 3 : 1), weight: 400, preferred: Math.PI / 2 });
      }
    }
  }

  // Product labels: IDV first, then nearest competitors first.
  const productLabelReqs: LabelRequest[] = stacks
    .slice()
    .sort((a, b) => Number(b.hasIdv) - Number(a.hasIdv) || a.distance - b.distance)
    .map((s) => {
      const { px, py } = toPx(s.x, s.y);
      const others = s.products.filter((p) => !p.isIdv).map((p) => p.name);
      const wrapW = exp ? 300 : narrow ? 140 : 200;
      let lines: string[];
      if (s.hasIdv) {
        lines = [fitText(`${model.idvName} (IDV)`, fs, wrapW + 80, 650)];
        if (others.length) lines.push(...wrapText(`Same footprint: ${others.join(', ')}`, fs - 1, wrapW));
      } else if (s.products.length === 1) {
        lines = [fitText(s.products[0].name, fs, wrapW + 60, 500)];
      } else {
        lines = wrapText(s.products.map((p) => p.name).join(' · '), fs, wrapW, 500);
      }
      const preferred = s.hasIdv ? Math.PI / 2 : Math.atan2(py - cy, px - cx);
      return { key: s.key, px, py, markerRadius: s.hasIdv ? markerR + 4 : markerR, lines, size: fs, weight: s.hasIdv ? 650 : 500, preferred };
    });

  const placed = placeLabels([...productLabelReqs, ...segLabelReqs], obstacles, bounds);
  const placedByKey = new Map(placed.map((p) => [p.key, p]));

  const labelNodes = (key: string, fill: 'ink' | 'ink2' | 'muted' = 'ink'): SceneNode[] => {
    const pl = placedByKey.get(key);
    if (!pl) return [];
    const out: SceneNode[] = [
      // Whole label box is clickable on screen, not just the glyphs.
      { kind: 'rect', x: pl.box.x0, y: pl.box.y0, w: pl.box.x1 - pl.box.x0, h: pl.box.y1 - pl.box.y0, fill: 'none', className: 'viz-hit', screenOnly: true },
    ];
    if (pl.leader) out.push({ kind: 'line', ...pl.leader, stroke: 'axis', strokeWidth: 1 });
    pl.lines.forEach((line, i) => {
      const t: TextNode = {
        kind: 'text',
        x: pl.x,
        y: pl.y + i * pl.size * 1.22,
        text: line,
        size: i === 0 ? pl.size : pl.size - 1,
        weight: i === 0 ? pl.weight : 400,
        fill: i === 0 ? fill : 'ink2',
        anchor: pl.anchor,
      };
      out.push(t);
    });
    return out;
  };

  // Segment labels render beneath product marks.
  for (const g of segNodes) {
    const target = (g as GroupNode).target as Target;
    (g as GroupNode).children.push(...labelNodes(`seg:${(target as { id: string }).id}`, 'muted'));
  }
  nodes.push(...segNodes);

  // Product markers.
  for (const s of stacks) {
    const { px, py } = toPx(s.x, s.y);
    const selected = isSelected(s, opts.selected);
    const children: SceneNode[] = [
      { kind: 'circle', cx: px, cy: py, r: markerR + 8, fill: 'none', className: 'viz-hit', screenOnly: true },
      { kind: 'circle', cx: px, cy: py, r: markerR + (s.hasIdv ? 9 : 5), fill: 'none', stroke: 'accent', strokeWidth: 2, className: 'viz-focus', screenOnly: true },
    ];
    if (selected) children.push({ kind: 'circle', cx: px, cy: py, r: markerR + (s.hasIdv ? 9 : 5), fill: 'none', stroke: 'accent', strokeWidth: 2.5, screenOnly: true });
    if (s.hasIdv) {
      children.push({ kind: 'circle', cx: px, cy: py, r: markerR + 4, fill: 'surface', stroke: 'idv', strokeWidth: exp ? 2.5 : 1.75 });
      children.push({ kind: 'circle', cx: px, cy: py, r: markerR, fill: 'idv', stroke: 'surface', strokeWidth: 2 });
      if (s.products.length > 1) {
        children.push({ kind: 'text', x: px + markerR + 6, y: py - markerR - 2, text: `+${s.products.length - 1}`, size: fs - 2, weight: 700, fill: 'ink' });
      }
    } else if (s.products.length === 1) {
      children.push({ kind: 'circle', cx: px, cy: py, r: markerR, fill: s.products[0].color, stroke: 'surface', strokeWidth: 2 });
    } else {
      children.push({ kind: 'circle', cx: px, cy: py, r: markerR + 1, fill: 'ink2', stroke: 'surface', strokeWidth: 2 });
      children.push({ kind: 'text', x: px, y: py + (fs - 3) * 0.36, text: String(s.products.length), size: fs - 3, weight: 700, fill: 'surface', anchor: 'middle' });
    }
    children.push(...labelNodes(s.key));
    const names = s.products.map((p) => (p.isIdv ? `${p.name} (IDV)` : p.name));
    const lead = s.products.find((p) => !p.isIdv);
    const tooltip = s.products.length === 1 && lead
      ? [lead.name, `Distance ${formatDistance(lead.distance)}`, `Shares ${formatShare(lead.idvExposure)} of the IDV's SAM`, `Price: ${lead.priceText}`]
      : s.hasIdv && s.products.length === 1
        ? [`${model.idvName} (IDV)`, 'Center of the map']
        : [`${s.products.length} products at the same modeled position`, ...names];
    nodes.push({
      kind: 'group',
      children,
      target: targetOf(s),
      label:
        s.products.length === 1
          ? s.hasIdv
            ? `${model.idvName}, the IDV, at the center`
            : `${lead!.name}, distance ${formatDistance(lead!.distance)} from the IDV`
          : `Stack of ${s.products.length} products at the same position: ${names.join(', ')}`,
      tooltip,
    });
  }

  if (exp) nodes.push(...exportChrome(model, opts));

  const description = `Radial landscape with ${model.idvName} (IDV) at the center. ${model.products
    .filter((p) => !p.isIdv)
    .map((p) => `${p.name} at modeled distance ${formatDistance(p.distance)}`)
    .join('; ')}.`;
  return { width: W, height: H, background: 'surface', title: `Market landscape — ${model.projectName}`, description, nodes };
}

/** Title, legend, keyed product list, map-error note, and footnote for exports. */
function exportChrome(model: ChartModel, opts: RadialOptions): SceneNode[] {
  const out: SceneNode[] = [];
  const detailed = (opts.variant ?? 'detailed') === 'detailed';
  out.push({ kind: 'text', x: 64, y: 92, text: fitText(`Market landscape: ${model.projectName}`, 40, 1780, 650), size: 40, weight: 650, fill: 'ink' });
  out.push({
    kind: 'text',
    x: 64,
    y: 134,
    text: fitText(
      `${model.isExample ? 'Fictional example, illustrative numbers · ' : ''}${model.idvName} (IDV) at the center · distance from the center = modeled market distance · ${model.dateLabel}`,
      22,
      1780,
    ),
    size: 22,
    fill: 'ink2',
  });

  // Legend.
  const lx = 1170;
  let y = 214;
  out.push({ kind: 'text', x: lx, y, text: 'Legend', size: 22, weight: 650, fill: 'ink' });
  y += 40;
  const item = (draw: SceneNode[], text: string) => {
    out.push(...draw, { kind: 'text', x: lx + 40, y: y + 7, text, size: 19, fill: 'ink2' });
    y += 36;
  };
  item(
    [
      { kind: 'circle', cx: lx + 14, cy: y, r: 13, fill: 'surface', stroke: 'idv', strokeWidth: 2.5 },
      { kind: 'circle', cx: lx + 14, cy: y, r: 9, fill: 'idv' },
    ],
    'IDV — the main product being evaluated',
  );
  item([{ kind: 'circle', cx: lx + 14, cy: y, r: 10, fill: 'series-1' }], 'Competitor (uniform marker size)');
  item(
    [
      { kind: 'circle', cx: lx + 14, cy: y, r: 11, fill: 'ink2' },
      { kind: 'text', x: lx + 14, y: y + 6, text: '2', size: 16, weight: 700, fill: 'surface', anchor: 'middle' },
    ],
    'Products at the same modeled position',
  );
  if (opts.showSegments) {
    item([{ kind: 'path', d: `M${lx + 14},${y - 10}L${lx + 24},${y}L${lx + 14},${y + 10}L${lx + 4},${y}Z`, fill: 'surface', stroke: 'segment', strokeWidth: 2.5 }], 'Modeled segment center (input footprint)');
  }
  item([{ kind: 'circle', cx: lx + 14, cy: y, r: 12, fill: 'none', stroke: 'axis', strokeWidth: 1.5 }], 'Ring = modeled distance (0 same, 1 no shared segments)');

  // Keyed product list (guarantees every product name appears).
  y += 14;
  const competitors = model.products.filter((p) => !p.isIdv);
  out.push({ kind: 'text', x: lx, y, text: detailed ? 'Competitors by distance from IDV' : 'Competitors', size: 22, weight: 650, fill: 'ink' });
  y += 34;
  const rows = competitors;
  const available = (detailed ? 860 : 900) - y;
  const cols = rows.length * 30 <= available ? 1 : rows.length * 24 <= available * 2 ? 2 : 3;
  const rowH = cols === 1 ? Math.min(30, available / Math.max(1, rows.length)) : Math.max(15, Math.min(24, (available * 1) / Math.ceil(rows.length / cols)));
  const colW = 680 / cols;
  const keyFs = cols === 1 ? 18 : cols === 2 ? 15 : 12;
  rows.forEach((p, i) => {
    const col = Math.floor(i / Math.ceil(rows.length / cols));
    const row = i % Math.ceil(rows.length / cols);
    const x = lx + col * colW;
    const yy = y + row * rowH;
    out.push({ kind: 'circle', cx: x + 7, cy: yy - keyFs * 0.34, r: Math.max(4, keyFs * 0.33), fill: p.color });
    const valueText = detailed ? `  ${formatDistance(p.distance)}` : '';
    const nameW = colW - 22 - textWidth(valueText, keyFs);
    out.push({ kind: 'text', x: x + 20, y: yy, text: fitText(p.name, keyFs, nameW), size: keyFs, fill: 'ink' });
    if (detailed) out.push({ kind: 'text', x: x + colW - 12, y: yy, text: formatDistance(p.distance), size: keyFs, fill: 'ink2', anchor: 'end', tabular: true });
  });
  y += Math.ceil(rows.length / cols) * rowH + 8;

  if (opts.showSegments && model.centroids.length > 8) {
    const keyText = model.centroids.map((c) => `S${c.index} ${c.name}`).join(' · ');
    for (const line of wrapText(`Segment centers: ${keyText}`, 14, 680).slice(0, 4)) {
      out.push({ kind: 'text', x: lx, y, text: line, size: 14, fill: 'ink2' });
      y += 19;
    }
  }

  if (detailed) {
    const d = model.diagnostics;
    const worst = d.worstPair;
    const name = (id: string) => model.products.find((p) => p.id === id)?.name ?? id;
    const lines = wrapText(
      `Map distance error ${formatShare(d.relativeRMSError)} (relative RMS over all plotted pairs). IDV distances are exact; competitor-to-competitor distances are approximated.` +
        (worst ? ` Largest gap: ${name(worst.a)} ↔ ${name(worst.b)}, shown ${formatDistance(worst.displayed)} vs modeled ${formatDistance(worst.native)}.` : ''),
      16,
      680,
    );
    let ey = Math.max(y + 8, 1000 - lines.length * 21);
    for (const line of lines) {
      out.push({ kind: 'text', x: lx, y: ey, text: line, size: 16, fill: 'ink2' });
      ey += 21;
    }
  }

  out.push({ kind: 'line', x1: 64, y1: 1024, x2: 1856, y2: 1024, stroke: 'grid', strokeWidth: 1 });
  out.push({
    kind: 'text',
    x: 64,
    y: 1054,
    text: fitText(
      `Modeled from entered SAM and segment splits, assuming nested (maximum) overlap within shared segments — not observed customers or market share. TAM ${Math.round(model.tam).toLocaleString('en-US')} ${model.unit}. ${model.dateLabel}.`,
      15,
      1600,
    ),
    size: 15,
    fill: 'muted',
  });
  out.push({ kind: 'text', x: 1856, y: 1054, text: 'Market Landscape', size: 15, fill: 'muted', anchor: 'end' });
  return out;
}
