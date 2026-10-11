import { effectiveAllocations, formatPercent } from '../domain/allocation';
import { formatAmount } from '../domain/format';
import { formatPrice } from '../domain/price';
import type { Product, Project } from '../domain/types';
import type { Readiness } from '../domain/validation';
import type { ColorRole } from '../charts/scene';
import type { Selection } from './ChartCards';
import { Badge, Swatch } from './common';

export function segmentSummary(project: Project, p: Product): string {
  const names = new Map(project.segments.map((s) => [s.id, s.name]));
  const allocs = effectiveAllocations(p);
  if (!allocs.length) return '—';
  if (p.allocationMode === 'equal') return `${allocs.map((a) => names.get(a.segmentId) ?? '?').join(', ')}${allocs.length > 1 ? ' (equal split)' : ''}`;
  return allocs.map((a) => `${names.get(a.segmentId) ?? '?'} ${formatPercent(a.fraction)}`).join(', ');
}

export function productStatus(p: Product, readiness: Readiness | null): { label: string; tone: 'ok' | 'warn' | 'neutral' } {
  const errs = readiness?.issues.filter((i) => i.productId === p.id && i.severity === 'error') ?? [];
  if (errs.length) return { label: 'Needs fixing', tone: 'warn' };
  if (p.sam === null || p.allocations.length === 0) return { label: 'Draft — not analyzed', tone: 'neutral' };
  if (readiness?.status === 'ready') return { label: 'Analyzed', tone: 'ok' };
  return { label: 'Waiting on project issues', tone: 'neutral' };
}

export function ProductsTable({
  project,
  readiness,
  colors,
  selection,
  onSelect,
  onEdit,
}: {
  project: Project;
  readiness: Readiness | null;
  colors: Map<string, ColorRole>;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onEdit: (id: string) => void;
}) {
  const selectedId = selection?.type === 'product' ? selection.id : null;
  return (
    <section className="card" aria-labelledby="products-title">
      <div className="card-head">
        <h2 id="products-title">Products</h2>
        <p className="card-sub">
          {project.products.length} of 50 · unit: {project.marketUnit}
        </p>
      </div>
      <div className="table-wrap">
        <table className="data-table products-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="num">
                SAM
              </th>
              <th scope="col" className="num">
                SOM
              </th>
              <th scope="col">Price</th>
              <th scope="col">Segments</th>
              <th scope="col">Evidence</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {project.products.map((p) => {
              const st = productStatus(p, readiness);
              const isIdv = p.id === project.idvProductId;
              return (
                <tr key={p.id} className={selectedId === p.id ? 'is-selected' : undefined} data-product-row={p.name}>
                  <td>
                    <button type="button" className="link-btn product-name" onClick={() => onSelect({ type: 'product', id: p.id })}>
                      <Swatch role={colors.get(p.id) ?? 'other'} />
                      {p.name || 'Unnamed product'}
                    </button>
                    {isIdv && <Badge tone="idv">IDV</Badge>}
                  </td>
                  <td className="num">{formatAmount(p.sam)}</td>
                  <td className="num">
                    {p.som === null ? <span className="muted">unknown</span> : formatAmount(p.som)}
                    {p.somHorizon && p.som !== null ? <span className="muted"> ({p.somHorizon})</span> : null}
                  </td>
                  <td>{formatPrice(p.price)}</td>
                  <td className="seg-cell">{segmentSummary(project, p)}</td>
                  <td>{p.evidenceStatus}</td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(p.id)} aria-label={`Edit ${p.name}`}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
