/**
 * Deterministic complete-link agglomeration of competitors by native direction from the IDV.
 * Two groups may merge only if EVERY cross pair has native angle <= maxAngleDeg and
 * |radius difference| <= maxRadiusDiff. Among eligible merges, the smallest maximum
 * cross angle wins; ties break by stable IDs. These are transparent defaults, not
 * statistically validated clusters.
 */
import { compareIds } from './ids';
import { groupSharedBySegment, type Footprint } from './model';
import { MODEL_SETTINGS } from './settings';
import { toRadians } from './geometry';

export interface DirectionalGroup {
  /** Member IDs in stable-ID order. */
  memberIds: string[];
  /** Largest native angle between any two members (0 for a single competitor). */
  maxAngle: number;
  /** Unique modeled overlap with the IDV: sum_s min(m_0s, max_i m_is). */
  shared: number;
  /** Positive per-segment contributions to `shared`, largest first. */
  sharedBySegment: { segmentId: string; amount: number }[];
}

export interface AnglePair {
  a: string;
  b: string;
  angle: number;
}

export interface GroupingResult {
  mode: 'groups' | 'pairs' | 'none';
  /** All groups (including single-competitor groups), ranked by `shared` descending. */
  groups: DirectionalGroup[];
  /** Competitors whose modeled footprint matches the IDV (direction undefined). */
  matchingIdvIds: string[];
  /** Pairwise native angles among directional competitors (used for small datasets). */
  pairs: AnglePair[];
}

export interface GroupingInput {
  /** Competitor IDs in stable-ID order. */
  ids: string[];
  /** Distance from IDV per competitor (aligned with ids). */
  radii: number[];
  /** Native angle matrix aligned with ids; null where undefined. */
  angles: (number | null)[][];
  idvFootprint: Footprint;
  /** Competitor footprints aligned with ids. */
  footprints: Footprint[];
  segmentIds: string[];
}

const EPS = 1e-9;

export function groupCompetitors(input: GroupingInput, settings = MODEL_SETTINGS.grouping): GroupingResult {
  const { ids, radii, angles } = input;
  const matchingIdvIds: string[] = [];
  const directional: number[] = [];
  ids.forEach((id, i) => {
    if (radii[i] <= MODEL_SETTINGS.zeroRadius) matchingIdvIds.push(id);
    else directional.push(i);
  });

  const pairs: AnglePair[] = [];
  for (let x = 0; x < directional.length; x++) {
    for (let y = x + 1; y < directional.length; y++) {
      const i = directional[x];
      const j = directional[y];
      pairs.push({ a: ids[i], b: ids[j], angle: angles[i][j] as number });
    }
  }

  const describe = (members: number[], maxAngle: number): DirectionalGroup => {
    const bySeg = groupSharedBySegment(
      input.idvFootprint,
      members.map((m) => input.footprints[m]),
    );
    const sharedBySegment = bySeg
      .map((amount, s) => ({ segmentId: input.segmentIds[s], amount }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount || compareIds(a.segmentId, b.segmentId));
    return {
      memberIds: members.map((m) => ids[m]).sort(compareIds),
      maxAngle,
      shared: bySeg.reduce((a, b) => a + b, 0),
      sharedBySegment,
    };
  };

  if (directional.length < settings.minCompetitorsForGroups) {
    const groups = directional.map((i) => describe([i], 0));
    sortGroups(groups);
    return { mode: directional.length >= 2 ? 'pairs' : 'none', groups, matchingIdvIds, pairs };
  }

  const maxAngle = toRadians(settings.maxAngleDeg);
  let clusters: number[][] = directional.map((i) => [i]);

  const link = (A: number[], B: number[]): number | null => {
    let worst = 0;
    for (const i of A) {
      for (const j of B) {
        const ang = angles[i][j];
        if (ang === null || ang > maxAngle + EPS) return null;
        if (Math.abs(radii[i] - radii[j]) > settings.maxRadiusDiff + EPS) return null;
        worst = Math.max(worst, ang);
      }
    }
    return worst;
  };
  const key = (A: number[]) => A.map((i) => ids[i]).sort(compareIds)[0];

  for (;;) {
    let best: { a: number; b: number; link: number; ka: string; kb: string } | null = null;
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const l = link(clusters[a], clusters[b]);
        if (l === null) continue;
        let ka = key(clusters[a]);
        let kb = key(clusters[b]);
        if (compareIds(ka, kb) > 0) [ka, kb] = [kb, ka];
        const better =
          best === null ||
          l < best.link - EPS ||
          (Math.abs(l - best.link) <= EPS && (compareIds(ka, best.ka) < 0 || (ka === best.ka && compareIds(kb, best.kb) < 0)));
        if (better) best = { a, b, link: l, ka, kb };
      }
    }
    if (!best) break;
    const merged = [...clusters[best.a], ...clusters[best.b]];
    clusters = clusters.filter((_, k) => k !== best!.a && k !== best!.b);
    clusters.push(merged);
  }

  const groups = clusters.map((c) => {
    let mx = 0;
    for (const i of c) for (const j of c) if (i !== j) mx = Math.max(mx, angles[i][j] as number);
    return describe(c, mx);
  });
  sortGroups(groups);
  return { mode: 'groups', groups, matchingIdvIds, pairs };
}

function sortGroups(groups: DirectionalGroup[]): void {
  groups.sort((a, b) => b.shared - a.shared || compareIds(a.memberIds[0], b.memberIds[0]));
}
