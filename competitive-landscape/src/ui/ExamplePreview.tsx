// A static look at the fictional example, shown on the Projects page so the
// first view demonstrates the output before anything is saved.

import { useMemo } from 'react';
import { buildDistanceScene } from '../charts/distanceScene';
import { productIdentities } from '../charts/palette';
import { buildRadialScene } from '../charts/radialScene';
import { SceneSvg } from '../charts/scene';
import { analyzeProject } from '../domain/analysis';
import { layoutDiagnostics } from '../domain/diagnostics';
import { createDemoProject } from '../domain/fixtures';
import { formatPercent } from '../domain/format';
import { buildLayoutInput, computeLayout } from '../domain/layout';
import { useElementWidth } from './common';

export function ExamplePreview({ onOpen }: { onOpen: () => void }) {
  const [mapRef, mapWidth] = useElementWidth<HTMLDivElement>(420);
  const [barRef, barWidth] = useElementWidth<HTMLDivElement>(420);
  const data = useMemo(() => {
    const project = createDemoProject();
    const o = analyzeProject(project);
    if (o.status !== 'ok') return null;
    const layout = computeLayout(buildLayoutInput(o.analysis));
    return { project, analysis: o.analysis, layout, diagnostics: layoutDiagnostics(o.analysis, layout), identities: productIdentities(project) };
  }, []);
  if (!data) return null;
  const mapH = Math.round(Math.min(380, Math.max(260, mapWidth * 0.78)));
  const radial = buildRadialScene({
    analysis: data.analysis,
    layout: data.layout,
    project: data.project,
    identities: data.identities,
    width: mapWidth,
    height: mapH,
    variant: 'screen',
    showSegments: false,
    diagnostics: data.diagnostics,
  });
  const bars = buildDistanceScene({ analysis: data.analysis, project: data.project, identities: data.identities, width: barWidth, variant: 'screen' });

  return (
    <section className="card example-preview" aria-labelledby="example-heading">
      <div className="card-head">
        <div>
          <h2 id="example-heading">
            Example output <span className="badge">Fictional data</span>
          </h2>
          <p className="sub">
            Five AI assistants with invented SAMs and segment splits in a TAM of 1,000,000 potential customers. Map distance error{' '}
            {formatPercent(data.diagnostics.relativeRMSError, 1)}.
          </p>
        </div>
        <button type="button" className="btn primary small" onClick={onOpen}>
          Open this example
        </button>
      </div>
      <div className="example-grid">
        <div className="chart-wrap" ref={mapRef}>
          <SceneSvg scene={radial} themed />
        </div>
        <div className="example-side">
          <h3>Distance from IDV (ChatGPT)</h3>
          <div className="chart-wrap" ref={barRef}>
            <SceneSvg scene={bars} themed />
          </div>
          <p className="sub">
            Each bar is the exact modelled distance on a fixed 0–1 scale; the map keeps those distances as radii and fits the directions.
          </p>
        </div>
      </div>
    </section>
  );
}
