import type { Landscape } from '../app/landscape';
import { effectiveAllocations, formatPercent } from '../domain/allocation';
import { formatAmount, formatDegrees, formatDistance, formatShare } from '../domain/format';
import { formatPrice } from '../domain/price';
import { isHttpUrl } from '../domain/text';
import type { Project } from '../domain/types';
import type { ColorRole } from '../charts/scene';
import type { Selection } from './ChartCards';
import { Badge, Swatch } from './common';

interface Props {
  project: Project;
  landscape: Landscape | null;
  isStale: boolean;
  selection: Selection | null;
  colors: Map<string, ColorRole>;
  onSelect: (s: Selection | null) => void;
  onEdit: (productId: string) => void;
}

export function SidePanel({ project, landscape, isStale, selection, colors, onSelect, onEdit }: Props) {
  const name = (id: string) => project.products.find((p) => p.id === id)?.name ?? landscape?.analysis.products.get(id)?.name ?? 'Removed product';
  const unit = project.marketUnit;

  if (!selection) {
    return (
      <div className="side-empty">
        <h2>Details</h2>
        <p>Select a product on the map, the distance bars, or the products table to see its inputs, sources, and metrics, and to edit it. Keyboard: Tab to a marker or row, then press Enter.</p>
        {landscape && (
          <dl className="kv">
            <dt>TAM</dt>
            <dd>
              {formatAmount(landscape.analysis.tam)} {unit}
            </dd>
            <dt>Modeled union</dt>
            <dd>
              {formatAmount(landscape.analysis.modeledUnion)} ({formatShare(landscape.analysis.modeledUnion / landscape.analysis.tam)} of TAM)
            </dd>
            <dt>Outside modeled footprints</dt>
            <dd>{formatAmount(landscape.analysis.outsideModeled)} — not proven unmet demand</dd>
            <dt>Analyzed products</dt>
            <dd>{landscape.analysis.order.length}</dd>
          </dl>
        )}
      </div>
    );
  }

  const header = (title: string, onClose = () => onSelect(null)) => (
    <div className="side-head">
      <h2>{title}</h2>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
        ×
      </button>
    </div>
  );

  if (selection.type === 'stack') {
    return (
      <div>
        {header(`${selection.ids.length} products at one position`)}
        <p className="field-hint">These products have the same modeled position on the map. They are shown as one stack at their true location rather than being moved apart.</p>
        <ul className="stack-list">
          {selection.ids.map((id) => (
            <li key={id}>
              <button type="button" className="link-btn" onClick={() => onSelect({ type: 'product', id })}>
                <Swatch role={colors.get(id) ?? 'other'} /> {name(id)}
                {id === project.idvProductId ? ' (IDV)' : ''}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (selection.type === 'segment') {
    const seg = project.segments.find((s) => s.id === selection.id);
    const c = landscape?.centroids.find((x) => x.segmentId === selection.id);
    return (
      <div>
        {header(seg?.name ?? 'Segment')}
        <Badge>Modeled segment center</Badge>
        <p className="field-hint">
          The coverage-weighted average of the plotted positions of products that allocate SAM to this segment. It summarizes inputs — not measured preference, users won, or market share. Different allocations can produce the same point.
        </p>
        {c ? (
          <table className="data-table compact">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="num">
                  Modeled amount
                </th>
                <th scope="col" className="num">
                  Weight
                </th>
              </tr>
            </thead>
            <tbody>
              {c.contributions.map((x) => (
                <tr key={x.productId}>
                  <td>{name(x.productId)}</td>
                  <td className="num">{formatAmount(x.amount)}</td>
                  <td className="num">{formatShare(x.amount / c.weight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No analyzed product allocates to this segment.</p>
        )}
      </div>
    );
  }

  if (selection.type === 'pair') {
    const d = landscape?.diagnostics?.pairs.find((p) => (p.a === selection.a && p.b === selection.b) || (p.a === selection.b && p.b === selection.a));
    return (
      <div>
        {header(`${name(selection.a)} ↔ ${name(selection.b)}`)}
        {d ? (
          <dl className="kv">
            <dt>Modeled distance</dt>
            <dd>{formatDistance(d.native)}</dd>
            <dt>Distance on the map</dt>
            <dd>{formatDistance(d.displayed)}</dd>
            <dt>Difference</dt>
            <dd>
              {d.residual >= 0 ? '+' : '−'}
              {Math.abs(d.residual).toFixed(3)}
            </dd>
            {!d.involvesIdv && (
              <>
                <dt>Native angle from IDV</dt>
                <dd>{formatDegrees(d.nativeAngle)}</dd>
                <dt>Angle on the map</dt>
                <dd>{formatDegrees(d.displayedAngle)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p>This pair is not in the current analysis.</p>
        )}
        <p className="field-hint">Reports use the modeled distance. The map distance is a 2D approximation for competitor pairs; distances from the IDV are exact.</p>
      </div>
    );
  }

  // Product details.
  const p = project.products.find((x) => x.id === selection.id);
  if (!p) return <div>{header('Product')}<p>This product no longer exists.</p></div>;
  const isIdv = p.id === project.idvProductId;
  const segNames = new Map(project.segments.map((s) => [s.id, s.name]));
  const allocs = effectiveAllocations(p);
  const m = landscape?.analysis.competitors.find((c) => c.productId === p.id);
  const rank = (list: string[] | undefined) => (list ? list.indexOf(p.id) + 1 : 0);
  const r = landscape?.analysis.rankings;
  const relations = landscape?.diagnostics?.pairs.filter((d) => !d.involvesIdv && (d.a === p.id || d.b === p.id)) ?? [];

  return (
    <div data-testid="side-panel-product">
      {header(p.name || 'Unnamed product')}
      <div className="side-badges">
        <Swatch role={colors.get(p.id) ?? 'other'} />
        {isIdv ? <Badge tone="idv">IDV</Badge> : <Badge>Competitor</Badge>}
        <Badge>{p.evidenceStatus}</Badge>
        {isStale && <Badge tone="warn">Metrics from last valid analysis</Badge>}
      </div>
      <p>{p.description || <em className="muted">No description yet.</em>}</p>
      <button type="button" className="btn btn-primary btn-block" onClick={() => onEdit(p.id)}>
        Edit {p.name || 'product'}
      </button>

      {m && (
        <>
          <h3>Modeled metrics</h3>
          <dl className="kv">
            <dt>Distance from IDV</dt>
            <dd>
              {formatDistance(m.distance)} <span className="muted">(#{rank(r?.byDistance)} nearest)</span>
            </dd>
            <dt>Shared market</dt>
            <dd>
              {formatAmount(m.sharedMarket)} {unit} <span className="muted">(#{rank(r?.bySharedMarket)} largest)</span>
            </dd>
            <dt>IDV exposure</dt>
            <dd>{formatShare(m.idvExposure)} of the IDV’s SAM</dd>
            <dt>Competitor exposure</dt>
            <dd>{formatShare(m.competitorExposure)} of its own SAM</dd>
          </dl>
          <p className="field-hint">Estimated overlap from SAM and segment splits (nested-coverage assumption).</p>
        </>
      )}
      {isIdv && landscape && (
        <p className="field-hint">The IDV sits at the center of the map. Distances of all competitors are measured from it.</p>
      )}

      <h3>Inputs</h3>
      <dl className="kv">
        <dt>SAM</dt>
        <dd>{p.sam === null ? <span className="muted">not entered (draft)</span> : `${formatAmount(p.sam)} ${unit}`}</dd>
        <dt>SOM</dt>
        <dd>
          {p.som === null ? <span className="muted">unknown</span> : `${formatAmount(p.som)} ${unit}`}
          {p.som !== null && p.somHorizon ? ` · ${p.somHorizon}` : ''}
          {p.som !== null && <div className="field-hint">Scenario estimate, not current users.</div>}
        </dd>
        <dt>Segments</dt>
        <dd>
          {allocs.length === 0 ? (
            <span className="muted">none selected</span>
          ) : (
            <ul className="plain">
              {allocs.map((a) => (
                <li key={a.segmentId}>
                  {segNames.get(a.segmentId) ?? '?'}: {formatPercent(a.fraction)}
                  {p.sam !== null ? ` (${formatAmount(p.sam * a.fraction)})` : ''}
                </li>
              ))}
            </ul>
          )}
          {p.allocationMode === 'equal' && allocs.length > 1 && <div className="field-hint">Equal split assumption.</div>}
        </dd>
        <dt>Comparable price</dt>
        <dd>
          {formatPrice(p.price)}
          {p.price.note && <div className="field-hint">{p.price.note}</div>}
        </dd>
      </dl>

      <h3>References</h3>
      {p.sources.length === 0 ? (
        <p className="field-hint">No sources — inputs are unsourced estimates.</p>
      ) : (
        <ul className="plain refs-list">
          {p.sources.map((s) => (
            <li key={s.id}>
              {isHttpUrl(s.url) ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                  {s.title || s.url}
                </a>
              ) : (
                s.title || s.url
              )}
              {s.appliesTo?.length ? <span className="field-hint"> · {s.appliesTo.join(', ')}</span> : null}
              {s.note && <div className="field-hint">{s.note}</div>}
            </li>
          ))}
        </ul>
      )}
      {p.notes && (
        <>
          <h3>Notes</h3>
          <p className="pre-wrap">{p.notes}</p>
        </>
      )}

      {relations.length > 0 && (
        <>
          <h3>Other competitors</h3>
          <table className="data-table compact">
            <thead>
              <tr>
                <th scope="col">Competitor</th>
                <th scope="col" className="num">
                  Modeled
                </th>
                <th scope="col" className="num">
                  Map
                </th>
              </tr>
            </thead>
            <tbody>
              {relations.map((d) => {
                const other = d.a === p.id ? d.b : d.a;
                return (
                  <tr key={other}>
                    <td>
                      <button type="button" className="link-btn" onClick={() => onSelect({ type: 'pair', a: p.id, b: other })}>
                        {name(other)}
                      </button>
                    </td>
                    <td className="num">{formatDistance(d.native)}</td>
                    <td className="num">{formatDistance(d.displayed)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
