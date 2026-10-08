// Validated reference palette (dataviz skill, light mode). Product identity
// colours follow the entity: assigned once by stable ID order, never by rank.
// On the scatter-like map only the first three slots are separable for all
// colour-vision types, so every product is also labelled directly and keyed.

import { compareIds } from '../domain/ids';
import type { Project } from '../domain/types';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const;

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  surface: '#fcfcfb',
  page: '#f9f9f7',
  /** Diverging poles used for segment-coverage illustration (always with text labels). */
  crowded: '#e34948',
  lessCovered: '#2a78d6',
} as const;

/** Competitors past the eighth share a neutral marker; their key number and label carry identity. */
export const OVERFLOW_COLOR = '#a8a69f';

export const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface ProductIdentity {
  color: string;
  /** 1-based key number for competitors (0 for the IDV). */
  key: number;
  isIdv: boolean;
}

export function productIdentities(project: Pick<Project, 'products' | 'idvProductId'>): Record<string, ProductIdentity> {
  const out: Record<string, ProductIdentity> = {};
  const competitors = project.products.filter((p) => p.id !== project.idvProductId).map((p) => p.id).sort(compareIds);
  competitors.forEach((id, i) => {
    out[id] = { color: i < SERIES.length ? SERIES[i] : OVERFLOW_COLOR, key: i + 1, isIdv: false };
  });
  if (project.idvProductId) out[project.idvProductId] = { color: INK.primary, key: 0, isIdv: true };
  return out;
}

/**
 * On-screen theming: each literal palette colour maps to a CSS variable that
 * the stylesheet defines for light and dark (dark steps from the same ramps).
 * Exports render with the literal colours on white.
 */
export const SCREEN_THEME: Record<string, string> = {
  [INK.primary]: 'var(--chart-ink)',
  [INK.secondary]: 'var(--chart-ink-2)',
  [INK.muted]: 'var(--chart-muted)',
  [INK.grid]: 'var(--chart-grid)',
  [INK.axis]: 'var(--chart-axis)',
  [INK.surface]: 'var(--chart-surface)',
  '#f0efec': 'var(--chart-selected)',
  [OVERFLOW_COLOR]: 'var(--series-overflow)',
  ...Object.fromEntries(SERIES.map((c, i) => [c, `var(--series-${i + 1})`])),
};

/** CSS value for a product swatch outside SVG scenes. */
export function swatchColor(color: string | undefined): string {
  if (!color) return 'var(--chart-muted)';
  return SCREEN_THEME[color] ?? color;
}
