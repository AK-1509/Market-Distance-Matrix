import type { Landscape } from '../app/landscape';
import { formatAmount, formatDegrees, formatDistance, formatShare } from '../domain/format';
import { formatPrice } from '../domain/price';
import { isHttpUrl } from '../domain/text';
import { FUTURE_WORK, METHODOLOGY } from '../report/methodology';
import type { Selection } from './ChartCards';

/** In-page jump without touching the URL hash (the hash is used for routing). */
function jumpToReference(n: number) {
  const details = document.getElementById('references') as HTMLDetailsElement | null;
  if (details) details.open = true;
  const item = document.getElementById(`ref-${n}`);
  if (item) {
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    item.classList.add('flash');
    setTimeout(() => item.classList.remove('flash'), 1200);
  }
}

export function SummaryCard({ landscape, onSelect }: { landscape: Landscape; onSelect: (s: Selection) => void }) {
  const { narrative, analysis, diagnostics } = landscape;
  const P = (id: string) => analysis.products.get(id)!;
  return (
    <section className="card summary" aria-labelledby="summary-title">
      <div className="card-head">
        <h2 id="summary-title">Summary</h2>
      </div>
      {narrative.sections.map((s, i) => (
        <div key={s.id} className="summary-section" data-section={s.id}>
          <h3>{s.heading}</h3>
          {s.claims.map((c, j) => (
            <p key={j}>
              {c.text}
              {narrative.citations[i][j].length > 0 && (
                <sup className="cites">
                  {narrative.citations[i][j].map((n) => (
                    <button key={n} type="button" className="cite-btn" onClick={() => jumpToReference(n)} aria-label={`Show reference ${n}`}>
                      [{n}]
                    </button>
                  ))}
                </sup>
              )}
            </p>
          ))}
          {s.table && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {s.table.columns.map((col) => (
                      <th key={col} scope="col">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, k) => (
                    <tr key={k} className={s.table?.tones?.[k] ? `tone-${s.table.tones[k]}` : undefined}>
                      {r.map((cell, m) => (
                        <td key={m}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <details className="disclosure">
        <summary>Exact relationships</summary>
        <div className="table-wrap">
          <table className="data-table">
            <caption>Competitors vs the IDV (modeled values)</caption>
            <thead>
              <tr>
                <th scope="col">Competitor</th>
                <th scope="col" className="num">
                  Distance
                </th>
                <th scope="col" className="num">
                  Shared ({analysis.unit})
                </th>
                <th scope="col" className="num">
                  IDV exposure
                </th>
                <th scope="col" className="num">
                  Competitor exposure
                </th>
                <th scope="col">Price</th>
              </tr>
            </thead>
            <tbody>
              {analysis.rankings.byDistance.map((id) => {
                const m = analysis.competitors.find((c) => c.productId === id)!;
                return (
                  <tr key={id}>
                    <td>
                      <button type="button" className="link-btn" onClick={() => onSelect({ type: 'product', id })}>
                        {P(id).name}
                      </button>
                    </td>
                    <td className="num">{formatDistance(m.distance)}</td>
                    <td className="num">{formatAmount(m.sharedMarket)}</td>
                    <td className="num">{formatShare(m.idvExposure)}</td>
                    <td className="num">{formatShare(m.competitorExposure)}</td>
                    <td>{formatPrice(P(id).price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {diagnostics && diagnostics.pairs.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <caption>All pairs: modeled vs map distance (select a pair for details)</caption>
              <thead>
                <tr>
                  <th scope="col">Pair</th>
                  <th scope="col" className="num">
                    Modeled
                  </th>
                  <th scope="col" className="num">
                    Map
                  </th>
                  <th scope="col" className="num">
                    Difference
                  </th>
                  <th scope="col" className="num">
                    Native angle
                  </th>
                  <th scope="col" className="num">
                    Map angle
                  </th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.pairs.map((d) => (
                  <tr key={`${d.a}-${d.b}`}>
                    <td>
                      <button type="button" className="link-btn" onClick={() => onSelect({ type: 'pair', a: d.a, b: d.b })}>
                        {P(d.a).name} ↔ {P(d.b).name}
                      </button>
                    </td>
                    <td className="num">{formatDistance(d.native)}</td>
                    <td className="num">{formatDistance(d.displayed)}</td>
                    <td className="num">
                      {d.residual >= 0 ? '+' : '−'}
                      {Math.abs(d.residual).toFixed(3)}
                    </td>
                    <td className="num">{d.involvesIdv ? 'exact radius' : formatDegrees(d.nativeAngle)}</td>
                    <td className="num">{d.involvesIdv ? '—' : formatDegrees(d.displayedAngle)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="disclosure">
        <summary>Methodology</summary>
        {METHODOLOGY.map((m) => (
          <div key={m.id} id={`method-${m.id}`}>
            <h4>{m.title}</h4>
            {m.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ))}
        <p className="field-hint">{FUTURE_WORK}</p>
      </details>

      <details className="disclosure" id="references">
        <summary>References ({narrative.references.length})</summary>
        <p className="field-hint">Links are user-entered and have not been verified by this app. Adding a URL does not verify a whole product record.</p>
        <ol className="refs">
          {narrative.references.map((r) => (
            <li key={r.number} id={`ref-${r.number}`}>
              {r.kind === 'method' ? (
                <>Methodology — {METHODOLOGY.find((m) => m.id === r.methodSection)?.title}</>
              ) : r.kind === 'all-products' ? (
                r.label
              ) : (
                <>
                  {r.label}
                  {r.evidenceStatus && <span className="field-hint"> · evidence: {r.evidenceStatus}</span>}
                  {r.sources.length ? (
                    <ul>
                      {r.sources.map((s) => (
                        <li key={s.id}>
                          {isHttpUrl(s.url) ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                              {s.title || s.url}
                            </a>
                          ) : (
                            s.title || s.url
                          )}
                          {s.note && <span className="field-hint"> — {s.note}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="field-hint">No source entered for {r.topics.join(', ') || 'these inputs'} — unsourced estimate.</div>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
