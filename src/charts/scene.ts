/**
 * Renderer-independent chart scene. The same scene (same data coordinates) is rendered
 * interactively by React and serialized to standalone SVG/PNG for export.
 * Colors are semantic roles resolved per renderer (CSS variables on screen, fixed light
 * palette in exports).
 */
export type ColorRole =
  | 'surface'
  | 'page'
  | 'ink'
  | 'ink2'
  | 'muted'
  | 'grid'
  | 'axis'
  | 'idv'
  | 'other'
  | 'segment'
  | 'accent'
  | 'highlight'
  | 'crowded'
  | 'covered'
  | 'series-1'
  | 'series-2'
  | 'series-3'
  | 'series-4'
  | 'series-5'
  | 'series-6'
  | 'series-7'
  | 'series-8'
  | 'none';

export type Target =
  | { type: 'product'; id: string }
  | { type: 'stack'; ids: string[] }
  | { type: 'segment'; id: string };

interface Base {
  /** Rendered on screen only (focus rings etc.); omitted from exports. */
  screenOnly?: boolean;
  className?: string;
  opacity?: number;
}

export interface RectNode extends Base {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill: ColorRole;
  stroke?: ColorRole;
  strokeWidth?: number;
}

export interface CircleNode extends Base {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill: ColorRole;
  stroke?: ColorRole;
  strokeWidth?: number;
}

export interface LineNode extends Base {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: ColorRole;
  strokeWidth: number;
}

export interface PathNode extends Base {
  kind: 'path';
  d: string;
  fill: ColorRole;
  stroke?: ColorRole;
  strokeWidth?: number;
}

export interface TextNode extends Base {
  kind: 'text';
  x: number;
  /** Alphabetic baseline. */
  y: number;
  text: string;
  size: number;
  weight?: number;
  fill: ColorRole;
  anchor?: 'start' | 'middle' | 'end';
  italic?: boolean;
  tabular?: boolean;
}

export interface GroupNode extends Base {
  kind: 'group';
  children: SceneNode[];
  target?: Target;
  /** Accessible name for interactive targets. */
  label?: string;
  /** Optional tooltip lines (screen only). */
  tooltip?: string[];
}

export type SceneNode = RectNode | CircleNode | LineNode | PathNode | TextNode | GroupNode;

export interface Scene {
  width: number;
  height: number;
  background: ColorRole;
  title: string;
  description: string;
  nodes: SceneNode[];
}

/** Collect every text string in a scene (used to verify exports contain all labels). */
export function sceneTexts(scene: Scene): string[] {
  const out: string[] = [];
  const walk = (nodes: SceneNode[]) => {
    for (const n of nodes) {
      if (n.screenOnly) continue;
      if (n.kind === 'text') out.push(n.text);
      else if (n.kind === 'group') walk(n.children);
    }
  };
  walk(scene.nodes);
  return out;
}
