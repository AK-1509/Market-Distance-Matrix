// A chart is built as a pure "scene" of SVG primitives, then rendered by
// SceneSvg. The same scene type and renderer serve the interactive view and
// every export (via renderToStaticMarkup), so exported numbers and positions
// are exactly the ones on screen. React escapes all text content.

import type { CSSProperties, KeyboardEvent } from 'react';
import { FONT_STACK, SCREEN_THEME } from './palette';

export interface Hit {
  kind: 'product' | 'stack' | 'segment' | 'bar';
  ids: string[];
  label: string;
}

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; rx?: number; stroke?: string; sw?: number; opacity?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number; opacity?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; opacity?: number }
  | { t: 'path'; d: string; fill: string; stroke?: string; sw?: number; opacity?: number }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      fill: string;
      anchor?: 'start' | 'middle' | 'end';
      weight?: number;
      italic?: boolean;
      baseline?: 'middle' | 'auto' | 'hanging';
      tabular?: boolean;
    }
  | { t: 'g'; children: Prim[]; hit?: Hit; testId?: string; selected?: boolean };

export interface Scene {
  width: number;
  height: number;
  background?: string;
  title: string;
  desc: string;
  prims: Prim[];
}

export interface SceneHandlers {
  onActivate?: (hit: Hit) => void;
  onHover?: (hit: Hit | null) => void;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

type Paint = (fill?: string, stroke?: string, extra?: CSSProperties) => { fill?: string; stroke?: string; style?: CSSProperties };

/** Literal colours: exports, which must not depend on page CSS. */
const literalPaint: Paint = (fill, stroke, extra) => ({ fill, stroke, style: extra });

/** On screen, palette colours become CSS variables so charts follow the light/dark theme. */
const themedPaint: Paint = (fill, stroke, extra) => {
  const style: CSSProperties = { ...extra };
  const f = fill ? SCREEN_THEME[fill] : undefined;
  const s = stroke ? SCREEN_THEME[stroke] : undefined;
  if (f) style.fill = f;
  if (s) style.stroke = s;
  return { fill: f ? undefined : fill, stroke: s ? undefined : stroke, style: Object.keys(style).length ? style : undefined };
};

function renderPrim(p: Prim, key: number, h: SceneHandlers, paint: Paint): React.ReactNode {
  switch (p.t) {
    case 'rect':
      return (
        <rect key={key} x={r2(p.x)} y={r2(p.y)} width={r2(Math.max(0, p.w))} height={r2(Math.max(0, p.h))} rx={p.rx}
          {...paint(p.fill, p.stroke)} strokeWidth={p.sw} opacity={p.opacity} />
      );
    case 'circle':
      return <circle key={key} cx={r2(p.cx)} cy={r2(p.cy)} r={r2(p.r)} {...paint(p.fill, p.stroke)} strokeWidth={p.sw} opacity={p.opacity} />;
    case 'line':
      return (
        <line key={key} x1={r2(p.x1)} y1={r2(p.y1)} x2={r2(p.x2)} y2={r2(p.y2)} {...paint(undefined, p.stroke)} strokeWidth={p.sw}
          opacity={p.opacity} strokeLinecap="round" />
      );
    case 'path':
      return <path key={key} d={p.d} {...paint(p.fill, p.stroke)} strokeWidth={p.sw} opacity={p.opacity} strokeLinejoin="round" />;
    case 'text':
      return (
        <text key={key} x={r2(p.x)} y={r2(p.y)} fontSize={p.size} textAnchor={p.anchor ?? 'start'}
          fontWeight={p.weight} fontStyle={p.italic ? 'italic' : undefined}
          dominantBaseline={p.baseline === 'middle' ? 'central' : p.baseline === 'hanging' ? 'hanging' : undefined}
          {...paint(p.fill, undefined, p.tabular ? { fontVariantNumeric: 'tabular-nums' } : undefined)}>
          {p.text}
        </text>
      );
    case 'g': {
      const children = p.children.map((c, i) => renderPrim(c, i, h, paint));
      if (!p.hit || !h.onActivate) {
        return (
          <g key={key} data-testid={p.testId}>
            {children}
          </g>
        );
      }
      const hit = p.hit;
      const activate = () => h.onActivate?.(hit);
      return (
        <g
          key={key}
          role="button"
          tabIndex={0}
          aria-label={hit.label}
          aria-pressed={p.selected ? true : undefined}
          data-testid={p.testId}
          className="chart-hit"
          onClick={activate}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate();
            }
          }}
          onMouseEnter={() => h.onHover?.(hit)}
          onMouseLeave={() => h.onHover?.(null)}
          onFocus={() => h.onHover?.(hit)}
          onBlur={() => h.onHover?.(null)}
        >
          {children}
        </g>
      );
    }
  }
}

