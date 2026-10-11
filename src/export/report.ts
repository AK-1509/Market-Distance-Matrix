/**
 * Self-contained, print-friendly HTML report. No scripts, no remote assets (enforced by a
 * restrictive CSP), all user text escaped, and only HTTP(S) links rendered as anchors.
 */
import type { Analysis } from '../domain/analysis';
import type { LayoutDiagnostics } from '../domain/diagnostics';
import { formatAmount, formatDateTime, formatDegrees, formatDistance, formatShare } from '../domain/format';
import { formatPrice } from '../domain/price';
import { escapeXml, isHttpUrl } from '../domain/text';
import type { Product, Project } from '../domain/types';
import { FUTURE_WORK, METHODOLOGY, MODEL_NOTE } from '../report/methodology';
import type { Narrative } from '../report/narrative';
import { effectiveAllocations, formatPercent } from '../domain/allocation';

export interface ReportInput {
  project: Project;
  analysis: Analysis;
  diagnostics: LayoutDiagnostics | null;
  narrative: Narrative;
  radialSvg: string | null;
  distanceSvg: string;
  generatedAt?: string;
}

const e = escapeXml;

function link(url: string, text?: string): string {
  if (!isHttpUrl(url)) return e(text ?? url);
  return `<a href="${e(url)}" rel="noopener noreferrer nofollow">${e(text ?? url)}</a>`;
}

/** Inline an app-generated SVG (all user text inside it is already escaped). */
function inlineSvg(svg: string): string {
  return svg.replace('<svg ', '<svg class="chart" ');
}

const STYLE = `
:root{color-scheme:light;--ink:#0b0b0b;--ink2:#52514e;--muted:#6f6e69;--line:#e1e0d9;--page:#ffffff;--soft:#f6f6f3;--more:#e34948;--less:#2a78d6}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:15px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
main{max-width:1040px;margin:0 auto;padding:40px 28px 64px}
h1{font-size:30px;line-height:1.2;margin:0 0 6px;font-weight:650}
h2{font-size:20px;margin:36px 0 10px;font-weight:650;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{font-size:16px;margin:20px 0 6px;font-weight:650}
p{margin:6px 0}
.meta{color:var(--ink2);margin:0}
.note{color:var(--muted);font-size:13px}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:#fff4e5;color:#7a4b00;border:1px solid #f1d3a3;margin-left:6px;vertical-align:middle}
sup a{text-decoration:none;color:var(--ink2);font-size:11px;margin-left:1px}
figure{margin:20px 0;border:1px solid var(--line);border-radius:10px;padding:8px;background:#fff;break-inside:avoid}
figcaption{color:var(--ink2);font-size:13px;padding:6px 8px 2px}
svg.chart{display:block;width:100%;height:auto}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 4px;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--ink2);font-weight:600;background:var(--soft)}
td.num,th.num{text-align:right}
.tone-more{box-shadow:inset 3px 0 0 var(--more)}
.tone-less{box-shadow:inset 3px 0 0 var(--less)}
ol.refs{padding-left:22px}
ol.refs li{margin:6px 0}
a{color:#1c5cab}
.claims p{max-width:78ch}
@media print{
  main{max-width:none;padding:0}
  body{font-size:11pt}
  h2{break-after:avoid}
  figure,table{break-inside:avoid}
  a{color:inherit}
  a[href]::after{content:" (" attr(href) ")";font-size:9pt;color:#555;word-break:break-all}
  @page{margin:16mm}
}`;

function claimsHtml(narrative: Narrative): string {
  return narrative.sections
    .map((s, i) => {
      const paras = s.claims
        .map((c, j) => {
          const cites = narrative.citations[i][j];
          const sup = cites.length ? `<sup>${cites.map((n) => `<a href="#ref-${n}">[${n}]</a>`).join('')}</sup>` : '';
          return `<p>${e(c.text)}${sup}</p>`;
        })
        .join('\n');
      const table = s.table
        ? `<table><thead><tr>${s.table.columns.map((c) => `<th>${e(c)}</th>`).join('')}</tr></thead><tbody>${s.table.rows
            .map((r, k) => {
              const tone = s.table?.tones?.[k];
              return `<tr${tone ? ` class="tone-${tone}"` : ''}>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`;
            })
            .join('')}</tbody></table>`
        : '';
      return `<h3>${e(s.heading)}</h3><div class="claims">${paras}</div>${table}`;
    })
    .join('\n');
}

