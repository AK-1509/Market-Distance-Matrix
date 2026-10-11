/**
 * Exact distance bars: one bar per competitor showing native d_0i on a fixed 0–1 scale
 * (never rescaled per project), sorted ascending. No dimensionality reduction involved.
 */
import { formatCompact, formatDistance, formatShare } from '../domain/format';
import { MODEL_SETTINGS } from '../domain/settings';
import type { ChartModel } from './chartModel';
import { fitText, textWidth } from './labels';
import type { Scene, SceneNode, Target } from './scene';

export interface DistanceOptions {
  width: number;
  mode: 'screen' | 'export';
  selected?: Target | null;
}

const TICKS = [0, 0.25, 0.5, 0.75, 1];

export function roundedBarPath(x0: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w, h / 2);
  const x1 = x0 + w;
  return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
}

export function buildDistanceScene(model: ChartModel, opts: DistanceOptions): Scene {
  const exp = opts.mode === 'export';
  const competitors = model.products.filter((p) => !p.isIdv);
  const n = competitors.length;
  const W = opts.width;
  const narrow = !exp && W < 520;
  const nodes: SceneNode[] = [];

  const axisH = exp ? 86 : 46;
  const rowH = exp ? Math.max(28, Math.min(100, (1080 - 200 - axisH - 70) / Math.max(1, n))) : narrow ? 44 : 46;
  // Exports center a short chart vertically between the title block and the footnote.
  const top = exp ? 200 + Math.max(0, (1080 - 200 - 70 - axisH - n * rowH) / 2) : 6;
  const nameFs = exp ? Math.max(14, Math.min(24, rowH * 0.34)) : narrow ? 12.5 : 13.5;
  const subFs = exp ? Math.max(12, nameFs - 5) : 11.5;
  const showSub = exp ? rowH >= 44 : true;
  const valueFs = exp ? nameFs - 1 : 12.5;
  const H = exp ? Math.max(1080, top + n * rowH + axisH + 70) : top + n * rowH + axisH;

  const subText = (c: (typeof competitors)[number]) =>
    narrow ? `${formatShare(c.idvExposure)} of IDV` : `shares ${formatCompact(c.sharedMarket)} · ${formatShare(c.idvExposure)} of IDV`;
  const longest = Math.max(60, ...competitors.map((c) => Math.max(textWidth(c.name, nameFs, 500), showSub ? textWidth(subText(c), subFs) : 0)));
  const leftPad = exp ? 64 : 0;
  const labelW = Math.min(longest + (exp ? 28 : 16), W * (narrow ? 0.4 : 0.36));
  const x0 = leftPad + labelW;
  const valueRoom = textWidth('0.000', valueFs) + (exp ? 24 : 14);
  const x1 = W - (exp ? 64 : 4) - valueRoom;
  const s = x1 - x0;
  const plotBottom = top + n * rowH;

  // Grid and axis on the fixed 0–1 scale.
  for (const t of TICKS) {
    const x = x0 + t * s;
    nodes.push({ kind: 'line', x1: x, y1: top, x2: x, y2: plotBottom, stroke: t === 0 ? 'axis' : 'grid', strokeWidth: 1 });
    nodes.push({ kind: 'text', x, y: plotBottom + (exp ? 30 : 16), text: t === 0 ? '0' : t.toFixed(2), size: exp ? 18 : 11, fill: 'muted', anchor: t === 0 ? 'start' : t === 1 ? 'end' : 'middle', tabular: true });
  }
  nodes.push({ kind: 'text', x: x0, y: plotBottom + (exp ? 58 : 33), text: '← Near IDV', size: exp ? 18 : 11.5, weight: 600, fill: 'ink2' });
  nodes.push({ kind: 'text', x: x1, y: plotBottom + (exp ? 58 : 33), text: 'Farther →', size: exp ? 18 : 11.5, weight: 600, fill: 'ink2', anchor: 'end' });

  competitors.forEach((c, i) => {
    const rowTop = top + i * rowH;
    const selected = opts.selected?.type === 'product' ? opts.selected.id === c.id : opts.selected?.type === 'stack' ? opts.selected.ids.includes(c.id) : false;
    const barH = exp ? Math.min(24, Math.max(10, rowH * 0.3)) : 14;
    const barY = rowTop + (showSub ? rowH * 0.2 : (rowH - barH) / 2);
    const nameY = showSub ? barY + barH * 0.5 + nameFs * 0.36 : barY + barH * 0.5 + nameFs * 0.36;
    const w = c.distance * s;
    const children: SceneNode[] = [
      { kind: 'rect', x: leftPad, y: rowTop, w: x1 + valueRoom - leftPad, h: rowH, fill: 'none', className: 'viz-hit', screenOnly: true },
      { kind: 'rect', x: leftPad, y: rowTop + 1, w: x1 + valueRoom - leftPad, h: rowH - 2, rx: 4, fill: 'none', stroke: 'accent', strokeWidth: 2, className: 'viz-focus', screenOnly: true },
    ];
    if (selected) children.push({ kind: 'rect', x: leftPad, y: rowTop + 1, w: x1 + valueRoom - leftPad, h: rowH - 2, rx: 4, fill: 'highlight', opacity: 0.1, screenOnly: true });
    children.push({ kind: 'text', x: x0 - (exp ? 18 : 10), y: nameY, text: fitText(c.name, nameFs, labelW - (exp ? 18 : 10), 500), size: nameFs, weight: 500, fill: 'ink', anchor: 'end' });
    if (showSub) {
      const sub = subText(c);
      children.push({ kind: 'text', x: x0 - (exp ? 18 : 10), y: nameY + subFs * 1.35, text: fitText(sub, subFs, labelW - (exp ? 18 : 10)), size: subFs, fill: 'muted', anchor: 'end' });
    }
    if (c.distance <= MODEL_SETTINGS.zeroRadius) {
      children.push({ kind: 'rect', x: x0 - 1, y: barY - 2, w: 3, h: barH + 4, fill: c.color });
      children.push({ kind: 'text', x: x0 + 8, y: barY + barH * 0.5 + valueFs * 0.36, text: '0.000 · same footprint as IDV', size: valueFs, fill: 'ink2', tabular: true });
    } else {
      children.push({ kind: 'path', d: roundedBarPath(x0, barY, Math.max(w, 1), barH), fill: c.color });
      children.push({ kind: 'text', x: x0 + w + (exp ? 12 : 6), y: barY + barH * 0.5 + valueFs * 0.36, text: formatDistance(c.distance), size: valueFs, weight: 500, fill: 'ink2', tabular: true });
    }
    nodes.push({
      kind: 'group',
      children,
      target: { type: 'product', id: c.id },
      label: `${c.name}: modeled distance ${formatDistance(c.distance)} from the IDV, shared market ${formatCompact(c.sharedMarket)} ${model.unit}`,
      tooltip: [
        c.name,
        `Modeled distance ${formatDistance(c.distance)}`,
        `Shared market ${Math.round(c.sharedMarket).toLocaleString('en-US')} ${model.unit}`,
        `${formatShare(c.idvExposure)} of the IDV's SAM · ${formatShare(c.competitorExposure)} of its own`,
        `Price: ${c.priceText}`,
      ],
    });
  });

  if (exp) {
    nodes.push({ kind: 'text', x: 64, y: 92, text: fitText(`Distance from ${model.idvName} (IDV)`, 40, 1780, 650), size: 40, weight: 650, fill: 'ink' });
    nodes.push({ kind: 'text', x: 64, y: 134, text: fitText(`${model.isExample ? 'Fictional example, illustrative numbers · ' : ''}${model.projectName} · ${model.dateLabel}`, 22, 1780), size: 22, fill: 'ink2' });
    nodes.push({ kind: 'line', x1: 64, y1: H - 56, x2: W - 64, y2: H - 56, stroke: 'grid', strokeWidth: 1 });
    nodes.push({
      kind: 'text',
      x: 64,
      y: H - 26,
      text: fitText(
        'Modeled market distance from SAM and segment splits (0 = identical modeled footprint, 1 = no shared segments) on a fixed 0–1 scale. Not a percentage of customers.',
        15,
        W - 330,
      ),
      size: 15,
      fill: 'muted',
    });
    nodes.push({ kind: 'text', x: W - 64, y: H - 26, text: 'Market Landscape', size: 15, fill: 'muted', anchor: 'end' });
  }

  return {
    width: W,
    height: H,
    background: 'surface',
    title: `Distance from ${model.idvName} (IDV) — ${model.projectName}`,
    description: `Modeled market distance from the IDV, fixed 0 to 1 scale, sorted nearest first: ${competitors.map((c) => `${c.name} ${formatDistance(c.distance)}`).join(', ')}.`,
    nodes,
  };
}
