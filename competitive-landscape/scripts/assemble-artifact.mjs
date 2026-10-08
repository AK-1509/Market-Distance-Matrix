// Turns the `vite build --mode artifact` output into what the Artifact tool
// publishes: page *content* (the publisher adds the <!doctype>/<head>/<body>
// skeleton) with the CSS and JS inlined, plus the layout worker as a sibling
// file. Usage: node scripts/assemble-artifact.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve('dist-artifact');
const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
const scriptSrc = /<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/.exec(html)?.[1];
const cssHref = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/.exec(html)?.[1];
if (!scriptSrc || !cssHref) throw new Error('Could not find the built script or stylesheet in dist-artifact/index.html');

const js = readFileSync(path.join(dir, scriptSrc), 'utf8')
  // An inline <script> ends at the first "</script"; escape it (and "<!--")
  // inside strings so the bundle cannot terminate its own element.
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');
const css = readFileSync(path.join(dir, cssHref), 'utf8').replace(/<\/style/gi, '<\\/style');

const worker = readdirSync(path.join(dir, 'assets')).find((f) => f.startsWith('layout.worker') && f.endsWith('.js'));
if (!worker) throw new Error('Layout worker not found in dist-artifact/assets');
// The bundle resolves the worker against its own URL; once inlined that is
// the page's URL, so the worker is published next to the page.
if (!js.includes(`"${worker}"`)) throw new Error(`Bundle does not reference ${worker}`);

const page = `<title>Market Landscape</title>
<meta name="description" content="Turn a small set of researched competitors into an editable competitive landscape and a presentation-ready graphic.">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
const out = path.join(dir, 'market-landscape.html');
writeFileSync(out, page);
console.log(
  JSON.stringify(
    { page: path.relative(process.cwd(), out), bytes: Buffer.byteLength(page), workerPublishedAs: worker, workerSource: path.relative(process.cwd(), path.join(dir, 'assets', worker)) },
    null,
    2,
  ),
);
