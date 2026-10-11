import { useEffect, useMemo, useRef, useState } from 'react';
import { buildLandscape, cacheFromLayout, layoutRequestFor, type Landscape } from '../app/landscape';
import { deleteProduct, removeSegment, upsertProduct } from '../app/mutations';
import { productColors } from '../charts/chartModel';
import type { Target } from '../charts/scene';
import { analyzeProject } from '../domain/analysis';
import { formatAmount, formatDateTime } from '../domain/format';
import { MODEL_SETTINGS } from '../domain/settings';
import { MODEL_VERSION, type LayoutCache, type Product, type Project, type Segment } from '../domain/types';
import { assessProject } from '../domain/validation';
import type { AnalysisSnapshot } from '../storage/db';
import { repo } from '../storage/instance';
import { LayoutClient } from '../worker/layoutClient';
import { DistanceCard, MapCard, type Selection } from './ChartCards';
import { Badge } from './common';
import { ExportDialog } from './ExportDialog';
import { useProjectDraft, type SaveState } from './hooks';
import { IssuesPanel } from './IssuesPanel';
import { ProductDialog } from './ProductDialog';
import { ProjectDialog, type ProjectFields } from './ProjectDialog';
import { ProductsTable } from './ProductsTable';
import { SidePanel } from './SidePanel';
import { SummaryCard } from './SummaryCard';

type DialogState = null | { kind: 'product'; productId: string | null } | { kind: 'project' } | { kind: 'export' };

