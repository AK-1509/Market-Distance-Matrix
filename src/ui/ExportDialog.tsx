import { useState } from 'react';
import { distanceExportScene, EXPORT_SIZE, radialExportSvg, type Landscape } from '../app/landscape';
import { sceneToSvg } from '../charts/svgString';
import { slugify } from '../domain/format';
import type { LayoutCache, Project } from '../domain/types';
import { buildReportHtml } from '../export/report';
import { dateStamp, downloadBlob, downloadText, svgToPngBlob } from '../export/files';
import { exportProjectJson } from '../storage/json';
import { Dialog } from './common';

export function ExportDialog({
  project,
  landscape,
  layoutCache,
  onClose,
}: {
  project: Project;
  /** Current (not stale) landscape, or null when the draft cannot be analyzed. */
  landscape: Landscape | null;
  layoutCache: LayoutCache | null;
  onClose: () => void;
}) {
  const [variant, setVariant] = useState<'detailed' | 'clean'>('detailed');
  const [showSegments, setShowSegments] = useState(project.layoutSettings.showSegments);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `${slugify(project.name)}-${dateStamp()}`;
  const mapReady = !!landscape?.positions;
  const hasCompetitors = (landscape?.analysis.competitorIds.length ?? 0) > 0;

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      setStatus({ tone: 'ok', text: `${label} downloaded.` });
    } catch (e) {
      setStatus({ tone: 'error', text: `${label} failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const radialSvg = () => radialExportSvg(landscape as Landscape, { variant, showSegments }) as string;
  const distance = () => distanceExportScene(landscape as Landscape);

  return (
    <Dialog title="Export" onClose={onClose}>
      {!landscape && (
        <div className="alert alert-warn">Charts and the report need a valid analysis. Fix the issues shown in the workspace first. The project JSON can always be exported.</div>
      )}
      <fieldset className="field" disabled={!mapReady}>
        <legend>Landscape graphic (1920 × 1080)</legend>
        <div className="radio-row">
          <label className="check-inline">
            <input type="radio" name="variant" checked={variant === 'detailed'} onChange={() => setVariant('detailed')} /> Detailed (keyed list and map error)
          </label>
          <label className="check-inline">
            <input type="radio" name="variant" checked={variant === 'clean'} onChange={() => setVariant('clean')} /> Clean presentation
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={showSegments} onChange={(e) => setShowSegments(e.target.checked)} /> Include segment centers
          </label>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run('Landscape PNG', async () => downloadBlob(await svgToPngBlob(radialSvg(), EXPORT_SIZE.width, EXPORT_SIZE.height), `${base}-landscape.png`))}>
            Landscape PNG
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run('Landscape SVG', () => downloadText(radialSvg(), `${base}-landscape.svg`, 'image/svg+xml'))}>
            Landscape SVG
          </button>
        </div>
      </fieldset>
      <fieldset className="field" disabled={!landscape || !hasCompetitors}>
        <legend>Distance chart</legend>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              run('Distance chart PNG', async () => {
                const s = distance();
                downloadBlob(await svgToPngBlob(sceneToSvg(s), s.width, s.height), `${base}-distance.png`);
              })
            }
          >
            Distance PNG
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run('Distance chart SVG', () => downloadText(sceneToSvg(distance()), `${base}-distance.svg`, 'image/svg+xml'))}>
            Distance SVG
          </button>
        </div>
      </fieldset>
      <fieldset className="field" disabled={!landscape}>
        <legend>Report</legend>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              run('HTML report', () => {
                const l = landscape as Landscape;
                const html = buildReportHtml({
                  project,
                  analysis: l.analysis,
                  diagnostics: l.diagnostics,
                  narrative: l.narrative,
                  radialSvg: l.positions ? radialExportSvg(l, { variant: 'detailed', showSegments }) : null,
                  distanceSvg: sceneToSvg(distanceExportScene(l)),
                });
                downloadText(html, `${base}-report.html`, 'text/html');
              })
            }
          >
            HTML report
          </button>
        </div>
        <p className="field-hint">Self-contained and print-friendly: open it and use the browser’s Print → Save as PDF.</p>
      </fieldset>
      <fieldset className="field">
        <legend>Editable project backup</legend>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => run('Project JSON', () => downloadText(exportProjectJson(project, layoutCache), `${base}.json`, 'application/json'))}
          >
            Project JSON
          </button>
        </div>
        <p className="field-hint">
          Projects are saved in this browser only (IndexedDB for this site). Clearing site data or switching browsers loses them. The JSON file is your durable backup and can be imported again as a new project.
        </p>
      </fieldset>
      {status && (
        <p className={status.tone === 'ok' ? 'status-ok' : 'field-error'} role="status">
          {status.text}
        </p>
      )}
    </Dialog>
  );
}