export function SceneSvg({
  scene,
  handlers = {},
  className,
  testId,
  themed = false,
}: {
  scene: Scene;
  handlers?: SceneHandlers;
  className?: string;
  testId?: string;
  /** Screen rendering: palette colours follow the page theme via CSS variables. */
  themed?: boolean;
}) {
  const interactive = Boolean(handlers.onActivate);
  const paint = themed ? themedPaint : literalPaint;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={scene.width}
      height={scene.height}
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      role={interactive ? 'group' : 'img'}
      aria-label={scene.title}
      className={className}
      data-testid={testId}
      fontFamily={FONT_STACK}
    >
      <title>{scene.title}</title>
      <desc>{scene.desc}</desc>
      {scene.background ? <rect x={0} y={0} width={scene.width} height={scene.height} fill={scene.background} /> : null}
      {scene.prims.map((p, i) => renderPrim(p, i, handlers, paint))}
    </svg>
  );
}

/** Approximate rendered width of system-sans text, used for label collision checks. */
export function textWidth(text: string, size: number, weight = 400): number {
  let units = 0;
  for (const ch of text) {
    if ('iIl.,:;|!\'’`'.includes(ch)) units += 0.28;
    else if ('fjtr()[]{} '.includes(ch)) units += 0.34;
    else if ('mwMW@%'.includes(ch)) units += 0.86;
    else if (ch >= 'A' && ch <= 'Z') units += 0.68;
    else if (ch >= '0' && ch <= '9') units += 0.56;
    else if (ch.charCodeAt(0) > 0x2e80) units += 1.0; // CJK and other wide glyphs
    else units += 0.55;
  }
  return units * size * (weight >= 600 ? 1.06 : 1);
}

/** Truncate with an ellipsis so text fits a width budget (display only). */
export function fitText(text: string, size: number, maxWidth: number, weight = 400): string {
  if (textWidth(text, size, weight) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${text.slice(0, mid)}…`, size, weight) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, Math.max(1, lo))}…`;
}

/** Star path for the IDV marker (distinct shape, area comparable to a dot). */
export function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.48;
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    pts.push(`${r2(cx + r * Math.cos(a))},${r2(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join('L')}Z`;
}

export function diamondPath(cx: number, cy: number, r: number): string {
  return `M${r2(cx)},${r2(cy - r)}L${r2(cx + r)},${r2(cy)}L${r2(cx)},${r2(cy + r)}L${r2(cx - r)},${r2(cy)}Z`;
}

/** Bar with a 4px rounded data end and a square baseline (left). */
export function barPath(x: number, y: number, w: number, h: number, radius = 4): string {
  const r = Math.min(radius, w / 2, h / 2);
  if (w <= 0) return '';
  return `M${r2(x)},${r2(y)}H${r2(x + w - r)}Q${r2(x + w)},${r2(y)} ${r2(x + w)},${r2(y + r)}V${r2(y + h - r)}Q${r2(x + w)},${r2(y + h)} ${r2(x + w - r)},${r2(y + h)}H${r2(x)}Z`;
}
