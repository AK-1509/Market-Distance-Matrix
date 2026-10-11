/**
 * Pure pipeline from a project (+ optional layout cache) to everything the UI and exports
 * render. Used identically on screen and in exported files.
 */
import type { Analysis } from '../domain/analysis';
import { segmentCentroids, type SegmentCentroid } from '../domain/centroids';
import { layoutDiagnostics, type LayoutDiagnostics } from '../domain/diagnostics';
import { layoutInputHash } from '../domain/hash';
import { resolveAnchor, type RadialInput, type RadialLayout } from '../domain/radial';
import { MODEL_SETTINGS } from '../domain/settings';
import { MODEL_VERSION, type LayoutCache, type Point, type Project } from '../domain/types';
import { buildChartModel, type ChartModel } from '../charts/chartModel';
import { buildDistanceScene } from '../charts/distanceScene';
import { buildRadialScene } from '../charts/radialScene';
import { sceneToSvg } from '../charts/svgString';
import { buildNarrative, type Narrative } from '../report/narrative';

export interface LayoutRequest {
  hash: string;
  anchorId: string | null;
  input: RadialInput;
}

/** Resolve the anchor and build the worker input + its hash. */
export function layoutRequestFor(project: Project, analysis: Analysis, previous: LayoutCache | null): LayoutRequest {
  const radii = analysis.competitors.map((c) => c.distance);
  const anchorId = resolveAnchor(analysis.competitorIds, radii, project.layoutSettings.anchorProductId ?? previous?.anchorProductId ?? null);
  const seed = project.layoutSettings.seed;
  const hash = layoutInputHash(analysis, anchorId, seed);
  return {
    hash,
    anchorId,
    input: {
      ids: analysis.competitorIds,
      radii,
      target: analysis.competitorIds.map((_, i) => analysis.competitorIds.map((__, j) => analysis.distance[i + 1][j + 1])),
      anchorId,
      seed,
      previousAngles: previous?.angles ?? null,
    },
  };
}

export function cacheFromLayout(hash: string, layout: RadialLayout): LayoutCache {
  return { inputHash: hash, modelVersion: MODEL_VERSION, anchorProductId: layout.anchorId, angles: layout.angles, loss: layout.loss };
}

/**
 * Positions from cached angles. Radii always come from the current analysis (exact native
 * distances), never from the cache. Returns null if the cache does not cover the analysis.
 */
export function positionsFromCache(analysis: Analysis, cache: LayoutCache): Record<string, Point> | null {
  const out: Record<string, Point> = { [analysis.idvId]: { x: 0, y: 0 } };
  for (const c of analysis.competitors) {
    if (c.distance <= MODEL_SETTINGS.zeroRadius) {
      out[c.productId] = { x: 0, y: 0 };
      continue;
    }
    const a = cache.angles[c.productId];
    if (a === undefined || !Number.isFinite(a)) return null;
    out[c.productId] = { x: c.distance * Math.cos(a), y: c.distance * Math.sin(a) };
  }
  return out;
}

export interface Landscape {
  analysis: Analysis;
  /** Present only when the layout matches the current inputs. */
  layout: LayoutCache | null;
  positions: Record<string, Point> | null;
  diagnostics: LayoutDiagnostics | null;
  centroids: SegmentCentroid[];
  chart: ChartModel;
  narrative: Narrative;
}

export function buildLandscape(project: Project, analysis: Analysis, layout: LayoutCache | null): Landscape {
  const positions = layout ? positionsFromCache(analysis, layout) : null;
  const usable = positions ? layout : null;
  const diagnostics = positions ? layoutDiagnostics(analysis.order, positions, analysis.distance, analysis.nativeAngles) : null;
  const centroids = positions ? segmentCentroids(analysis.footprints, positions, analysis.segmentIds) : [];
  const fallbackPositions: Record<string, Point> = positions ?? Object.fromEntries(analysis.order.map((id) => [id, { x: 0, y: 0 }]));
  const emptyDiag: LayoutDiagnostics = { pairs: [], relativeRMSError: 0, maxAbsError: 0, worstPair: null };
  const chart = buildChartModel(project, analysis, fallbackPositions, diagnostics ?? emptyDiag, centroids);
  const narrative = buildNarrative(project, analysis, diagnostics);
  return { analysis, layout: usable, positions, diagnostics, centroids, chart, narrative };
}

export const EXPORT_SIZE = { width: 1920, height: 1080 } as const;

export interface ExportOptions {
  variant: 'detailed' | 'clean';
  showSegments: boolean;
}

export function radialExportSvg(landscape: Landscape, opts: ExportOptions): string | null {
  if (!landscape.positions) return null;
  return sceneToSvg(
    buildRadialScene(landscape.chart, { ...EXPORT_SIZE, mode: 'export', variant: opts.variant, showSegments: opts.showSegments, view: 'full' }),
  );
}

export function distanceExportScene(landscape: Landscape) {
  return buildDistanceScene(landscape.chart, { width: EXPORT_SIZE.width, mode: 'export' });
}

export function distanceExportSvg(landscape: Landscape): string {
  return sceneToSvg(distanceExportScene(landscape));
}
