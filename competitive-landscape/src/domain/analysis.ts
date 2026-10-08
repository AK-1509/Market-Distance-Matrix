// Turns a valid project draft into the structured metrics every view,
// report and export reads. Pure and synchronous; the radial layout (the
// expensive part) runs separately in a worker and is keyed by `inputHash`.

import { effectiveAllocations } from './allocation';
import { MODEL_SETTINGS, MODEL_VERSION } from './constants';
import { nativeAngle } from './geometry';
import { groupCompetitors } from './grouping';
import { hashValue } from './hash';
import { compareIds } from './ids';
import {
  buildMatrices,
  footprintOf,
  groupSharedWithIdv,
  modeledUnion,
  type Footprint,
  type Matrices,
  type SegmentContribution,
} from './model';
import { priceContext, type PriceContext } from './price';
import type { Product, Project } from './types';
import { validateProject, type ExcludedProduct, type ValidationResult } from './validation';

export interface CompetitorMetrics {
  id: string;
  name: string;
  sam: number;
  /** d_0i, the native modelled distance from IDV. */
  distance: number;
  /** O_0i. */
  sharedMarket: number;
  /** O_0i / M_0. */
  idvExposure: number;
  /** O_0i / M_i. */
  competitorExposure: number;
  /** Footprint identical to IDV (zero radius, direction undefined). */
  matchesIdv: boolean;
}

export interface GroupSummary {
  memberIds: string[];
  maxAngle: number;
  /** sum_s min(m_0s, max_{i in group} m_is). */
  sharedWithIdv: number;
  contributions: SegmentContribution[];
  /** The group's own leading segments (max_i m_is), for disjoint groups. */
  leadingSegments: SegmentContribution[];
}

export type CrowdingLabel = 'more-crowded' | 'moderate' | 'less-covered';

export interface SegmentCrowding {
  segmentId: string;
  name: string;
  competitorIds: string[];
  competitorCount: number;
  idvAmount: number;
  idvFraction: number;
  /** Null when there are too few competitors for relative labels. */
  label: CrowdingLabel | null;
}

export interface Analysis {
  projectId: string;
  inputHash: string;
  modelVersion: string;
  tam: number;
  unit: string;
  idvId: string;
  /** IDV first, then competitors in stable ID order. Indexes into `matrices`. */
  productIds: string[];
  competitorIds: string[];
  index: Record<string, number>;
  names: Record<string, string>;
  footprints: Record<string, Footprint>;
  matrices: Matrices;
  competitors: CompetitorMetrics[];
  rankings: {
    byDistance: string[];
    bySharedMarket: string[];
    byIdvExposure: string[];
    byCompetitorExposure: string[];
  };
  /** Competitors whose footprint matches IDV exactly (undefined direction). */
  matchesIdvIds: string[];
  /** Directional groups of size >= 2 (complete link), ranked by unique shared overlap. */
  groups: GroupSummary[];
  /** False when there are too few directional competitors to group. */
  groupingApplied: boolean;
  anchorId: string | null;
  seed: number;
  union: number;
  outsideModeled: number;
  sumOfSams: number;
  idvSegments: { segmentId: string; amount: number; fraction: number }[];
  crowding: SegmentCrowding[];
  price: PriceContext;
  excluded: ExcludedProduct[];
}

export type AnalysisOutcome =
  | { status: 'ok'; validation: ValidationResult; analysis: Analysis }
  | { status: 'blocked'; validation: ValidationResult };

/** Pick the product that defines the map's reference direction. */
export function resolveAnchor(
  storedAnchorId: string | undefined,
  competitors: readonly CompetitorMetrics[],
): string | null {
  const eligible = competitors.filter((c) => !c.matchesIdv);
  if (storedAnchorId && eligible.some((c) => c.id === storedAnchorId)) return storedAnchorId;
  const sorted = [...eligible].sort((a, b) => compareIds(a.id, b.id));
  return sorted[0]?.id ?? null;
}

function rank(ids: readonly string[], key: (id: string) => number, ascending: boolean): string[] {
  return [...ids].sort((a, b) => {
    const diff = ascending ? key(a) - key(b) : key(b) - key(a);
    return Math.abs(diff) > 1e-12 ? diff : compareIds(a, b);
  });
}

