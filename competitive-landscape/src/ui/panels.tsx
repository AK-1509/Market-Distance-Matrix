import type { Analysis } from '../domain/analysis';
import { effectiveAllocations } from '../domain/allocation';
import { swatchColor, type ProductIdentity } from '../charts/palette';
import { formatDistance, formatPercent, formatQuantity, formatSplitPercent } from '../domain/format';
import { describePrice } from '../domain/price';
import type { Product, Project } from '../domain/types';
import { missingForAnalysis } from '../domain/validation';
import { IdvStar, SafeLink } from './common';

export function ProductSwatch({ identity }: { identity?: ProductIdentity }) {
  if (identity?.isIdv) return <IdvStar />;
  return <span className="swatch" style={{ background: swatchColor(identity?.color) }} aria-hidden="true" />;
}

export function ProductDetails({
  project,
  product,
  analysis,
  analysisIsCurrent,
}: {
  project: Project;
  product: Product;
  analysis: Analysis | null;
  analysisIsCurrent: boolean;
}) {
  const unit = project.marketUnit || 'units';
  const isIdv = project.idvProductId === product.id;
  const metric = analysis?.competitors.find((c) => c.id === product.id);
  const idvName = analysis ? analysis.names[analysis.idvId] : (project.products.find((p) => p.id === project.idvProductId)?.name ?? 'the IDV');
  const missing = missingForAnalysis(product);
  const segName = (id: string) => project.segments.find((s) => s.id === id)?.name ?? 'Deleted segment';
  const rank = analysis?.rankings.byDistance.indexOf(product.id) ?? -1;
  const eff = effectiveAllocations(product);

  return (
    <div>
      {product.description ? <p style={{ marginTop: 0 }}>{product.description}</p> : <p style={{ color: 'var(--ink-2)' }}>No description yet.</p>}

      <section className="panel-section">
        <h3>Modelled metrics</h3>
        {isIdv ? (
          <p style={{ margin: 0 }}>This is the IDV. It sits at the centre of the map, and every distance is measured from it.</p>
        ) : metric ? (
          <dl className="kv" data-testid="panel-metrics">
            <dt>Distance from {idvName}</dt>
            <dd>
              {formatDistance(metric.distance)}
              {rank >= 0 ? ` (#${rank + 1} nearest)` : ''}
              {!analysisIsCurrent ? ' · not current' : ''}
            </dd>
            <dt>Shared market</dt>
            <dd>
              {formatQuantity(metric.sharedMarket)} {unit}
            </dd>
            <dt>Share of {idvName}’s SAM</dt>
            <dd>{formatPercent(metric.idvExposure)}</dd>
            <dt>Share of own SAM</dt>
            <dd>{formatPercent(metric.competitorExposure)}</dd>
          </dl>
        ) : (
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>
            {missing.length ? `Not in the analysis yet: needs ${missing.join(', ')}.` : 'Not in the current analysis — see the issues above the charts.'}
          </p>
        )}
        {metric?.matchesIdv ? <p style={{ fontSize: 13.5 }}>Its modelled footprint matches the IDV, so it is drawn at the centre and its direction is undefined.</p> : null}
      </section>

      <section className="panel-section">
        <h3>Inputs</h3>
        <dl className="kv">
          <dt>SAM</dt>
          <dd>{product.sam === null ? 'Not entered' : `${formatQuantity(product.sam)} ${unit}`}</dd>
          <dt>SOM</dt>
          <dd>
            {product.som === null ? 'Unknown' : `${formatQuantity(product.som)} ${unit}${product.somHorizon ? ` (${product.somHorizon})` : ''} · scenario`}
          </dd>
          <dt>Comparable price</dt>
          <dd>
            {describePrice(product.price)}
            {product.price.note ? ` — ${product.price.note}` : ''}
          </dd>
          <dt>Evidence status</dt>
          <dd>{product.evidenceStatus}</dd>
        </dl>
        <div style={{ fontSize: 14 }}>
          <strong style={{ fontSize: 13.5 }}>Segment split</strong>
          {eff.length === 0 ? (
            <p style={{ margin: '4px 0', color: 'var(--ink-2)' }}>No segments selected.</p>
          ) : (
            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
              {eff.map((a) => (
                <li key={a.segmentId}>
                  {segName(a.segmentId)}: {formatSplitPercent(a.fraction)}
                  {product.sam !== null ? ` · ${formatQuantity(product.sam * a.fraction)}` : ''}
                </li>
              ))}
            </ul>
          )}
          {product.allocationMode === 'equal' && eff.length > 1 ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Equal split assumed.</p> : null}
        </div>
      </section>

      <section className="panel-section">
        <h3>References</h3>
        {product.sources.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>None — these inputs are unsourced estimates.</p>
        ) : (
          <ol className="refs" style={{ margin: 0 }}>
            {product.sources.map((s) => (
              <li key={s.id}>
                {s.title ? <strong>{s.title} </strong> : null}
                <SafeLink url={s.url} />
                {s.appliesTo?.length ? <span style={{ color: 'var(--ink-2)' }}> · supports {s.appliesTo.join(', ')}</span> : null}
                {s.accessedAt ? <span style={{ color: 'var(--ink-2)' }}> · accessed {s.accessedAt}</span> : null}
                {s.note ? <div style={{ color: 'var(--ink-2)' }}>{s.note}</div> : null}
              </li>
            ))}
          </ol>
        )}
        {product.sources.length > 0 ? <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Recorded as entered; not verified by this app.</p> : null}
      </section>

      {product.notes ? (
        <section className="panel-section">
          <h3>Notes</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{product.notes}</p>
        </section>
      ) : null}
    </div>
  );
}

export function SegmentDetails({ project, analysis, segmentId }: { project: Project; analysis: Analysis; segmentId: string }) {
  const seg = project.segments.find((s) => s.id === segmentId);
  const rows = analysis.productIds
    .map((id) => ({ id, amount: analysis.footprints[id].amounts[segmentId] ?? 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div>
      <p style={{ marginTop: 0 }}>
        The <strong>modelled segment center</strong> is the coverage-weighted average position of the products that allocate SAM to {seg?.name ?? 'this segment'}. It
        summarises the entered footprints — not measured preferences, users won or market share — and different distributions can produce the same point.
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">Allocated</th>
            <th className="num">Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {analysis.names[r.id]}
                {r.id === analysis.idvId ? ' (IDV)' : ''}
              </td>
              <td className="num">{formatQuantity(r.amount)}</td>
              <td className="num">{formatPercent(r.amount / total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
