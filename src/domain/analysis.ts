/**
 * Full deterministic analysis of a ready project (everything except the radial layout,
 * which runs in a worker). Pure: same inputs → same outputs, independent of product order.
 */
import { nativeAngle } from './geometry';
import { groupCompetitors, type GroupingResult } from './grouping';
import { compareIds } from './ids';
import { buildFootprint, buildSegmentIndex, distanceMatrix, modeledUnion, overlapMatrix, type Footprint } from './model';
import { comparePrices, type PriceComparison } from './price';
import { MODEL_SETTINGS } from './settings';
import { MODEL_VERSION, type Product, type Project } from './types';
import { assessProject, type Readiness } from './validation';

export interface CompetitorMetrics {
  productId: string;
  sam: number;
  /** d_0i */
  distance: number;
  /** O_0i */
  sharedMarket: number;
  /** O_0i / M_0 — share of the IDV's modeled SAM this competitor also addresses. */
  idvExposure: number;
  /** O_0i / M_i — share of the competitor's modeled SAM that the IDV also addresses. */
  competitorExposure: number;
  /** Footprint identical to the IDV (distance numerically zero). */
  matchesIdv: boolean;
}

export type CrowdingLabel = 'more-crowded' | 'less-covered' | 'typical';

export interface SegmentCrowding {
  segmentId: string;
  /** Analyzed competitors with a positive allocation to this segment (stable-ID order). */
  competitorIds: string[];
  idvAmount: number;
  idvFraction: number;
  /** Relative label; null when there are too few competitors for relative labels. */
  label: CrowdingLabel | null;
}

export interface Analysis {
  modelVersion: string;
  tam: number;
  unit: string;
  idvId: string;
  /** Matrix order: IDV first, then competitors in stable-ID order. */
  order: string[];
  competitorIds: string[];
  segmentIds: string[];
  products: Map<string, Product>;
  footprints: Footprint[];
  overlap: number[][];
  distance: number[][];
  /** Aligned with competitorIds. */
  competitors: CompetitorMetrics[];
  rankings: {
    byDistance: string[];
    bySharedMarket: string[];
    byIdvExposure: string[];
    byCompetitorExposure: string[];
  };
  /** Competitor × competitor native angles (radians), aligned with competitorIds. */
  nativeAngles: (number | null)[][];
  grouping: GroupingResult;
  crowding: SegmentCrowding[];
  /** Mean competitor count over covered segments (the crowding reference level). */
  crowdingMean: number | null;
  idvSegments: { segmentId: string; amount: number; fraction: number }[];
  modeledUnion: number;
  outsideModeled: number;
  sumOfSams: number;
  price: PriceComparison;
  excludedIds: string[];
}

export class NotReadyError extends Error {
  readonly readiness: Readiness;
  constructor(readiness: Readiness) {
    super('Project is not ready for analysis');
    this.readiness = readiness;
  }
}

