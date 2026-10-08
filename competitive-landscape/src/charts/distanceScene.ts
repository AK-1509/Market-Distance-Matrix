// Exact distance bars: one bar per competitor showing d_0i directly on a
// fixed 0–1 scale (never rescaled per project), sorted ascending.

import type { Analysis } from '../domain/analysis';
import { MODEL_VERSION } from '../domain/constants';
import { formatDistance, formatQuantity } from '../domain/format';
import type { Project } from '../domain/types';
import { INK, type ProductIdentity } from './palette';
import type { ChartVariant } from './radialScene';
import { barPath, fitText, textWidth, type Prim, type Scene } from './scene';
import { wrapText } from './text';

export interface DistanceSceneInput {
  analysis: Analysis;
  project: Project;
  identities: Record<string, ProductIdentity>;
  width: number;
  variant: ChartVariant;
  selectedId?: string | null;
  /** Export preset height; rows adapt to fit and the height grows only if they cannot. */
  height?: number;
  /** Export at content height instead of a preset (used inside the report). */
  compact?: boolean;
  generatedAt?: string;
}

export const DISTANCE_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

export function buildDistanceScene(input: DistanceSceneInput): Scene {
  const { analysis, project, identities, width: w, variant } = input;
  const exporting = variant !== 'screen';
  const name = (id: string) => analysis.names[id] || 'Untitled product';
  const idvName = name(analysis.idvId);
  const rows = analysis.rankings.byDistance;
  const n = Math.max(rows.length, 1);

  const font = exporting ? 21 : w < 480 ? 12 : 13;
  const headerH = exporting ? 170 : 8;
  const footerH = exporting ? 110 : 0;
  const axisH = exporting ? 74 : 46;
  let rowH = exporting ? 56 : 32;
  let h: number;
  let top = headerH;
  if (exporting && !input.compact) {
    const target = input.height ?? 1080;
    const room = target - headerH - footerH - axisH;
    rowH = Math.max(28, Math.min(96, room / n));
    h = Math.max(target, headerH + footerH + axisH + rowH * n);
    // Few rows: centre the block in the preset rather than leaving a gap below.
    top = headerH + Math.max(0, (room - rowH * n) / 2);
  } else {
    h = headerH + axisH + rowH * n + (exporting ? footerH : 0);
  }
  const barH = Math.min(24, Math.max(8, rowH * 0.5));
  const labelSize = exporting ? Math.min(font + 3, Math.max(14, rowH * 0.42)) : font;

  const maxLabel = Math.max(60, ...rows.map((id) => textWidth(name(id), labelSize, 500)));
  const labelW = Math.min(maxLabel + 20, w * (exporting ? 0.3 : 0.36));
  const x0 = (exporting ? 40 : 4) + labelW;
  const valuePad = textWidth('0.000', labelSize) + 16;
  const x1 = w - (exporting ? 40 : 6) - valuePad;
  const scale = (d: number) => x0 + d * (x1 - x0);

  const prims: Prim[] = [];
  // Hairline grid at fixed ticks.
  for (const t of DISTANCE_TICKS) {
    prims.push({ t: 'line', x1: scale(t), y1: top, x2: scale(t), y2: top + rowH * n, stroke: t === 0 ? INK.axis : INK.grid, sw: exporting ? 1.5 : 1 });
  }

  rows.forEach((id, i) => {
    const d = analysis.matrices.distance[0][analysis.index[id]];
    const cy = top + i * rowH + rowH / 2;
    const ident = identities[id];
    const selected = input.selectedId === id;
    const children: Prim[] = [{ t: 'rect', x: 0, y: cy - rowH / 2, w, h: rowH, fill: selected ? '#f0efec' : 'transparent' }];
    children.push({
      t: 'text',
      x: x0 - 12,
      y: cy,
      text: fitText(name(id), labelSize, labelW - 16, 500),
      size: labelSize,
      fill: INK.primary,
      anchor: 'end',
      baseline: 'middle',
      weight: 500,
    });
    const bw = scale(d) - x0;
    if (bw > 0.5) {
      children.push({ t: 'path', d: barPath(x0, cy - barH / 2, bw, barH), fill: ident?.color ?? INK.muted });
    } else {
      children.push({ t: 'rect', x: x0 - 1, y: cy - barH / 2, w: 3, h: barH, fill: ident?.color ?? INK.muted });
    }
    const valueText = d === 0 ? '0.000 · same footprint as IDV' : formatDistance(d);
    const fitsRight = scale(d) + 8 + textWidth(valueText, labelSize) <= w - 4;
    children.push({
      t: 'text',
      x: fitsRight ? scale(d) + 8 : scale(d) - 8,
      y: cy,
      text: valueText,
      size: labelSize,
      fill: fitsRight ? INK.secondary : '#ffffff',
      anchor: fitsRight ? 'start' : 'end',
      baseline: 'middle',
      tabular: true,
    });
    prims.push({
      t: 'g',
      children,
      hit: { kind: 'bar', ids: [id], label: `${name(id)}: modelled distance ${formatDistance(d)} from ${idvName}` },
      testId: 'distance-bar',
      selected,
    });
  });

  // Axis: fixed 0–1 scale with "Near IDV" and "Farther" captions.
  const axisY = top + rowH * n;
  prims.push({ t: 'line', x1: x0, y1: axisY, x2: x1, y2: axisY, stroke: INK.axis, sw: exporting ? 1.5 : 1 });
  const tickSize = exporting ? 18 : 11;
  for (const t of DISTANCE_TICKS) {
    prims.push({ t: 'text', x: scale(t), y: axisY + tickSize + 6, text: t.toFixed(2), size: tickSize, fill: INK.muted, anchor: 'middle', tabular: true });
  }
  prims.push({ t: 'text', x: x0, y: axisY + tickSize * 2 + 14, text: 'Near IDV', size: tickSize, fill: INK.secondary, anchor: 'start', weight: 600 });
  prims.push({ t: 'text', x: x1, y: axisY + tickSize * 2 + 14, text: 'Farther', size: tickSize, fill: INK.secondary, anchor: 'end', weight: 600 });

  const scene: Scene = {
    width: w,
    height: h,
    title: `Modelled market distance from ${idvName}`,
    desc:
      `Horizontal bars on a fixed 0 to 1 scale. 0 means an identical modelled footprint to ${idvName}; 1 means no shared segments. ` +
      `Not a percentage of customers. ` +
      rows.map((id) => `${name(id)} ${formatDistance(analysis.matrices.distance[0][analysis.index[id]])}`).join('; ') +
      '.',
    prims,
  };
  if (!exporting) return scene;

  scene.background = '#ffffff';
  const chrome: Prim[] = [
    { t: 'text', x: 40, y: 64, text: fitText(`Modelled market distance from ${idvName} (IDV)`, 40, w - 80, 700), size: 40, weight: 700, fill: INK.primary },
    {
      t: 'text',
      x: 40,
      y: 104,
      text: fitText(`${project.name} · TAM ${formatQuantity(analysis.tam)} ${analysis.unit} · ${project.referenceDate}`, 22, w - 80),
      size: 22,
      fill: INK.secondary,
    },
    {
      t: 'text',
      x: 40,
      y: 140,
      text: '0 = identical modelled footprint · 1 = no shared segments · not a percentage of customers',
      size: 20,
      fill: INK.secondary,
    },
  ];
  const date = (input.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const note =
    variant === 'clean'
      ? `Modelled market distance from SAM and segment splits (nested-overlap assumption). ${date}.`
      : `Distance d = √(1 − O / √(M_IDV × M_i)), where O is the modelled shared market from SAM and segment splits under a nested-overlap assumption. ` +
        `Exact values; no dimensionality reduction. Generated ${date} · Market Landscape · model ${MODEL_VERSION}.`;
  chrome.push({ t: 'line', x1: 40, y1: h - 94, x2: w - 40, y2: h - 94, stroke: INK.grid, sw: 1.5 });
  wrapText(note, 16, w - 80)
    .slice(0, 3)
    .forEach((line, i) => chrome.push({ t: 'text', x: 40, y: h - 64 + i * 22, text: line, size: 16, fill: INK.secondary }));
  scene.prims = [...chrome, ...prims];
  return scene;
}
