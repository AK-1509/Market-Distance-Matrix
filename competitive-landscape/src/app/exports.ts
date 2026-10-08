import { buildDistanceScene } from '../charts/distanceScene';
import { productIdentities } from '../charts/palette';
import { buildRadialScene } from '../charts/radialScene';
import type { Scene } from '../charts/scene';
import { slugify } from '../domain/format';
import { buildExportEnvelope } from '../domain/schema';
import type { LayoutResult, Project } from '../domain/types';
import { downloadBlob, downloadText, sceneToInlineSvg, sceneToSvg, svgToPng } from '../export/files';
import { buildReportHtml } from '../export/report';
import type { ResolvedView } from './useAnalysis';

export const LANDSCAPE_PRESET = { width: 1920, height: 1080 } as const;

export function landscapeScene(view: ResolvedView, clean: boolean, generatedAt: string): Scene {
  return buildRadialScene({
    analysis: view.analysis,
    layout: view.layout,
    project: view.project,
    identities: productIdentities(view.project),
    width: LANDSCAPE_PRESET.width,
    height: LANDSCAPE_PRESET.height,
    variant: clean ? 'clean' : 'export',
    showSegments: view.project.layoutSettings.showSegments,
    diagnostics: view.diagnostics,
    generatedAt,
  });
}

export function distanceScene(view: ResolvedView, clean: boolean, generatedAt: string, compact = false): Scene {
  return buildDistanceScene({
    compact,
    analysis: view.analysis,
    project: view.project,
    identities: productIdentities(view.project),
    width: LANDSCAPE_PRESET.width,
    height: LANDSCAPE_PRESET.height,
    variant: clean ? 'clean' : 'export',
    generatedAt,
  });
}

export type ExportKind = 'landscape-png' | 'landscape-svg' | 'distance-png' | 'distance-svg' | 'report' | 'json';

export async function runExport(kind: ExportKind, view: ResolvedView | null, project: Project, layoutCache: LayoutResult | null, clean: boolean): Promise<string> {
  const slug = slugify(project.name);
  const now = new Date().toISOString();
  if (kind === 'json') {
    const file = `${slug}.landscape.json`;
    downloadText(JSON.stringify(buildExportEnvelope(project, layoutCache), null, 2), file, 'application/json');
    return file;
  }
  if (!view) throw new Error('The analysis is not current, so charts and reports cannot be exported yet.');
  const suffix = clean ? '-clean' : '';
  switch (kind) {
    case 'landscape-svg': {
      const file = `${slug}-landscape${suffix}.svg`;
      downloadText(sceneToSvg(landscapeScene(view, clean, now)), file, 'image/svg+xml');
      return file;
    }
    case 'landscape-png': {
      const scene = landscapeScene(view, clean, now);
      const file = `${slug}-landscape${suffix}.png`;
      downloadBlob(await svgToPng(sceneToSvg(scene), scene.width, scene.height), file);
      return file;
    }
    case 'distance-svg': {
      const file = `${slug}-distances${suffix}.svg`;
      downloadText(sceneToSvg(distanceScene(view, clean, now)), file, 'image/svg+xml');
      return file;
    }
    case 'distance-png': {
      const scene = distanceScene(view, clean, now);
      const file = `${slug}-distances${suffix}.png`;
      downloadBlob(await svgToPng(sceneToSvg(scene), scene.width, scene.height), file);
      return file;
    }
    case 'report': {
      const html = buildReportHtml({
        project: view.project,
        analysis: view.analysis,
        diagnostics: view.diagnostics,
        narrative: view.narrative,
        landscapeSvg: sceneToInlineSvg(landscapeScene(view, false, now)),
        distanceSvg: sceneToInlineSvg(distanceScene(view, false, now, true)),
        generatedAt: now,
      });
      const file = `${slug}-report.html`;
      downloadText(html, file, 'text/html');
      return file;
    }
  }
}
