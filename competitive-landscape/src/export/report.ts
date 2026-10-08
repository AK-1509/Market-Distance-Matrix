// Self-contained, printable HTML report. Every user-provided string goes
// through escapeHtml; links are emitted only for http(s) URLs; a strict CSP
// forbids scripts and remote loads.

import { pairDistance, type Analysis } from '../domain/analysis';
import { MODEL_VERSION, SCHEMA_VERSION } from '../domain/constants';
import type { LayoutDiagnostics } from '../domain/diagnostics';
import { effectiveAllocations } from '../domain/allocation';
import {
  formatDate,
  formatDegrees,
  formatDistance,
  formatPercent,
  formatQuantity,
  formatSplitPercent,
} from '../domain/format';
import { methodology } from '../domain/methodology';
import type { Inline, Narrative } from '../domain/narrative';
import { describePrice } from '../domain/price';
import type { Project } from '../domain/types';
import { isHttpUrl } from '../domain/validation';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(runs: readonly Inline[]): string {
  return runs
    .map((r) => {
      if (typeof r === 'string') return escapeHtml(r);
      if ('strong' in r) return `<strong>${escapeHtml(r.strong)}</strong>`;
      const cites = r.cite
        .map((c) => `<a href="${escapeHtml(c.href)}"${c.title ? ` title="${escapeHtml(c.title)}"` : ''}>${escapeHtml(c.label)}</a>`)
        .join(', ');
      return `<sup class="cite">[${cites}]</sup>`;
    })
    .join('');
}

function link(url: string, text?: string): string {
  if (!isHttpUrl(url)) return escapeHtml(text ?? url);
  return `<a href="${escapeHtml(url)}" rel="noopener noreferrer nofollow">${escapeHtml(text ?? url)}</a>`;
}

const CSS = `
:root{--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--line:#e1e0d9;--surface:#fcfcfb;--page:#ffffff}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:1100px;margin:0 auto;padding:40px 24px 64px}
.table-wrap{overflow-x:auto;margin:8px 0 12px}
.table-wrap table{margin:0}
h1{font-size:30px;line-height:1.2;margin:4px 0 8px}
h2{font-size:21px;margin:40px 0 12px;padding-top:12px;border-top:1px solid var(--line)}
h3{font-size:16px;margin:22px 0 6px}
p,li{max-width:72ch}
.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:12px;color:var(--ink2);margin:0}
.meta{color:var(--ink2);margin:0 0 12px}
.callout{background:#f4f3ef;border-left:3px solid var(--ink2);padding:10px 14px;margin:16px 0}
.cite{font-size:11px;color:var(--ink2);margin-left:2px}
.cite a{color:inherit}
figure{margin:16px 0}
figure svg{width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff}
figcaption{color:var(--ink2);font-size:13px;margin-top:6px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 12px}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{font-weight:600;color:var(--ink2)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.matrix td,.matrix th{text-align:right;font-variant-numeric:tabular-nums;padding:4px 6px}
.matrix th[scope=row]{text-align:left}
.formula{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f4f3ef;padding:2px 6px;border-radius:4px;display:inline-block;margin:2px 0}
.refs li{margin-bottom:6px;word-break:break-word}
footer{margin-top:48px;color:var(--muted);font-size:12px}
@media print{
  body{font-size:11pt}
  main{max-width:none;padding:0}
  h2{break-after:avoid}
  figure,table,.callout{break-inside:avoid}
  a{color:inherit}
  @page{margin:16mm}
}`;

export interface ReportInput {
  project: Project;
  analysis: Analysis;
  diagnostics: LayoutDiagnostics;
  narrative: Narrative;
  landscapeSvg: string;
  distanceSvg: string;
  generatedAt: string;
}

