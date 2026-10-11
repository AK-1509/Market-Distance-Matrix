import { useMemo } from 'react';
import type { Landscape } from '../app/landscape';
import { buildDistanceScene } from '../charts/distanceScene';
import { buildRadialScene } from '../charts/radialScene';
import type { Target } from '../charts/scene';
import { SceneSvg } from '../charts/SceneSvg';
import { formatDistance, formatShare } from '../domain/format';
import { useElementWidth } from './hooks';

export type Selection = Target | { type: 'pair'; a: string; b: string };

function toTarget(sel: Selection | null): Target | null {
  if (!sel || sel.type === 'pair') return null;
  return sel;
}

export function MapCard({
  landscape,
  pending,
  layoutError,
  showSegments,
  onToggleSegments,
  view,
  onView,
  selection,
  onSelect,
}: {
  landscape: Landscape;
  pending: boolean;
  layoutError: string | null;
  showSegments: boolean;
  onToggleSegments: (v: boolean) => void;
  view: 'full' | 'fit';
  onView: (v: 'full' | 'fit') => void;
  selection: Selection | null;
  onSelect: (t: Target) => void;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = Math.round(Math.min(Math.max(width * 0.78, Math.min(width, 340)), 720));
  const scene = useMemo(
    () =>
      width > 0 && landscape.positions
        ? buildRadialScene(landscape.chart, { width, height, mode: 'screen', showSegments, view, selected: toTarget(selection) })
        : null,
    [landscape, width, height, showSegments, view, selection],
  );
  const d = landscape.diagnostics;
  const name = (id: string) => landscape.chart.products.find((p) => p.id === id)?.name ?? id;
  const competitors = landscape.analysis.competitorIds.length;

  return (
    <section className="card map-card" aria-labelledby="map-title">
      <div className="card-head">
        <div>
          <h2 id="map-title">Competitive landscape</h2>
          <p className="card-sub">
            {landscape.chart.idvName} (IDV) at the center. Distance from the center is the exact modeled market distance; angles are fitted.
          </p>
        </div>
        <div className="toolbar" role="group" aria-label="Map options">
          <label className="toggle">
            <input type="checkbox" checked={showSegments} onChange={(e) => onToggleSegments(e.target.checked)} />
            Show segments
          </label>
          <div className="seg-control" role="radiogroup" aria-label="Map view">
            <button type="button" role="radio" aria-checked={view === 'full'} className={view === 'full' ? 'on' : ''} onClick={() => onView('full')}>
              Full scale
            </button>
            <button type="button" role="radio" aria-checked={view === 'fit'} className={view === 'fit' ? 'on' : ''} onClick={() => onView('fit')}>
              Fit to products
            </button>
          </div>
        </div>
      </div>
      <div ref={ref} className="map-area" style={{ minHeight: Math.min(height || 340, 720) }}>
        {scene && <SceneSvg scene={scene} onSelect={onSelect} testId="radial-chart" />}
        {!landscape.positions && (
          <div className="map-placeholder" role="status">
            {layoutError ? `The map could not be fitted: ${layoutError}` : pending ? 'Fitting the map…' : 'The map is not available yet.'}
          </div>
        )}
        {competitors === 0 && landscape.positions && <p className="map-note">Add a competitor to place it on the landscape.</p>}
      </div>
      <ul className="legend" aria-label="Legend">
        <li>
          <span className="lg lg-idv" aria-hidden="true" /> IDV (main product)
        </li>
        <li>
          <span className="lg lg-dot" aria-hidden="true" /> Competitor — uniform size, colored by product
        </li>
        <li>
          <span className="lg lg-stack" aria-hidden="true">
            2
          </span>{' '}
          Products at the same modeled position (select to list)
        </li>
        {showSegments && (
          <li>
            <span className="lg lg-diamond" aria-hidden="true" /> Modeled segment center — coverage-weighted average of positions, not measured preference
          </li>
        )}
        <li>
          <span className="lg lg-ring" aria-hidden="true" /> Rings: modeled distance (0 = same footprint, 1 = no shared segments)
        </li>
      </ul>
      {d && competitors > 1 && (
        <details className="map-error">
          <summary>
            Map distance error: <strong>{formatShare(d.relativeRMSError)}</strong>
            {d.worstPair && (
              <>
                {' '}
                · largest gap {name(d.worstPair.a)} ↔ {name(d.worstPair.b)} ({formatDistance(d.worstPair.displayed)} shown vs {formatDistance(d.worstPair.native)} modeled)
              </>
            )}
          </summary>
          <p>
            How much 2D map distances deviate from the modeled distances: √(Σ residual² / Σ modeled distance²) over all plotted pairs. Distances from the IDV are exact; competitor-to-competitor distances are approximated
            because a flat map cannot preserve them all. This is projection distortion — not data confidence, and not a percentage of wrong customers. The summary and tables always use modeled distances.
          </p>
        </details>
      )}
    </section>
  );
}

export function DistanceCard({ landscape, selection, onSelect }: { landscape: Landscape; selection: Selection | null; onSelect: (t: Target) => void }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const n = landscape.analysis.competitorIds.length;
  const scene = useMemo(() => (width > 0 && n > 0 ? buildDistanceScene(landscape.chart, { width, mode: 'screen', selected: toTarget(selection) }) : null), [landscape, width, n, selection]);
  return (
    <section className="card" aria-labelledby="dist-title">
      <div className="card-head">
        <div>
          <h2 id="dist-title">Distance from {landscape.chart.idvName}</h2>
          <p className="card-sub">Modeled market distance from SAM and segment splits on a fixed 0–1 scale, nearest first. Not a percentage of customers.</p>
        </div>
      </div>
      <div ref={ref}>{scene ? <SceneSvg scene={scene} onSelect={onSelect} testId="distance-chart" /> : <p className="empty-note">Add a competitor to see its distance from the IDV.</p>}</div>
    </section>
  );
}