export function analyzeProject(project: Project): AnalysisOutcome {
  const validation = validateProject(project);
  if (validation.blocking || validation.analyzedIds.length === 0) return { status: 'blocked', validation };

  const byId = new Map<string, Product>(project.products.map((p) => [p.id, p]));
  const productIds = validation.analyzedIds;
  const idvId = productIds[0];
  const competitorIds = productIds.slice(1);
  const products = productIds.map((id) => byId.get(id) as Product);
  const footprintList = products.map(footprintOf);
  const footprints: Record<string, Footprint> = Object.fromEntries(footprintList.map((f) => [f.id, f]));
  const matrices = buildMatrices(footprintList);
  const index: Record<string, number> = Object.fromEntries(productIds.map((id, i) => [id, i]));
  const names: Record<string, string> = Object.fromEntries(products.map((p) => [p.id, p.name.trim()]));
  const idvFp = footprints[idvId];
  const eps = MODEL_SETTINGS.zeroRadiusEpsilon;

  const competitors: CompetitorMetrics[] = competitorIds.map((id) => {
    const i = index[id];
    const shared = matrices.overlap[0][i];
    const distance = matrices.distance[0][i];
    return {
      id,
      name: names[id],
      sam: footprints[id].sam,
      distance,
      sharedMarket: shared,
      idvExposure: shared / idvFp.sam,
      competitorExposure: shared / footprints[id].sam,
      matchesIdv: distance <= eps,
    };
  });
  const metricById = new Map(competitors.map((c) => [c.id, c]));
  const m = (id: string) => metricById.get(id) as CompetitorMetrics;

  const rankings = {
    byDistance: rank(competitorIds, (id) => m(id).distance, true),
    bySharedMarket: rank(competitorIds, (id) => m(id).sharedMarket, false),
    byIdvExposure: rank(competitorIds, (id) => m(id).idvExposure, false),
    byCompetitorExposure: rank(competitorIds, (id) => m(id).competitorExposure, false),
  };

  const matchesIdvIds = competitors.filter((c) => c.matchesIdv).map((c) => c.id);
  const directional = competitors.filter((c) => !c.matchesIdv).map((c) => c.id);
  const angle = (a: string, b: string) =>
    nativeAngle(matrices.distance[0][index[a]], matrices.distance[0][index[b]], matrices.distance[index[a]][index[b]]);

  const groupingApplied = directional.length >= MODEL_SETTINGS.minCompetitorsForGroups;
  const groups: GroupSummary[] = groupingApplied
    ? groupCompetitors({ ids: directional, radius: (id) => m(id).distance, angle })
        .filter((g) => g.memberIds.length >= 2)
        .map((g) => {
          const members = g.memberIds.map((id) => footprints[id]);
          const shared = groupSharedWithIdv(idvFp, members);
          const own = new Map<string, number>();
          for (const f of members) {
            for (const [s, v] of Object.entries(f.amounts)) own.set(s, Math.max(own.get(s) ?? 0, v));
          }
          const leadingSegments = [...own.entries()]
            .filter(([, v]) => v > 0)
            .map(([segmentId, amount]) => ({ segmentId, amount }))
            .sort((a, b) => b.amount - a.amount || compareIds(a.segmentId, b.segmentId));
          return {
            memberIds: g.memberIds,
            maxAngle: g.maxAngle,
            sharedWithIdv: shared.total,
            contributions: shared.bySegment,
            leadingSegments,
          };
        })
        .sort((a, b) => b.sharedWithIdv - a.sharedWithIdv || compareIds(a.memberIds[0], b.memberIds[0]))
    : [];

  const union = modeledUnion(footprintList);
  const tam = project.tam as number;
  const idvProduct = products[0];
  const idvSegments = effectiveAllocations(idvProduct)
    .map((a) => ({ segmentId: a.segmentId, amount: idvFp.amounts[a.segmentId] ?? 0, fraction: a.fraction }))
    .sort((a, b) => b.amount - a.amount || compareIds(a.segmentId, b.segmentId));

  const usedSegmentIds = new Set(footprintList.flatMap((f) => Object.keys(f.amounts)));
  const nComp = competitorIds.length;
  const crowding: SegmentCrowding[] = project.segments
    .filter((s) => usedSegmentIds.has(s.id))
    .map((s) => {
      const ids = competitorIds.filter((id) => (footprints[id].amounts[s.id] ?? 0) > 0);
      const share = nComp > 0 ? ids.length / nComp : 0;
      let label: CrowdingLabel | null = null;
      if (nComp >= MODEL_SETTINGS.minCompetitorsForCrowdingLabels) {
        label =
          share >= MODEL_SETTINGS.crowdedShare
            ? 'more-crowded'
            : share <= MODEL_SETTINGS.lessCoveredShare
              ? 'less-covered'
              : 'moderate';
      }
      const idvAmount = idvFp.amounts[s.id] ?? 0;
      return {
        segmentId: s.id,
        name: s.name,
        competitorIds: ids,
        competitorCount: ids.length,
        idvAmount,
        idvFraction: idvAmount / idvFp.sam,
        label,
      };
    })
    .sort((a, b) => b.competitorCount - a.competitorCount || b.idvAmount - a.idvAmount || compareIds(a.segmentId, b.segmentId));

  const anchorId = resolveAnchor(project.layoutSettings.anchorProductId, competitors);
  const seed = project.layoutSettings.seed;

  const inputHash = hashValue({
    modelVersion: MODEL_VERSION,
    tam,
    idvId,
    products: products.map((p) => ({
      id: p.id,
      sam: p.sam,
      allocations: effectiveAllocations(p)
        .map((a) => [a.segmentId, a.fraction])
        .sort((a, b) => compareIds(String(a[0]), String(b[0]))),
    })),
    anchorId,
    seed,
  });

  const analysis: Analysis = {
    projectId: project.id,
    inputHash,
    modelVersion: MODEL_VERSION,
    tam,
    unit: project.marketUnit,
    idvId,
    productIds,
    competitorIds,
    index,
    names,
    footprints,
    matrices,
    competitors,
    rankings,
    matchesIdvIds,
    groups,
    groupingApplied,
    anchorId,
    seed,
    union,
    outsideModeled: Math.max(0, tam - union),
    sumOfSams: footprintList.reduce((s, f) => s + f.sam, 0),
    idvSegments,
    crowding,
    price: priceContext(idvProduct, products.slice(1)),
    excluded: validation.excluded,
  };
  return { status: 'ok', validation, analysis };
}

export function competitorMetric(analysis: Analysis, id: string): CompetitorMetrics | undefined {
  return analysis.competitors.find((c) => c.id === id);
}

export function pairDistance(analysis: Analysis, a: string, b: string): number {
  return analysis.matrices.distance[analysis.index[a]][analysis.index[b]];
}

export function pairOverlap(analysis: Analysis, a: string, b: string): number {
  return analysis.matrices.overlap[analysis.index[a]][analysis.index[b]];
}

export function pairNativeAngle(analysis: Analysis, a: string, b: string): number | null {
  if (a === analysis.idvId || b === analysis.idvId) return null;
  return nativeAngle(pairDistance(analysis, analysis.idvId, a), pairDistance(analysis, analysis.idvId, b), pairDistance(analysis, a, b));
}