function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  return (
    <span className={`save-state save-${state}`} role="status" aria-live="polite" data-testid="save-state">
      {state === 'saved' && '✓ Saved'}
      {state === 'saving' && 'Saving…'}
      {state === 'unsaved' && 'Unsaved changes…'}
      {state === 'error' && (
        <>
          Save failed{error ? `: ${error}` : ''}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </span>
  );
}

export function Workspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { project, saveState, saveError, update, flush } = useProjectDraft(projectId);
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null | undefined>(undefined);
  const [layoutCache, setLayoutCache] = useState<LayoutCache | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [view, setView] = useState<'full' | 'fit'>('full');
  const clientRef = useRef<LayoutClient | null>(null);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project ?? null;
  const cacheRef = useRef<LayoutCache | null>(null);
  cacheRef.current = layoutCache;
  const snapshotRef = useRef<AnalysisSnapshot | null | undefined>(undefined);
  snapshotRef.current = snapshot;

  useEffect(() => {
    let alive = true;
    repo.getSnapshot(projectId).then(
      (s) => alive && setSnapshot(s ?? null),
      () => alive && setSnapshot(null),
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    clientRef.current = new LayoutClient();
    return () => clientRef.current?.dispose();
  }, []);

  const readiness = useMemo(() => (project ? assessProject(project) : null), [project]);
  const analysis = useMemo(() => (project && readiness?.status === 'ready' ? analyzeProject(project, readiness) : null), [project, readiness]);
  const request = useMemo(
    () => (project && analysis ? layoutRequestFor(project, analysis, layoutCache ?? snapshot?.layout ?? null) : null),
    [project, analysis, layoutCache, snapshot],
  );
  const hash = request?.hash ?? null;

  // Fit (or reuse) the radial layout for the current inputs; stale responses are rejected.
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    if (!request || snapshot === undefined) {
      client.cancel();
      return;
    }
    if (cacheRef.current?.inputHash === request.hash) return;
    const snap = snapshotRef.current;
    if (snap && snap.inputHash === request.hash && snap.modelVersion === MODEL_VERSION) {
      setLayoutCache(snap.layout);
      return;
    }
    const timer = setTimeout(() => {
      client.request(request.hash, projectRef.current?.revision ?? 0, request.input, (r) => {
        if (!r.ok) {
          setLayoutError(r.error);
          return;
        }
        const cache = cacheFromLayout(r.hash, r.layout);
        setLayoutError(null);
        setLayoutCache(cache);
        const current = projectRef.current;
        if (!current) return;
        const record: AnalysisSnapshot = {
          projectId: current.id,
          revision: current.revision,
          inputHash: r.hash,
          modelVersion: MODEL_VERSION,
          savedAt: new Date().toISOString(),
          project: structuredClone(current),
          layout: cache,
        };
        repo.saveSnapshot(record).then(
          () => setSnapshot(record),
          () => undefined,
        );
      });
    }, 120);
    return () => clearTimeout(timer);
    // Keyed on the input hash (not the request object) so warm-start updates don't refit.
  }, [hash, snapshot === undefined]);

  // Persist the resolved anchor so map rotation stays stable across edits.
  const anchorId = request?.anchorId ?? null;
  useEffect(() => {
    if (!project || !request) return;
    const stored = project.layoutSettings.anchorProductId ?? null;
    if (anchorId !== stored) {
      update((p) => {
        const { anchorProductId: _old, ...rest } = p.layoutSettings;
        void _old;
        return { ...p, layoutSettings: anchorId ? { ...rest, anchorProductId: anchorId } : rest };
      });
    }
  }, [anchorId, request === null]);

  const current: Landscape | null = useMemo(() => {
    if (!project || !analysis) return null;
    const cache = layoutCache && layoutCache.inputHash === hash ? layoutCache : null;
    return buildLandscape(project, analysis, cache);
  }, [project, analysis, layoutCache, hash]);

  const stale: Landscape | null = useMemo(() => {
    if (analysis || !snapshot) return null;
    try {
      return buildLandscape(snapshot.project, analyzeProject(snapshot.project), snapshot.layout);
    } catch {
      return null;
    }
  }, [analysis, snapshot]);

  const shown = current ?? stale;
  const colors = useMemo(() => (project ? productColors(project) : new Map()), [project]);

  // Close details on Escape when no dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialog && selection) setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, selection]);

  if (project === undefined) return <main className="page"><p role="status">Loading project…</p></main>;
  if (project === null)
    return (
      <main className="page">
        <div className="alert alert-error" role="alert">
          This project was not found in this browser. It may have been deleted, or it was saved in a different browser or site.
        </div>
        <button type="button" className="btn btn-primary" onClick={onBack}>
          Back to projects
        </button>
      </main>
    );

  const select = (t: Target | Selection | null) => setSelection(t);
  const editProduct = (id: string | null) => setDialog({ kind: 'product', productId: id });
  const editing = dialog?.kind === 'product' && dialog.productId ? project.products.find((p) => p.id === dialog.productId) ?? null : null;
  const atLimit = project.products.length >= MODEL_SETTINGS.maxProducts;
  const noProducts = project.products.length === 0;

  const saveProduct = (p: Product, opts: { makeIdv: boolean; newSegments: Segment[] }) => {
    update((proj) => upsertProduct(proj, p, opts), { immediate: true });
    setDialog(null);
    setSelection({ type: 'product', id: p.id });
  };

  const saveProject = (fields: ProjectFields) => {
    update(
      (proj) => {
        let next = proj;
        for (const s of proj.segments) if (!fields.segments.some((x) => x.id === s.id)) next = removeSegment(next, s.id);
        return { ...next, ...fields, segments: fields.segments };
      },
      { immediate: true },
    );
    setDialog(null);
  };

  return (
    <main className="page workspace">
      <header className="ws-header">
        <div className="ws-title">
          <button type="button" className="link-btn back" onClick={() => void flush().then(onBack)}>
            ← All projects
          </button>
          <h1>
            {project.name} {project.isExample && <Badge tone="example">Fictional example</Badge>}
          </h1>
          <p className="ws-meta">
            {project.tam !== null ? `TAM ${formatAmount(project.tam)} ${project.marketUnit}` : 'TAM not set'} · {project.referenceDate || 'no reference date'} · {project.products.length} product
            {project.products.length === 1 ? '' : 's'} · updated {formatDateTime(project.updatedAt)}
          </p>
        </div>
        <div className="ws-actions">
          <SaveIndicator state={saveState} error={saveError} onRetry={() => void flush()} />
          <button type="button" className="btn btn-ghost" onClick={() => setDialog({ kind: 'project' })}>
            Edit project
          </button>
          <button type="button" className="btn btn-secondary" disabled={atLimit} onClick={() => editProduct(null)} title={atLimit ? 'This MVP supports up to 50 products' : undefined}>
            {noProducts ? 'Add main product (IDV)' : 'Add competitor'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'export' })}>
            Export
          </button>
        </div>
      </header>

      {readiness && <IssuesPanel readiness={readiness} hasStaleView={!!stale} onFixProduct={(id) => editProduct(id)} onEditProject={() => setDialog({ kind: 'project' })} />}

      {noProducts ? (
        <section className="card empty-state">
          <h2>Start with your main product</h2>
          <p>
            The <strong>IDV</strong> is the product you are evaluating. Enter its SAM and the customer segments it serves, then add competitors one at a time — the distance chart, landscape map, and summary fill in as you go.
          </p>
          <ol>
            <li>Add the IDV with a SAM and at least one segment.</li>
            <li>Add a competitor the same way.</li>
            <li>Select any product on the charts to inspect or edit it, then export.</li>
          </ol>
          <button type="button" className="btn btn-primary" onClick={() => editProduct(null)}>
            Add main product (IDV)
          </button>
        </section>
      ) : (
        <div className="ws-grid">
          <div className="ws-main">
            {stale && (
              <div className="alert alert-stale" role="status" data-testid="stale-banner">
                Showing the last valid analysis (saved {formatDateTime(snapshot!.savedAt)}, revision {snapshot!.revision}). It does not reflect your latest edits.
              </div>
            )}
            {shown ? (
              <div className={stale ? 'is-stale' : undefined}>
                <MapCard
                  landscape={shown}
                  pending={!!current && !current.positions}
                  layoutError={layoutError}
                  showSegments={project.layoutSettings.showSegments}
                  onToggleSegments={(v) => update((p) => ({ ...p, layoutSettings: { ...p.layoutSettings, showSegments: v } }))}
                  view={view}
                  onView={setView}
                  selection={selection}
                  onSelect={select}
                />
                <DistanceCard landscape={shown} selection={selection} onSelect={select} />
                <SummaryCard landscape={shown} onSelect={select} />
              </div>
            ) : (
              <section className="card empty-note-card">
                <p>The charts appear once the IDV has a SAM and at least one segment, and the issues above are resolved.</p>
              </section>
            )}
            <ProductsTable project={project} readiness={readiness} colors={colors} selection={selection} onSelect={select} onEdit={(id) => editProduct(id)} />
          </div>
          <aside className={`ws-side ${selection ? 'has-selection' : ''}`} aria-label="Details">
            <SidePanel project={project} landscape={shown} isStale={!current && !!stale} selection={selection} colors={colors} onSelect={select} onEdit={(id) => editProduct(id)} />
          </aside>
        </div>
      )}

      {dialog?.kind === 'product' && (
        <ProductDialog
          key={dialog.productId ?? 'new'}
          project={project}
          product={editing}
          onSave={saveProduct}
          onDelete={(id) => {
            update((p) => deleteProduct(p, id), { immediate: true });
            setDialog(null);
            setSelection(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'project' && <ProjectDialog project={project} onSave={saveProject} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'export' && <ExportDialog project={project} landscape={current} layoutCache={current?.layout ?? null} onClose={() => setDialog(null)} />}
    </main>
  );
}
