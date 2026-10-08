// Deterministic complete-link agglomeration of competitors by direction
// from IDV (MODEL.md §3). Thresholds live in MODEL_SETTINGS.

import { MODEL_SETTINGS } from './constants';
import { compareIds } from './ids';

export interface DirectionalGroup {
  memberIds: string[];
  /** Largest native angle (radians) between any two members; 0 for singletons. */
  maxAngle: number;
}

export interface GroupingInput {
  /** Competitor IDs with a defined direction (non-zero IDV radius). */
  ids: readonly string[];
  radius: (id: string) => number;
  /** Native angle in radians, or null when undefined. */
  angle: (a: string, b: string) => number | null;
  maxAngleRad?: number;
  maxRadiusDiff?: number;
}

const TIE = 1e-12;

export function groupCompetitors(input: GroupingInput): DirectionalGroup[] {
  const maxAngle = input.maxAngleRad ?? (MODEL_SETTINGS.groupMaxAngleDeg * Math.PI) / 180;
  const maxRadiusDiff = input.maxRadiusDiff ?? MODEL_SETTINGS.groupMaxRadiusDiff;

  let clusters: DirectionalGroup[] = [...input.ids]
    .sort(compareIds)
    .map((id) => ({ memberIds: [id], maxAngle: 0 }));

  // Complete link: the cost of merging A and B is the largest cross-pair angle;
  // the merge is eligible only if every cross pair satisfies both limits.
  const linkCost = (a: DirectionalGroup, b: DirectionalGroup): number | null => {
    let worst = 0;
    for (const i of a.memberIds) {
      for (const j of b.memberIds) {
        const ang = input.angle(i, j);
        if (ang === null || ang > maxAngle + TIE) return null;
        if (Math.abs(input.radius(i) - input.radius(j)) > maxRadiusDiff + TIE) return null;
        worst = Math.max(worst, ang);
      }
    }
    return worst;
  };

  for (;;) {
    let best: { a: number; b: number; cost: number } | null = null;
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const cost = linkCost(clusters[a], clusters[b]);
        if (cost === null) continue;
        // Clusters are kept sorted by their smallest member ID, so scanning in
        // order and requiring a strict improvement breaks ties by stable IDs.
        if (best === null || cost < best.cost - TIE) best = { a, b, cost };
      }
    }
    if (best === null) break;
    const merged: DirectionalGroup = {
      memberIds: [...clusters[best.a].memberIds, ...clusters[best.b].memberIds].sort(compareIds),
      maxAngle: Math.max(clusters[best.a].maxAngle, clusters[best.b].maxAngle, best.cost),
    };
    clusters = clusters.filter((_, k) => k !== best.a && k !== best.b);
    clusters.push(merged);
    clusters.sort((x, y) => compareIds(x.memberIds[0], y.memberIds[0]));
  }
  return clusters;
}
