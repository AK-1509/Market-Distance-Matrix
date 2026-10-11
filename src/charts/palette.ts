/**
 * Validated categorical palette (8 fixed slots, assigned in fixed order, never cycled),
 * plus chart chrome. Exports always use the light palette on an opaque background.
 */
import type { ColorRole } from './scene';

export const LIGHT: Record<Exclude<ColorRole, 'none'>, string> = {
  surface: '#ffffff',
  page: '#f9f9f7',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#6f6e69',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  idv: '#0b0b0b',
  other: '#9a9992',
  segment: '#52514e',
  accent: '#2a78d6',
  highlight: '#2a78d6',
  crowded: '#e34948',
  covered: '#2a78d6',
  'series-1': '#2a78d6',
  'series-2': '#eb6834',
  'series-3': '#1baf7a',
  'series-4': '#eda100',
  'series-5': '#e87ba4',
  'series-6': '#008300',
  'series-7': '#4a3aa7',
  'series-8': '#e34948',
};

export const DARK: Record<Exclude<ColorRole, 'none'>, string> = {
  surface: '#1a1a19',
  page: '#0d0d0d',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#9d9c95',
  grid: '#2c2c2a',
  axis: '#4a4a46',
  idv: '#ffffff',
  other: '#77766f',
  segment: '#c3c2b7',
  accent: '#5598e7',
  highlight: '#5598e7',
  crowded: '#e66767',
  covered: '#3987e5',
  'series-1': '#3987e5',
  'series-2': '#d95926',
  'series-3': '#199e70',
  'series-4': '#c98500',
  'series-5': '#d55181',
  'series-6': '#008300',
  'series-7': '#9085e9',
  'series-8': '#e66767',
};

export const SERIES_SLOTS = 8;

/** Competitor k (0-based, project order excluding the IDV) → color role. Beyond 8: neutral. */
export function competitorColor(k: number): ColorRole {
  return k < SERIES_SLOTS ? (`series-${k + 1}` as ColorRole) : 'other';
}

export const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
