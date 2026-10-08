import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { replaceHash } from '../app/router';
import { useAnalysis, type ResolvedView } from '../app/useAnalysis';
import { useProjectStore } from '../app/useProjectStore';
import { productIdentities } from '../charts/palette';
import type { Hit } from '../charts/scene';
import { LIMITS } from '../domain/constants';
import { formatDate, formatDistance, formatPercent, formatQuantity } from '../domain/format';
import type { Analysis } from '../domain/analysis';
import type { Project } from '../domain/types';
import type { Issue } from '../domain/validation';
import { DistanceChart, RadialChart } from './charts';
import { Link, SaveIndicator } from './common';
import { ExportMenu } from './ExportMenu';
import { ProductDetails, ProductSwatch, SegmentDetails } from './panels';
import { ProductForm, type ProductSave } from './ProductForm';
import { ProjectForm, type ProjectFormValues } from './ProjectForm';
import { SummaryView } from './SummaryView';
import { DistanceMatrix, ProductsTable, RelationshipsTable } from './tables';

type Selection =
  | { kind: 'product'; id: string; editing: boolean }
  | { kind: 'new'; asIdv: boolean }
  | { kind: 'stack'; ids: string[] }
  | { kind: 'segment'; id: string }
  | null;

export function Workspace({ projectId, fresh }: { projectId: string; fresh: boolean }) {
  const { project, loadState, save, update, flush, latest } = useProjectStore(projectId);
  const persistAnchor = useCallback(
    (id: string) =>
      update((d) => {
        d.layoutSettings.anchorProductId = id;
      }, { housekeeping: true }),
    [update],
  );
  const state = useAnalysis(project, latest, persistAnchor);
  const [selection, setSelection] = useState<Selection>(null);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const panelHeading = useRef<HTMLHeadingElement>(null);

  const products = project?.products;
  const idvId = project?.idvProductId ?? null;
  const identities = useMemo(() => (products ? productIdentities({ products, idvProductId: idvId }) : {}), [products, idvId]);

  useEffect(() => {
    if (fresh && project) {
      if (project.products.length === 0) setSelection({ kind: 'new', asIdv: true });
      replaceHash(`#/project/${project.id}`);
    }
  }, [fresh, project]);

  useEffect(() => {
    if (selection) panelHeading.current?.focus();
  }, [selection?.kind, selection && 'id' in selection ? selection.id : null]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selection && !editingProject && !(selection.kind === 'product' && selection.editing) && selection.kind !== 'new') setSelection(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selection, editingProject]);

  if (loadState === 'loading') return <p className="page">Loading project…</p>;
  if (loadState !== 'ready' || !project) {
    return (
      <div className="page">
        <p className="notice error">This project could not be found in this browser’s storage.</p>
        <Link className="btn" to="#/">
          Back to projects
        </Link>
      </div>
    );
  }

  const outcome = state.outcome;
  const validation = outcome?.validation ?? null;
  const blocked = outcome?.status === 'blocked';
  const mapView: ResolvedView | null = state.current ?? (blocked ? (state.stale ?? state.previous) : state.previous);
  const mapStatus: 'current' | 'updating' | 'stale' = state.current ? 'current' : blocked ? 'stale' : 'updating';
  const barsAnalysis = state.analysis ?? state.stale?.analysis ?? null;
  const barsProject = state.analysis ? project : (state.stale?.project ?? project);
  const narrative = state.narrative ?? state.stale?.narrative ?? null;
  const tableView = state.current ?? state.stale ?? null;
  const unit = project.marketUnit || 'units';
  const hasIdv = project.products.some((p) => p.id === project.idvProductId);
  const full = project.products.length >= LIMITS.maxProducts;

  const onActivate = (hit: Hit) => {
    if (hit.kind === 'product' || hit.kind === 'bar') setSelection({ kind: 'product', id: hit.ids[0], editing: false });
    else if (hit.kind === 'stack') setSelection({ kind: 'stack', ids: hit.ids });
    else if (hit.kind === 'segment') setSelection({ kind: 'segment', id: hit.ids[0] });
  };
  const select = (id: string) => setSelection({ kind: 'product', id, editing: false });
  const edit = (id: string) => setSelection({ kind: 'product', id, editing: true });

  const saveProduct = ({ product, newSegments, makeIdv }: ProductSave) => {
    update(
      (d) => {
        d.segments.push(...newSegments);
        const i = d.products.findIndex((p) => p.id === product.id);
        if (i >= 0) d.products[i] = product;
        else d.products.push(product);
        if (makeIdv) d.idvProductId = product.id;
        else if (d.idvProductId === product.id) d.idvProductId = null;
      },
      { delay: 0 },
    );
    setSelection({ kind: 'product', id: product.id, editing: false });
  };

  const deleteProduct = (id: string) => {
    update(
      (d) => {
        d.products = d.products.filter((x) => x.id !== id);
        if (d.idvProductId === id) d.idvProductId = null;
        if (d.layoutSettings.anchorProductId === id) delete d.layoutSettings.anchorProductId;
      },
      { delay: 0 },
    );
    setSelection(null);
    setPair(null);
  };

  const saveProject = (v: ProjectFormValues) => {
    update(
      (d) => {
        d.name = v.name;
        d.marketDescription = v.marketDescription;
        d.tam = v.tam;
        d.marketUnit = v.marketUnit;
        d.referenceDate = v.referenceDate;
        d.sources = v.sources;
        d.notes = v.notes;
        d.segments = v.segments;
      },
      { delay: 0 },
    );
    setEditingProject(false);
  };

  const addCompetitor = () => setSelection({ kind: 'new', asIdv: !hasIdv });
  const issues = validation?.issues ?? [];

  return (
    <div className="page">
      <header className="ws-header">
        <div className="ws-title">
          <h1>{project.name || 'Untitled project'}</h1>
          <p>
            {project.marketDescription ? `${project.marketDescription} · ` : ''}
            TAM {project.tam === null ? 'not set' : `${formatQuantity(project.tam)} ${unit}`} · {project.referenceDate || 'no date'}
          </p>
        </div>
        <div className="ws-actions">
          <SaveIndicator state={save} onRetry={() => void flush()} />
          <button type="button" className="btn" onClick={() => setEditingProject(true)}>
            Edit project
          </button>
          <button type="button" className="btn primary" onClick={addCompetitor} disabled={full} title={full ? `Limit of ${LIMITS.maxProducts} products reached` : undefined}>
            {hasIdv ? 'Add competitor' : 'Add IDV'}
          </button>
          <ExportMenu view={state.current} project={project} layoutCache={state.current?.layout ?? state.stale?.layout ?? null} />
        </div>
      </header>

      <IssuesPanel issues={issues} blocked={blocked} staleInfo={state.stale} hasProducts={project.products.length > 0} onOpen={edit} onAdd={addCompetitor} layoutError={state.layoutError} />

      <div className="ws-grid">
        <section className={`card ${mapStatus !== 'current' && mapView ? 'dim' : ''}`} aria-labelledby="map-heading">
          <div className="card-head">
            <div>
              <h2 id="map-heading">Competitive landscape</h2>
              <p className="sub">Distance from the centre is exact; directions are fitted to the competitor-to-competitor distances.</p>
            </div>
            <label className="toggle" style={{ fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={project.layoutSettings.showSegments}
                onChange={(e) =>
                  update((d) => {
                    d.layoutSettings.showSegments = e.target.checked;
                  })
                }
              />
              Show segments
            </label>
          </div>
          {mapView ? (
            <>
              <RadialChart
                view={mapView}
                identities={identities}
                showSegments={project.layoutSettings.showSegments}
                selection={{
                  selectedId: selection?.kind === 'product' ? selection.id : null,
                  selectedSegmentId: selection?.kind === 'segment' ? selection.id : null,
                  pair,
                }}
                onActivate={onActivate}
                status={mapStatus}
              />
              <FitNote view={mapView} onPair={setPair} />
            </>
          ) : (
            <p className="empty">{state.layoutPending ? 'Fitting the map…' : 'Add your IDV and at least one competitor with SAM and segments to see the landscape.'}</p>
          )}
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="bars-heading">
            <div className="card-head">
              <div>
                <h2 id="bars-heading">Distance from IDV</h2>
                <p className="sub">Exact modelled market distance on a fixed 0–1 scale. Not a percentage of customers.</p>
              </div>
            </div>
            {barsAnalysis ? (
              <DistanceChart
                analysis={barsAnalysis}
                project={barsProject}
                identities={identities}
                selectedId={selection?.kind === 'product' ? selection.id : null}
                onActivate={onActivate}
                stale={!state.analysis}
              />
            ) : (
              <p className="empty">Distances appear once the IDV and a competitor can be analysed.</p>
            )}
          </section>

          <section className="card" aria-labelledby="products-heading">
            <div className="card-head">
              <h2 id="products-heading">Products</h2>
              <button type="button" className="btn small" onClick={addCompetitor} disabled={full}>
                {hasIdv ? 'Add competitor' : 'Add IDV'}
              </button>
            </div>
            <ProductsTable project={project} identities={identities} validation={validation} selectedId={selection?.kind === 'product' ? selection.id : null} onSelect={select} />
          </section>
        </div>

        <section className="card span-all" aria-labelledby="summary-heading">
          <div className="card-head">
            <h2 id="summary-heading">Summary</h2>
            {!state.analysis && narrative ? <span className="badge stale">Not current</span> : null}
          </div>
          {narrative ? <SummaryView narrative={narrative} /> : <p className="empty">The written summary appears once the project can be analysed.</p>}
        </section>

        {tableView ? (
          <section className="card span-all" aria-labelledby="rel-heading">
            <div className="card-head">
              <div>
                <h2 id="rel-heading">Relationships</h2>
                <p className="sub">Exact values from the model. Rank by any column: closeness and absolute overlap answer different questions.</p>
              </div>
              {!state.current ? <span className="badge stale">Not current</span> : null}
            </div>
            <RelationshipsTable
              analysis={tableView.analysis}
              project={tableView.project}
              identities={identities}
              selectedId={selection?.kind === 'product' ? selection.id : null}
              onSelect={select}
            />
            <details className="section">
              <summary>Distance matrix (all pairs)</summary>
              <DistanceMatrix view={tableView} pair={pair} onPair={setPair} />
            </details>
          </section>
        ) : null}
      </div>

      {selection ? (
        <aside className="side-panel" aria-labelledby="panel-title" data-testid="side-panel">
          <header>
            <h2 id="panel-title" ref={panelHeading} tabIndex={-1}>
              {selection.kind === 'new' ? (
                selection.asIdv ? 'Add your IDV' : 'Add competitor'
              ) : selection.kind === 'stack' ? (
                `${selection.ids.length} products at one position`
              ) : selection.kind === 'segment' ? (
                (project.segments.find((s) => s.id === selection.id)?.name ?? 'Segment')
              ) : (
                <>
                  <ProductSwatch identity={identities[selection.id]} />
                  {project.products.find((p) => p.id === selection.id)?.name || 'Untitled product'}
                  {selection.id === project.idvProductId ? <span className="badge idv">IDV</span> : null}
                </>
              )}
            </h2>
            <button type="button" className="btn ghost small" aria-label="Close panel" onClick={() => setSelection(null)}>
              ✕
            </button>
          </header>
          <div className="body">
            <PanelBody
              selection={selection}
              project={project}
              analysis={state.analysis ?? state.stale?.analysis ?? null}
              analysisProject={state.analysis ? project : (state.stale?.project ?? project)}
              analysisIsCurrent={Boolean(state.analysis)}
              onSave={saveProduct}
              onCancel={() => setSelection(selection.kind === 'product' ? { ...selection, editing: false } : null)}
              onDelete={deleteProduct}
              onSelect={select}
            />
          </div>
          {selection.kind === 'product' && !selection.editing && project.products.some((p) => p.id === selection.id) ? (
            <footer>
              <button type="button" className="btn primary" onClick={() => edit(selection.id)}>
                Edit
              </button>
              {selection.id !== project.idvProductId ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    update((d) => {
                      d.idvProductId = selection.id;
                    })
                  }
                >
                  Make IDV
                </button>
              ) : null}
              {state.current && state.current.layout.anchorId !== selection.id && state.current.layout.angles[selection.id] != null ? (
                <button
                  type="button"
                  className="btn"
                  title="Rotate the map so this product points to the right. Distances do not change."
                  onClick={() =>
                    update((d) => {
                      d.layoutSettings.anchorProductId = selection.id;
                    })
                  }
                >
                  Use as map reference direction
                </button>
              ) : null}
            </footer>
          ) : null}
        </aside>
      ) : null}

      {editingProject ? <ProjectForm mode="edit" project={project} onSubmit={saveProject} onCancel={() => setEditingProject(false)} /> : null}
    </div>
  );
}

