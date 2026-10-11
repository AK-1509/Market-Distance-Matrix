/** Serialize a scene to a standalone SVG document (embedded styles, no external assets). */
import { escapeXml } from '../domain/text';
import { FONT_STACK, LIGHT } from './palette';
import type { ColorRole, Scene, SceneNode } from './scene';

const color = (role: ColorRole | undefined): string => (role === undefined || role === 'none' ? 'none' : LIGHT[role]);
const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));

function node(n: SceneNode): string {
  if (n.screenOnly) return '';
  const op = n.opacity !== undefined ? ` opacity="${num(n.opacity)}"` : '';
  switch (n.kind) {
    case 'rect':
      return `<rect x="${num(n.x)}" y="${num(n.y)}" width="${num(n.w)}" height="${num(n.h)}"${n.rx ? ` rx="${num(n.rx)}"` : ''} fill="${color(n.fill)}"${n.stroke ? ` stroke="${color(n.stroke)}" stroke-width="${num(n.strokeWidth ?? 1)}"` : ''}${op}/>`;
    case 'circle':
      return `<circle cx="${num(n.cx)}" cy="${num(n.cy)}" r="${num(n.r)}" fill="${color(n.fill)}"${n.stroke ? ` stroke="${color(n.stroke)}" stroke-width="${num(n.strokeWidth ?? 1)}"` : ''}${op}/>`;
    case 'line':
      return `<line x1="${num(n.x1)}" y1="${num(n.y1)}" x2="${num(n.x2)}" y2="${num(n.y2)}" stroke="${color(n.stroke)}" stroke-width="${num(n.strokeWidth)}" stroke-linecap="round"${op}/>`;
    case 'path':
      return `<path d="${escapeXml(n.d)}" fill="${color(n.fill)}"${n.stroke ? ` stroke="${color(n.stroke)}" stroke-width="${num(n.strokeWidth ?? 1)}" stroke-linejoin="round"` : ''}${op}/>`;
    case 'text': {
      const attrs = [
        `x="${num(n.x)}"`,
        `y="${num(n.y)}"`,
        `font-size="${num(n.size)}"`,
        n.weight ? `font-weight="${n.weight}"` : '',
        `fill="${color(n.fill)}"`,
        n.anchor && n.anchor !== 'start' ? `text-anchor="${n.anchor}"` : '',
        n.italic ? 'font-style="italic"' : '',
        n.tabular ? 'class="tab"' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<text ${attrs}${op}>${escapeXml(n.text)}</text>`;
    }
    case 'group':
      return `<g${op}>${n.children.map(node).join('')}</g>`;
  }
}

export function sceneToSvg(scene: Scene): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" role="img">`,
    `<title>${escapeXml(scene.title)}</title>`,
    `<desc>${escapeXml(scene.description)}</desc>`,
    `<style>text{font-family:${FONT_STACK};}.tab{font-variant-numeric:tabular-nums;}</style>`,
    `<rect x="0" y="0" width="${scene.width}" height="${scene.height}" fill="${color(scene.background)}"/>`,
    ...scene.nodes.map(node),
    '</svg>',
  ].join('\n');
}