export function buildReportHtml(input: ReportInput): string {
  const { project, analysis: a, diagnostics: diag, narrative } = input;
  const unit = escapeHtml(a.unit || 'units');
  const name = (id: string) => escapeHtml(a.names[id] || 'Untitled product');
  const idv = name(a.idvId);
  const byId = new Map(project.products.map((p) => [p.id, p]));
  const segName = (id: string) => escapeHtml(project.segments.find((s) => s.id === id)?.name ?? id);
  const out: string[] = [];

  out.push(`<!doctype html><html lang="en"><head><meta charset="utf-8">`);
  out.push(`<meta name="viewport" content="width=device-width, initial-scale=1">`);
  out.push(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">`);
  out.push(`<meta name="referrer" content="no-referrer">`);
  out.push(`<title>${escapeHtml(project.name || 'Untitled project')} — Market Landscape report</title>`);
  out.push(`<style>${CSS}</style></head><body><main>`);

  out.push(`<header><p class="eyebrow">Market Landscape report</p><h1>${escapeHtml(project.name || 'Untitled project')}</h1>`);
  out.push(
    `<p class="meta">IDV: <strong>${idv}</strong> · TAM ${escapeHtml(formatQuantity(a.tam))} ${unit} · reference date ${escapeHtml(project.referenceDate)} · generated ${escapeHtml(formatDate(input.generatedAt))}</p>`,
  );
  if (project.marketDescription.trim()) out.push(`<p>${escapeHtml(project.marketDescription)}</p>`);
  out.push(
    `<p class="callout">All figures are modelled from user-entered estimates using a transparent market-overlap model. Distances are modelled market distances, not percentages of customers, and nothing here is a measurement of market share or customer preference.</p></header>`,
  );

  out.push(`<section id="summary"><h2>Summary</h2>`);
  for (const s of narrative.sections) {
    out.push(`<h3 id="summary-${escapeHtml(s.id)}">${escapeHtml(s.title)}</h3>`);
    for (const p of s.paragraphs) out.push(`<p>${inline(p)}</p>`);
    if (s.list?.length) out.push(`<ul>${s.list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
  }
  out.push(`</section>`);

  out.push(`<section id="landscape"><h2>Competitive landscape</h2><figure>${input.landscapeSvg}`);
  out.push(
    `<figcaption>${idv} is at the centre. Each competitor’s distance from the centre equals its exact modelled distance; competitor-to-competitor spacing is fitted (map distance error ${escapeHtml(formatPercent(diag.relativeRMSError, 1))}). Rotation is arbitrary.</figcaption></figure></section>`,
  );
  out.push(`<section id="distances"><h2>Distance from the IDV</h2><figure>${input.distanceSvg}`);
  out.push(`<figcaption>Exact modelled distances on a fixed 0–1 scale.</figcaption></figure></section>`);

  // Relationship table.
  out.push(`<section id="relationships"><h2>Relationships with ${idv}</h2>`);
  out.push(
    `<div class="table-wrap"><table><thead><tr><th>Competitor</th><th class="num">Distance</th><th class="num">Shared market (${unit})</th><th class="num">Share of ${idv}’s SAM</th><th class="num">Share of competitor’s SAM</th><th class="num">SAM</th><th class="num">SOM</th><th>Comparable price</th></tr></thead><tbody>`,
  );
  for (const id of a.rankings.byDistance) {
    const c = a.competitors.find((x) => x.id === id)!;
    const p = byId.get(id)!;
    out.push(
      `<tr><td>${name(id)}</td><td class="num">${formatDistance(c.distance)}</td><td class="num">${escapeHtml(formatQuantity(c.sharedMarket))}</td><td class="num">${formatPercent(c.idvExposure)}</td><td class="num">${formatPercent(c.competitorExposure)}</td><td class="num">${escapeHtml(formatQuantity(c.sam))}</td><td class="num">${p.som === null ? 'Unknown' : escapeHtml(formatQuantity(p.som))}</td><td>${escapeHtml(describePrice(p.price))}</td></tr>`,
    );
  }
  out.push(`</tbody></table></div>`);

  out.push(`<h3>Distance matrix (native, all pairs)</h3><div class="table-wrap"><table class="matrix"><thead><tr><th></th>`);
  for (const id of a.productIds) out.push(`<th>${name(id)}</th>`);
  out.push(`</tr></thead><tbody>`);
  for (const r of a.productIds) {
    out.push(`<tr><th scope="row">${name(r)}${r === a.idvId ? ' (IDV)' : ''}</th>`);
    for (const c of a.productIds) out.push(`<td>${formatDistance(pairDistance(a, r, c))}</td>`);
    out.push(`</tr>`);
  }
  out.push(`</tbody></table></div>`);
  const worst = diag.worstPair;
  out.push(
    `<p>Map distance error (relative RMS over all pairs): <strong>${escapeHtml(formatPercent(diag.relativeRMSError, 1))}</strong>; maximum absolute error ${formatDistance(diag.maxAbsError)}${
      worst
        ? ` (${name(worst.a)} – ${name(worst.b)}: native ${formatDistance(worst.native)}, displayed ${formatDistance(worst.displayed)}${
            worst.nativeAngle !== null ? `, native angle ${escapeHtml(formatDegrees(worst.nativeAngle))}, displayed angle ${escapeHtml(formatDegrees(worst.displayedAngle))}` : ''
          })`
        : ''
    }. It describes how well the flat map reproduces the model, not data confidence.</p>`,
  );
  if (a.groups.length) {
    out.push(`<h3>Directional groups</h3><ul>`);
    for (const g of a.groups) {
      out.push(
        `<li>${g.memberIds.map(name).join(', ')} — unique modelled overlap with ${idv}: ${escapeHtml(formatQuantity(g.sharedWithIdv))} ${unit}; widest internal angle ${escapeHtml(formatDegrees(g.maxAngle))}.</li>`,
      );
    }
    out.push(`</ul>`);
  }
  out.push(`</section>`);

  // Inputs.
  out.push(`<section id="inputs"><h2>Inputs</h2>`);
  out.push(
    `<div class="table-wrap"><table><thead><tr><th>Product</th><th>Description</th><th class="num">SAM</th><th class="num">SOM</th><th>Segment split</th><th>Price</th><th>Evidence</th></tr></thead><tbody>`,
  );
  for (const id of a.productIds) {
    const p = byId.get(id)!;
    const split = effectiveAllocations(p)
      .map((x) => `${segName(x.segmentId)} ${formatSplitPercent(x.fraction)}`)
      .join('; ');
    out.push(
      `<tr><td>${name(id)}${id === a.idvId ? ' (IDV)' : ''}</td><td>${escapeHtml(p.description)}</td><td class="num">${escapeHtml(formatQuantity(p.sam))}</td><td class="num">${
        p.som === null ? 'Unknown' : `${escapeHtml(formatQuantity(p.som))}${p.somHorizon ? ` (${escapeHtml(p.somHorizon)})` : ''}`
      }</td><td>${split}${p.allocationMode === 'equal' ? ' <em>(equal split assumed)</em>' : ''}</td><td>${escapeHtml(describePrice(p.price))}${
        p.price.note ? ` — ${escapeHtml(p.price.note)}` : ''
      }</td><td>${escapeHtml(p.evidenceStatus)}</td></tr>`,
    );
  }
  out.push(`</tbody></table></div>`);
  if (a.excluded.length) {
    out.push(`<p>Not analysed (incomplete): ${a.excluded.map((e) => `${escapeHtml(e.name)} — needs ${escapeHtml(e.missing.join(', '))}`).join('; ')}.</p>`);
  }
  if (project.notes?.trim()) out.push(`<h3>Project notes</h3><p>${escapeHtml(project.notes)}</p>`);
  out.push(`</section>`);

  // Methodology.
  out.push(`<section id="methodology"><h2>Methodology</h2>`);
  for (const m of methodology()) {
    out.push(`<h3>${escapeHtml(m.title)}</h3>`);
    for (const p of m.paragraphs) out.push(`<p>${escapeHtml(p)}</p>`);
    if (m.formulas) out.push(`<p>${m.formulas.map((f) => `<span class="formula">${escapeHtml(f)}</span>`).join('<br>')}</p>`);
  }
  out.push(`</section>`);

  // References.
  out.push(`<section id="references"><h2>References</h2>`);
  if (narrative.references.length) {
    out.push(`<ol class="refs">`);
    for (const r of narrative.references) {
      const s = r.source;
      const bits = [
        `<strong>${escapeHtml(r.scope)}</strong>`,
        s.title ? escapeHtml(s.title) : '',
        link(s.url),
        s.accessedAt ? `accessed ${escapeHtml(s.accessedAt)}` : '',
        s.appliesTo?.length ? `supports: ${escapeHtml(s.appliesTo.join(', '))}` : '',
        s.note ? escapeHtml(s.note) : '',
      ].filter(Boolean);
      out.push(`<li id="${escapeHtml(r.anchor)}" value="${r.number}">${bits.join(' — ')}</li>`);
    }
    out.push(`</ol>`);
  } else {
    out.push(`<p>No references were entered.</p>`);
  }
  if (narrative.unsourced.length) {
    out.push(`<p>Unsourced estimates (no reference attached): ${narrative.unsourced.map((n) => escapeHtml(n)).join(', ')}.</p>`);
  }
  out.push(`<p>References are reproduced as entered. They have not been fetched or verified by this app, and a link does not verify the whole product record.</p></section>`);

  out.push(
    `<footer>Generated ${escapeHtml(input.generatedAt)} by Market Landscape · model ${escapeHtml(MODEL_VERSION)} · schema ${SCHEMA_VERSION} · inputs revision ${project.revision}. Print this page to save a PDF.</footer>`,
  );
  out.push(`</main></body></html>`);
  return out.join('\n');
}
