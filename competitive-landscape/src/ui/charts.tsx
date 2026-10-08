import { useMemo, useRef, useState } from 'react';
import type { ResolvedView } from '../app/useAnalysis';
import { buildDistanceScene } from '../charts/distanceScene';
import type { ProductIdentity } from '../charts/palette';
import { buildRadialScene } from '../charts/radialScene';
import { SceneSvg, type Hit } from '../charts/scene';
import type { Analysis } from '../domain/analysis';
import { formatDistance, formatPercent, formatQuantity } from '../domain/format';
import { describePrice } from '../domain/price';
import type { Project } from '../domain/types';
import { IdvStar, useElementWidth } from './common';

export interface MapSelection {
  selectedId: string | null;
  selectedSegmentId: string | null;
  pair: [string, string] | null;
}

function Readout({ text }: { text: string | null }) {
  return (
    <p className="readout" aria-live="polite" style={{ minHeight: 20, margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
      {text ?? ' '}
    </p>
  );
}

function competitorReadout(analysis: Analysis, project: Project, id: string): string {
  const c = analysis.competitors.find((x) => x.id === id);
  const idv = analysis.names[analysis.idvId];
  const p = project.products.find((x) => x.id === id);
  if (!c) return id === analysis.idvId ? `${idv} (IDV) — centre of the map; distances are measured from here.` : '';
  return `${c.name} — distance ${formatDistance(c.distance)} · shared ${formatQuantity(c.sharedMarket)} ${analysis.unit} (${formatPercent(
    c.idvExposure,
  )} of ${idv}’s SAM, ${formatPercent(c.competitorExposure)} of ${c.name}’s) · price ${p ? describePrice(p.price) : 'unknown'}`;
}

export function RadialChart({
  view,
  identities,
  selection,
  showSegments,
  onActivate,
  status,
}: {
  view: ResolvedView;
  identities: Record<string, ProductIdentity>;
  selection: MapSelection;
  showSegments: boolean;
  onActivate: (hit: Hit) => void;
  status: 'current' | 'updating' | 'stale';
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const [zoomState, setZoom] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [hover, setHover] = useState<Hit | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const height = Math.round(Math.min(720, Math.max(320, width * 0.8)));

  const scene = useMemo(
    () =>
      buildRadialScene({
        analysis: view.analysis,
        layout: view.layout,
        project: view.project,
        identities,
        width,
        height,
        variant: 'screen',
        showSegments,
        diagnostics: view.diagnostics,
        selectedId: selection.selectedId,
        selectedSegmentId: selection.selectedSegmentId,
        pair: selection.pair,
        view: zoomState,
      }),
    [view, identities, width, height, showSegments, selection, zoomState],
  );

  const zoomBy = (f: number) => setZoom((z) => ({ zoom: Math.min(8, Math.max(0.5, z.zoom * f)), panX: z.panX * f, panY: z.panY * f }));

  let readout: string | null = null;
  if (hover?.kind === 'product') readout = competitorReadout(view.analysis, view.project, hover.ids[0]);
  else if (hover) readout = hover.label;

  return (
    <div>
      <div className="chart-toolbar">
        <span className="zoom-group" role="group" aria-label="Map view">
          <button type="button" className="btn small" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="btn small" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="btn small" onClick={() => setZoom({ zoom: 1, panX: 0, panY: 0 })}>
            Reset view
          </button>
        </span>
        <span className="spacer" />
        {status !== 'current' ? <span className="badge stale">{status === 'stale' ? 'Not current' : 'Updating…'}</span> : null}
      </div>
      <div
        className="chart-wrap"
        ref={ref}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('.chart-hit')) return;
          drag.current = { x: e.clientX, y: e.clientY, panX: zoomState.panX, panY: zoomState.panY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setZoom((z) => ({ ...z, panX: d.panX + e.clientX - d.x, panY: d.panY + e.clientY - d.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <SceneSvg scene={scene} handlers={{ onActivate, onHover: setHover }} testId="radial-chart" themed />
      </div>
      <Readout text={readout} />
      <div className="legend" aria-label="Legend">
        <span>
          <IdvStar /> IDV ({view.analysis.names[view.analysis.idvId]}) at the centre
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--chart-muted)' }} /> Competitor — distance from centre is exact
        </span>
        {showSegments ? (
          <span>
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1L13 7L7 13L1 7Z" style={{ fill: 'var(--chart-surface)', stroke: 'var(--chart-ink-2)' }} strokeWidth="2" />
            </svg>
            Modelled segment center
          </span>
        ) : null}
        <span>
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" fill="none" style={{ stroke: 'var(--chart-axis)' }} strokeWidth="1.5" />
          </svg>
          Rings: modelled distance 0.25–1.00
        </span>
        <span>Drag to pan; zoom changes the view only.</span>
      </div>
    </div>
  );
}

export function DistanceChart({
  analysis,
  project,
  identities,
  selectedId,
  onActivate,
  stale,
}: {
  analysis: Analysis;
  project: Project;
  identities: Record<string, ProductIdentity>;
  selectedId: string | null;
  onActivate: (hit: Hit) => void;
  stale: boolean;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<Hit | null>(null);
  const scene = useMemo(
    () => buildDistanceScene({ analysis, project, identities, width, variant: 'screen', selectedId }),
    [analysis, project, identities, width, selectedId],
  );
  return (
    <div>
      {stale ? (
        <div className="chart-toolbar">
          <span className="badge stale">Not current</span>
        </div>
      ) : null}
      <div className="chart-wrap" ref={ref}>
        {analysis.competitorIds.length ? (
          <SceneSvg scene={scene} handlers={{ onActivate, onHover: setHover }} testId="distance-chart" themed />
        ) : (
          <p className="empty" style={{ margin: 0 }}>
            Add a competitor to see its modelled distance from the IDV.
          </p>
        )}
      </div>
      <Readout text={hover ? competitorReadout(analysis, project, hover.ids[0]) : null} />
    </div>
  );
}
