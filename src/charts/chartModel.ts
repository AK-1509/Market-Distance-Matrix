/**
 * The single numerical scene behind both charts, on screen and in exports. Positions are
 * model-unit coordinates from the layout; IDV radii equal native distances exactly.
 */
import type { Analysis } from '../domain/analysis';
import type { SegmentCentroid } from '../domain/centroids';
import type { LayoutDiagnostics } from '../domain/diagnostics';
import { formatPrice } from '../domain/price';
import type { Point, Project } from '../domain/types';
import { competitorColor } from './palette';
import type { ColorRole } from './scene';

export interface ChartProduct {
  id: string;
  name: string;
  isIdv: boolean;
  color: ColorRole;
  distance: number;
  position: Point;
  sharedMarket: number;
  idvExposure: number;
  competitorExposure: number;
  priceText: string;
}

export interface ChartSegment {
  id: string;
  name: string;
  /** 1-based key number for dense legends. */
  index: number;
  point: Point;
}

export interface ChartModel {
  projectName: string;
  /** Built-in fictional fixture: exports must say so. */
  isExample: boolean;
  marketDescription: string;
  unit: string;
  tam: number;
  dateLabel: string;
  modelVersion: string;
  idvId: string;
  idvName: string;
  /** IDV first, then competitors in ascending distance (ties by stable ID). */
  products: ChartProduct[];
  centroids: ChartSegment[];
  segmentCount: number;
  diagnostics: LayoutDiagnostics;
}

/**
 * One consistent product → color mapping for every view: the IDV uses the ink marker;
 * competitors take the fixed categorical slots in project order (beyond 8: neutral).
 */
export function productColors(project: Pick<Project, 'products' | 'idvProductId'>): Map<string, ColorRole> {
  const map = new Map<string, ColorRole>();
  let k = 0;
  for (const p of project.products) {
    if (p.id === project.idvProductId) map.set(p.id, 'idv');
    else map.set(p.id, competitorColor(k++));
  }
  return map;
}

export function buildChartModel(
  project: Project,
  analysis: Analysis,
  positions: Record<string, Point>,
  diagnostics: LayoutDiagnostics,
  centroids: SegmentCentroid[],
): ChartModel {
  const colors = productColors(project);
  const idv = analysis.products.get(analysis.idvId)!;
  const products: ChartProduct[] = [
    {
      id: idv.id,
      name: idv.name,
      isIdv: true,
      color: 'idv',
      distance: 0,
      position: { x: 0, y: 0 },
      sharedMarket: analysis.footprints[0].total,
      idvExposure: 1,
      competitorExposure: 1,
      priceText: formatPrice(idv.price),
    },
    ...analysis.rankings.byDistance.map((id) => {
      const m = analysis.competitors.find((c) => c.productId === id)!;
      const p = analysis.products.get(id)!;
      return {
        id,
        name: p.name,
        isIdv: false,
        color: colors.get(id) ?? 'other',
        distance: m.distance,
        position: positions[id] ?? { x: 0, y: 0 },
        sharedMarket: m.sharedMarket,
        idvExposure: m.idvExposure,
        competitorExposure: m.competitorExposure,
        priceText: formatPrice(p.price),
      };
    }),
  ];
  const segName = new Map(project.segments.map((s) => [s.id, s.name]));
  const segIndex = new Map(project.segments.map((s, i) => [s.id, i + 1]));
  return {
    projectName: project.name,
    isExample: !!project.isExample,
    marketDescription: project.marketDescription,
    unit: project.marketUnit,
    tam: analysis.tam,
    dateLabel: project.referenceDate,
    modelVersion: analysis.modelVersion,
    idvId: idv.id,
    idvName: idv.name,
    products,
    centroids: centroids.map((c) => ({ id: c.segmentId, name: segName.get(c.segmentId) ?? 'Segment', index: segIndex.get(c.segmentId) ?? 0, point: c.point })),
    segmentCount: project.segments.length,
    diagnostics,
  };
}
