import type { ResolvedView } from '../app/useAnalysis';
import { pairDistance, pairOverlap, type Analysis } from '../domain/analysis';
import { pairDiagnostic } from '../domain/diagnostics';
import { formatDegrees, formatDistance, formatPercent, formatQuantity } from '../domain/format';
import { describePrice } from '../domain/price';
import type { Project } from '../domain/types';
import type { ValidationResult } from '../domain/validation';
import type { ProductIdentity } from '../charts/palette';
import { ProductSwatch } from './panels';

export function ProductsTable({
  project,
  identities,
  validation,
  selectedId,
  onSelect,
}: {
  project: Project;
  identities: Record<string, ProductIdentity>;
  validation: ValidationResult | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const unit = project.marketUnit || 'units';
  const ordered = [...project.products].sort((a, b) =>
    a.id === project.idvProductId ? -1 : b.id === project.idvProductId ? 1 : a.id < b.id ? -1 : 1,
  );
  const excluded = new Map(validation?.excluded.map((e) => [e.productId, e]) ?? []);
  if (ordered.length === 0) return <p className="empty">No products yet.</p>;
  return (
    <div className="table-scroll">
      <table className="data" data-testid="products-table">
        <caption className="visually-hidden">Products with SAM and SOM in {unit}</caption>
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">SAM</th>
            <th className="num">SOM</th>
            <th>Price</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((p) => {
            const ex = excluded.get(p.id);
            return (
              <tr key={p.id} className={selectedId === p.id ? 'selected' : undefined}>
                <td>
                  <button type="button" className="row-btn" onClick={() => onSelect(p.id)}>
                    <ProductSwatch identity={identities[p.id]} />
                    {p.name || 'Untitled product'}
                    {p.id === project.idvProductId ? <span className="badge idv">IDV</span> : null}
                  </button>
                </td>
                <td className="num">{p.sam === null ? '—' : formatQuantity(p.sam)}</td>
                <td className="num">{p.som === null ? 'Unknown' : formatQuantity(p.som)}</td>
                <td>{describePrice(p.price)}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{ex ? `Draft: needs ${ex.missing.join(', ')}` : p.evidenceStatus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RelationshipsTable({
  analysis,
  project,
  identities,
  selectedId,
  onSelect,
}: {
  analysis: Analysis;
  project: Project;
  identities: Record<string, ProductIdentity>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const idv = analysis.names[analysis.idvId];
  const byId = new Map(project.products.map((p) => [p.id, p]));
  return (
    <div className="table-scroll">
      <table className="data" data-testid="relationship-table">
        <thead>
          <tr>
            <th>Competitor</th>
            <th className="num">Distance</th>
            <th className="num">Shared market</th>
            <th className="num">% of {idv}’s SAM</th>
            <th className="num">% of own SAM</th>
            <th className="num">SAM</th>
            <th>Comparable price</th>
          </tr>
        </thead>
        <tbody>
          {analysis.rankings.byDistance.map((id) => {
            const c = analysis.competitors.find((x) => x.id === id)!;
            return (
              <tr key={id} className={selectedId === id ? 'selected' : undefined}>
                <td>
                  <button type="button" className="row-btn" onClick={() => onSelect(id)}>
                    <ProductSwatch identity={identities[id]} />
                    {c.name}
                  </button>
                </td>
                <td className="num">{formatDistance(c.distance)}</td>
                <td className="num">{formatQuantity(c.sharedMarket)}</td>
                <td className="num">{formatPercent(c.idvExposure)}</td>
                <td className="num">{formatPercent(c.competitorExposure)}</td>
                <td className="num">{formatQuantity(c.sam)}</td>
                <td>{describePrice(byId.get(id)!.price)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DistanceMatrix({
  view,
  pair,
  onPair,
}: {
  view: ResolvedView;
  pair: [string, string] | null;
  onPair: (pair: [string, string] | null) => void;
}) {
  const a = view.analysis;
  const name = (id: string) => a.names[id];
  const isSel = (r: string, c: string) => pair !== null && ((pair[0] === r && pair[1] === c) || (pair[0] === c && pair[1] === r));
  const detail = pair ? pairDiagnostic(a, view.layout, pair[0], pair[1]) : null;
  return (
    <div>
      <div className="table-scroll">
        <table className="data matrix" data-testid="distance-matrix">
          <caption className="visually-hidden">Native modelled distances between every pair of products</caption>
          <thead>
            <tr>
              <th />
              {a.productIds.map((id) => (
                <th key={id} scope="col">
                  {name(id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.productIds.map((r) => (
              <tr key={r}>
                <th scope="row">
                  {name(r)}
                  {r === a.idvId ? ' (IDV)' : ''}
                </th>
                {a.productIds.map((c) => (
                  <td key={c}>
                    {r === c ? (
                      <span style={{ color: 'var(--muted)' }}>0.000</span>
                    ) : (
                      <button
                        type="button"
                        className="cell-btn"
                        aria-pressed={isSel(r, c)}
                        aria-label={`${name(r)} and ${name(c)}: native distance ${formatDistance(pairDistance(a, r, c))}`}
                        onClick={() => onPair(isSel(r, c) ? null : [r, c])}
                      >
                        {formatDistance(pairDistance(a, r, c))}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail ? (
        <div className="pair-detail" data-testid="pair-detail" aria-live="polite">
          <strong>
            {name(detail.a)} ↔ {name(detail.b)}
          </strong>{' '}
          <button type="button" className="link-btn" onClick={() => onPair(null)}>
            Clear
          </button>
          <dl>
            <dt>Native distance</dt>
            <dd>{formatDistance(detail.native)}</dd>
            <dt>Displayed on map</dt>
            <dd>
              {formatDistance(detail.displayed)} (difference {detail.residual >= 0 ? '+' : ''}
              {detail.residual.toFixed(3)})
            </dd>
            <dt>Modelled shared market</dt>
            <dd>
              {formatQuantity(pairOverlap(a, detail.a, detail.b))} {a.unit}
            </dd>
            {detail.a !== a.idvId && detail.b !== a.idvId ? (
              <>
                <dt>Native angle from IDV</dt>
                <dd>{formatDegrees(detail.nativeAngle)}</dd>
                <dt>Displayed angle</dt>
                <dd>{formatDegrees(detail.displayedAngle)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>Select a cell to compare a pair’s native and displayed distance and angle.</p>
      )}
    </div>
  );
}
