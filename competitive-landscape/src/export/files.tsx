// SVG / PNG serialisation. Exports are rendered from the
// same scene objects as the on-screen charts.

import { renderToStaticMarkup } from 'react-dom/server';
import { FONT_STACK } from '../charts/palette';
import { SceneSvg, type Scene } from '../charts/scene';

const EMBEDDED_CSS = `svg{font-family:${FONT_STACK};}text{font-kerning:normal;}`;

/** Standalone SVG document: embedded styles, no external fonts or images. */
export function sceneToSvg(scene: Scene): string {
  const markup = renderToStaticMarkup(<SceneSvg scene={scene} />);
  // Insert the style block right after the opening <svg ...> tag.
  const withStyle = markup.replace(/^<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs}><style>${EMBEDDED_CSS}</style>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${withStyle}`;
}

/** Inline SVG markup for embedding in the HTML report (no XML prolog). */
export function sceneToInlineSvg(scene: Scene): string {
  return renderToStaticMarkup(<SceneSvg scene={scene} />);
}

export async function svgToPng(svg: string, width: number, height: number, background = '#ffffff'): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.fillStyle = background; // opaque background
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