function PanelBody({
  selection,
  project,
  analysis,
  analysisProject,
  analysisIsCurrent,
  onSave,
  onCancel,
  onDelete,
  onSelect,
}: {
  selection: NonNullable<Selection>;
  project: Project;
  /** Exact metrics (current, or the last valid snapshot when blocked). Independent of the map fit. */
  analysis: Analysis | null;
  analysisProject: Project;
  analysisIsCurrent: boolean;
  onSave: (s: ProductSave) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (selection.kind === 'new') {
    return <ProductForm key="new" project={project} product={null} defaultIdv={selection.asIdv} onSave={onSave} onCancel={onCancel} />;
  }
  if (selection.kind === 'stack') {
    return (
      <div>
        <p style={{ marginTop: 0 }}>These products have identical modelled footprints, so they share one exact position. Nothing has been jittered.</p>
        <ul style={{ paddingLeft: 18 }}>
          {selection.ids.map((id) => (
            <li key={id} style={{ margin: '6px 0' }}>
              <button type="button" className="link-btn" onClick={() => onSelect(id)}>
                {project.products.find((p) => p.id === id)?.name ?? id}
                {id === project.idvProductId ? ' (IDV)' : ''}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (selection.kind === 'segment') {
    return analysis ? <SegmentDetails project={analysisProject} analysis={analysis} segmentId={selection.id} /> : null;
  }
  const product = project.products.find((p) => p.id === selection.id);
  if (!product) return <p>This product no longer exists.</p>;
  if (selection.editing) {
    return (
      <ProductForm
        key={product.id}
        project={project}
        product={product}
        defaultIdv={false}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={() => onDelete(product.id)}
      />
    );
  }
  const included = analysis && analysis.productIds.includes(product.id) ? analysis : null;
  return <ProductDetails project={project} product={product} analysis={included} analysisIsCurrent={analysisIsCurrent} />;
}

function FitNote({ view, onPair }: { view: ResolvedView; onPair: (p: [string, string]) => void }) {
  const d = view.diagnostics;
  const a = view.analysis;
  const worst = d.worstPair;
  const anchor = view.layout.anchorId ? a.names[view.layout.anchorId] : null;
  return (
    <div className="fit-note" data-testid="fit-note">
      <p>
        <strong>Map distance error: {formatPercent(d.relativeRMSError, 1)}</strong> — relative RMS difference between distances shown on the map and the model’s
        distances, over all pairs. It measures how well a flat map can show the model, not confidence in the data.
      </p>
      {worst ? (
        <p>
          Largest difference: {a.names[worst.a]} ↔ {a.names[worst.b]} (model {formatDistance(worst.native)}, map {formatDistance(worst.displayed)}).{' '}
          <button type="button" className="link-btn" onClick={() => onPair([worst.a, worst.b])}>
            Show pair
          </button>
        </p>
      ) : (
        <p>Every pairwise distance is reproduced within rounding.</p>
      )}
      <p>
        Radii match the bar chart exactly (largest deviation {d.maxRadiusError < 1e-12 ? 'below 10⁻¹²' : d.maxRadiusError.toExponential(1)}). Rotation is arbitrary
        {anchor ? `; ${anchor} sets the reference direction (pointing right)` : ''}.
      </p>
    </div>
  );
}

function IssuesPanel({
  issues,
  blocked,
  staleInfo,
  hasProducts,
  onOpen,
  onAdd,
  layoutError,
}: {
  issues: Issue[];
  blocked: boolean;
  staleInfo: { revision: number; analyzedAt: string } | null;
  hasProducts: boolean;
  onOpen: (productId: string) => void;
  onAdd: () => void;
  layoutError: string | null;
}) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');
  const onboarding = errors.length > 0 && errors.every((e) => e.code === 'no-products' || e.code === 'no-idv');
  const item = (i: Issue, k: number) => (
    <li key={k}>
      {i.message}{' '}
      {i.productId ? (
        <button type="button" className="link-btn" onClick={() => onOpen(i.productId!)}>
          Edit
        </button>
      ) : null}
    </li>
  );
  return (
    <div data-testid="issues">
      {onboarding ? (
        <div className="notice">
          <span className="title">{hasProducts ? 'Mark one product as the IDV' : 'Start with your IDV'}</span>
          <p style={{ margin: '4px 0 8px' }}>
            {hasProducts
              ? 'Open a product and tick “This is the IDV”. Distances are measured from it.'
              : 'Enter the main product you are evaluating, then add one competitor. The landscape grows as you add more.'}
          </p>
          {!hasProducts ? (
            <button type="button" className="btn primary small" onClick={onAdd}>
              Add IDV
            </button>
          ) : null}
        </div>
      ) : errors.length ? (
        <div className="notice error" role="alert" data-testid="analysis-errors">
          <span className="title">The analysis is not current — fix {errors.length === 1 ? 'this issue' : `these ${errors.length} issues`}. Your draft is saved.</span>
          <ul>{errors.map(item)}</ul>
          {blocked ? (
            <p style={{ margin: '6px 0 0' }}>
              {staleInfo
                ? `Charts below show the last valid analysis (revision ${staleInfo.revision}, ${formatDate(staleInfo.analyzedAt)}), marked “Not current”.`
                : 'No valid analysis exists yet for this project.'}
            </p>
          ) : null}
        </div>
      ) : null}
      {layoutError ? <p className="notice error">The map layout failed: {layoutError}. Exact distances are unaffected.</p> : null}
      {infos.length ? (
        <div className="notice">
          <ul style={{ margin: 0 }}>{infos.map(item)}</ul>
        </div>
      ) : null}
      {warnings.length ? (
        <details className="notice warn">
          <summary>
            {warnings.length} input warning{warnings.length === 1 ? '' : 's'} (analysis still runs)
          </summary>
          <ul>{warnings.map(item)}</ul>
        </details>
      ) : null}
    </div>
  );
}