export function analyzeProject(project: Project, readiness: Readiness = assessProject(project)): Analysis {
  if (readiness.status !== 'ready' || project.tam === null || !project.idvProductId) throw new NotReadyError(readiness);
  const byId = new Map(project.products.map((p) => [p.id, p]));
  const idvId = project.idvProductId;
  const competitorIds = readiness.analyzableIds.filter((id) => id !== idvId).sort(compareIds);
  const order = [idvId, ...competitorIds];
  const segmentIds = project.segments.map((s) => s.id);
  const index = buildSegmentIndex(segmentIds);
  const footprints = order.map((id) => buildFootprint(byId.get(id) as Product, index));
  const overlap = overlapMatrix(footprints);
  const distance = distanceMatrix(footprints, overlap);

  const idvFp = footprints[0];
  const competitors: CompetitorMetrics[] = competitorIds.map((id, k) => {
    const i = k + 1;
    return {
      productId: id,
      sam: footprints[i].total,
      distance: distance[0][i],
      sharedMarket: overlap[0][i],
      idvExposure: overlap[0][i] / idvFp.total,
      competitorExposure: overlap[0][i] / footprints[i].total,
      matchesIdv: distance[0][i] <= MODEL_SETTINGS.zeroRadius,
    };
  });

  const rank = (key: (m: CompetitorMetrics) => number, dir: 1 | -1) =>
    [...competitors].sort((a, b) => dir * (key(a) - key(b)) || compareIds(a.productId, b.productId)).map((m) => m.productId);

  const n = competitorIds.length;
  const nativeAngles: (number | null)[][] = Array.from({ length: n }, () => new Array<number | null>(n).fill(null));
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) {
        nativeAngles[a][b] = competitors[a].matchesIdv ? null : 0;
        continue;
      }
      if (b < a) {
        nativeAngles[a][b] = nativeAngles[b][a];
        continue;
      }
      nativeAngles[a][b] = nativeAngle(distance[0][a + 1], distance[0][b + 1], distance[a + 1][b + 1]);
    }
  }

  const grouping = groupCompetitors({
    ids: competitorIds,
    radii: competitors.map((c) => c.distance),
    angles: nativeAngles,
    idvFootprint: idvFp,
    footprints: footprints.slice(1),
    segmentIds,
  });

  // Crowding by segment.
  const crowding: SegmentCrowding[] = segmentIds.map((segmentId, s) => ({
    segmentId,
    competitorIds: competitorIds.filter((_, k) => footprints[k + 1].amounts[s] > 0),
    idvAmount: idvFp.amounts[s],
    idvFraction: idvFp.amounts[s] / idvFp.total,
    label: null,
  }));
  const covered = crowding.filter((c) => c.competitorIds.length > 0 || c.idvAmount > 0);
  let crowdingMean: number | null = null;
  if (n >= MODEL_SETTINGS.crowding.minCompetitorsForLabels && covered.length > 0) {
    crowdingMean = covered.reduce((acc, c) => acc + c.competitorIds.length, 0) / covered.length;
    for (const c of covered) {
      const k = c.competitorIds.length;
      c.label = k > crowdingMean + 1e-9 ? 'more-crowded' : k < crowdingMean - 1e-9 ? 'less-covered' : 'typical';
    }
  }

  const idvSegments = segmentIds
    .map((segmentId, s) => ({ segmentId, amount: idvFp.amounts[s], fraction: idvFp.amounts[s] / idvFp.total }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount || compareIds(a.segmentId, b.segmentId));

  const union = modeledUnion(footprints);
  const analyzedProducts = order.map((id) => byId.get(id) as Product);

  return {
    modelVersion: MODEL_VERSION,
    tam: project.tam,
    unit: project.marketUnit,
    idvId,
    order,
    competitorIds,
    segmentIds,
    products: new Map(analyzedProducts.map((p) => [p.id, p])),
    footprints,
    overlap,
    distance,
    competitors,
    rankings: {
      byDistance: rank((m) => m.distance, 1),
      bySharedMarket: rank((m) => m.sharedMarket, -1),
      byIdvExposure: rank((m) => m.idvExposure, -1),
      byCompetitorExposure: rank((m) => m.competitorExposure, -1),
    },
    nativeAngles,
    grouping,
    crowding,
    crowdingMean,
    idvSegments,
    modeledUnion: union,
    outsideModeled: Math.max(0, project.tam - union),
    sumOfSams: footprints.reduce((acc, f) => acc + f.total, 0),
    price: comparePrices(analyzedProducts),
    excludedIds: readiness.excludedIds,
  };
}

/** Index of a product within `analysis.order` (matrix index), or -1. */
export function matrixIndex(analysis: Analysis, productId: string): number {
  return analysis.order.indexOf(productId);
}

export function competitorMetrics(analysis: Analysis, productId: string): CompetitorMetrics | undefined {
  return analysis.competitors.find((c) => c.productId === productId);
}