function segmentSplit(project: Project, p: Product): string {
  const names = new Map(project.segments.map((s) => [s.id, s.name]));
  const allocs = effectiveAllocations(p);
  if (!allocs.length) return '—';
  const text = allocs.map((a) => `${names.get(a.segmentId) ?? '?'} ${formatPercent(a.fraction)}`).join(', ');
  return p.allocationMode === 'equal' && allocs.length > 1 ? `${text} (equal split assumption)` : text;
}

export function buildReportHtml(input: ReportInput): string {
  const { project, analysis, diagnostics, narrative } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const unit = project.marketUnit;
  const P = (id: string) => analysis.products.get(id) as Product;
  const idv = P(analysis.idvId);

  const metricsRows = analysis.rankings.byDistance
    .map((id) => {
      const m = analysis.competitors.find((c) => c.productId === id)!;
      const p = P(id);
      return `<tr><td>${e(p.name)}</td><td class="num">${formatDistance(m.distance)}</td><td class="num">${formatAmount(m.sharedMarket)}</td><td class="num">${formatShare(m.idvExposure)}</td><td class="num">${formatShare(m.competitorExposure)}</td><td>${e(formatPrice(p.price))}</td></tr>`;
    })
    .join('');

  const inputsRows = analysis.order
    .map((id) => {
      const p = P(id);
      const som = p.som === null ? 'Unknown' : `${formatAmount(p.som)}${p.somHorizon ? ` (${e(p.somHorizon)})` : ''}`;
      return `<tr><td>${e(p.name)}${id === analysis.idvId ? ' <strong>(IDV)</strong>' : ''}<div class="note">${e(p.description)}</div></td><td class="num">${formatAmount(p.sam)}</td><td class="num">${som}</td><td>${e(segmentSplit(project, p))}</td><td>${e(formatPrice(p.price))}${p.price.note ? `<div class="note">${e(p.price.note)}</div>` : ''}</td><td>${e(p.evidenceStatus)}</td><td class="num">${p.sources.length}</td></tr>`;
    })
    .join('');

  const pairRows = diagnostics
    ? diagnostics.pairs
        .map(
          (d) =>
            `<tr><td>${e(P(d.a).name)} ↔ ${e(P(d.b).name)}</td><td class="num">${formatDistance(d.native)}</td><td class="num">${formatDistance(d.displayed)}</td><td class="num">${d.residual >= 0 ? '+' : ''}${d.residual.toFixed(3)}</td><td class="num">${d.involvesIdv ? 'exact radius' : formatDegrees(d.nativeAngle)}</td><td class="num">${d.involvesIdv ? '—' : formatDegrees(d.displayedAngle)}</td></tr>`,
        )
        .join('')
    : '';

  const refs = narrative.references
    .map((r) => {
      let body: string;
      if (r.kind === 'method') {
        const m = METHODOLOGY.find((x) => x.id === r.methodSection);
        body = `Methodology — <a href="#method-${e(r.methodSection ?? '')}">${e(m?.title ?? '')}</a>`;
      } else if (r.kind === 'all-products') {
        body = `${e(r.label)} — <a href="#inputs">inputs table</a>`;
      } else {
        const srcs = r.sources.length
          ? `<ul>${r.sources
              .map(
                (s) =>
                  `<li>${link(s.url, s.title || s.url)}${s.appliesTo?.length ? ` <span class="note">(applies to ${e(s.appliesTo.join(', '))})</span>` : ''}${s.accessedAt ? ` <span class="note">accessed ${e(s.accessedAt)}</span>` : ''}${s.note ? `<div class="note">${e(s.note)}</div>` : ''}</li>`,
              )
              .join('')}</ul>`
          : `<div class="note">No source entered for ${e(r.topics.join(', ') || 'these inputs')} — unsourced estimate.</div>`;
        body = `${e(r.label)}${r.evidenceStatus ? ` <span class="note">· evidence status: ${e(r.evidenceStatus)}</span>` : ''}${srcs}`;
      }
      return `<li id="ref-${r.number}">${body}</li>`;
    })
    .join('\n');

  const projectNotes = project.notes ? `<p class="note">Project notes: ${e(project.notes)}</p>` : '';
  const methodology = METHODOLOGY.map((m) => `<h3 id="method-${m.id}">${e(m.title)}</h3>${m.paragraphs.map((p) => `<p>${e(p)}</p>`).join('')}`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${e(`Market Landscape report — ${project.name}`)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>${e(project.name)}${project.isExample ? '<span class="badge">Fictional example</span>' : ''}</h1>
<p class="meta">${e(project.marketDescription || 'No market description entered.')}</p>
<p class="meta">TAM ${e(formatAmount(analysis.tam))} ${e(unit)} · Reference: ${e(project.referenceDate || '—')} · IDV: ${e(idv.name)} · ${analysis.order.length} products analyzed</p>
<p class="note">Generated ${e(formatDateTime(generatedAt))} · ${e(MODEL_NOTE)}</p>
</header>

<h2>Summary</h2>
${claimsHtml(narrative)}

<h2>Charts</h2>
${
  input.radialSvg
    ? `<figure>${inlineSvg(input.radialSvg)}<figcaption>Radial landscape. Distance from the center equals modeled market distance from ${e(idv.name)} exactly; angles are fitted to approximate competitor-to-competitor distances${diagnostics ? ` (map distance error ${formatShare(diagnostics.relativeRMSError)})` : ''}.</figcaption></figure>`
    : '<p class="note">The radial map was not available when this report was generated.</p>'
}
<figure>${inlineSvg(input.distanceSvg)}<figcaption>Exact modeled distance from ${e(idv.name)} on a fixed 0–1 scale (0 = identical modeled footprint, 1 = no shared segments). Not a percentage of customers.</figcaption></figure>

<h2>Relationships to the IDV</h2>
<table><thead><tr><th>Competitor</th><th class="num">Modeled distance</th><th class="num">Shared market (${e(unit)})</th><th class="num">IDV exposure</th><th class="num">Competitor exposure</th><th>Comparable price</th></tr></thead><tbody>${metricsRows || '<tr><td colspan="6">No competitors analyzed.</td></tr>'}</tbody></table>
<p class="note">IDV exposure = shared ÷ IDV SAM. Competitor exposure = shared ÷ competitor SAM. Rankings by distance and by shared market are reported separately.</p>

<h2 id="inputs">Inputs</h2>
<table><thead><tr><th>Product</th><th class="num">SAM</th><th class="num">SOM (scenario)</th><th>Segment split</th><th>Comparable price</th><th>Evidence</th><th class="num">Sources</th></tr></thead><tbody>${inputsRows}</tbody></table>
${projectNotes}

${
  diagnostics
    ? `<h2>Pairwise distances: modeled vs map</h2><table><thead><tr><th>Pair</th><th class="num">Modeled</th><th class="num">Map</th><th class="num">Difference</th><th class="num">Native angle</th><th class="num">Map angle</th></tr></thead><tbody>${pairRows}</tbody></table><p class="note">Map distance error ${formatShare(diagnostics.relativeRMSError)} (relative RMS over all plotted pairs); maximum absolute gap ${diagnostics.maxAbsError.toFixed(3)}. Angles are seen from the IDV.</p>`
    : ''
}

<h2>Methodology</h2>
${methodology}

<h2>References</h2>
<p class="note">Links are user-entered and have not been verified by this app. Adding a URL does not verify a whole product record.</p>
<ol class="refs">
${refs}
</ol>

<h2>Future work</h2>
<p class="note">${e(FUTURE_WORK)}</p>
</main>
</body>
</html>`;
}
