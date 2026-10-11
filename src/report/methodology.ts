/** Methodology text shared by the app and the exported report. Plain text only. */
import { MODEL_SETTINGS } from '../domain/settings';
import { MODEL_VERSION } from '../domain/types';

export type MethodSection = 'overlap' | 'distance' | 'exposure' | 'union' | 'angles' | 'grouping' | 'crowding' | 'layout' | 'segments' | 'price';

export interface MethodBlock {
  id: MethodSection;
  title: string;
  paragraphs: string[];
}

const g = MODEL_SETTINGS.grouping;
const o = MODEL_SETTINGS.optimizer;

export const METHODOLOGY: MethodBlock[] = [
  {
    id: 'overlap',
    title: 'Modeled shared segment capacity',
    paragraphs: [
      'Each product i has a SAM M_i split across customer segments with fractions p_is (equal by default, or a custom split totaling 100%). Its modeled amount in segment s is m_is = M_i × p_is.',
      'Overlap between two products is O_ij = Σ_s min(m_is, m_js). This assumes the smaller addressed population within a shared segment lies inside the larger one — a maximum-overlap (nested coverage) modeling assumption, not an observation. The data do not prove nesting; real overlap may be lower.',
      'Each segment tag is treated as a distinct market slice; the same customers should not be counted in two tags. SAM totals and segment names alone cannot identify actual customer overlap, so this model never claims to recover real market share.',
    ],
  },
  {
    id: 'distance',
    title: 'Modeled market distance',
    paragraphs: [
      'Similarity is G_ij = O_ij / √(M_i × M_j), and distance is d_ij = √(1 − clamp(G_ij, 0, 1)). Identical modeled footprints have distance 0; products with no shared segment have distance 1.',
      'This distance is the Euclidean distance between unit vectors in an exact high-dimensional construction (threshold vectors per segment), divided by √2, so it is symmetric, lies in [0, 1], and satisfies the triangle inequality. It is not a percentage of customers.',
      'Features, prices, brand popularity, text similarity, and subjective multipliers are not used.',
    ],
  },
  {
    id: 'exposure',
    title: 'Shared market and exposure',
    paragraphs: [
      'For competitor i: shared market = O_0i; IDV exposure = O_0i / M_0 (share of the IDV’s modeled SAM the competitor also addresses); competitor exposure = O_0i / M_i (share of the competitor’s modeled SAM the IDV also addresses).',
      'Distance, absolute shared market, and directional exposure are ranked separately: the closest competitor is not necessarily the one with the largest shared market.',
    ],
  },
  {
    id: 'union',
    title: 'Modeled union and TAM',
    paragraphs: [
      'The modeled union of the analyzed footprints is Σ_s max_i m_is — each modeled segment slice counted once. It must not exceed TAM; if it does, the draft is kept and the analysis pauses until TAM, SAMs, or splits are reconciled. Nothing is rescaled automatically.',
      'Summed SAMs may exceed TAM because footprints overlap. TAM minus the modeled union is “outside the modeled footprints”, not proven unmet demand. TAM caps market accounting; it is not converted into chart radius.',
    ],
  },
  {
    id: 'angles',
    title: 'Native directions from the IDV',
    paragraphs: [
      'The native angle between competitors i and j as seen from the IDV is acos((d_0i² + d_0j² − d_ij²) / (2 d_0i d_0j)). It is undefined when a competitor’s footprint matches the IDV (distance 0).',
      'Native angles are pairwise separations in a high-dimensional geometry, not 0–360° bearings. Empty wedges of the map are not market opportunities.',
    ],
  },
  {
    id: 'grouping',
    title: 'Directional groups',
    paragraphs: [
      `Competitors are grouped by deterministic complete-link agglomeration: the eligible pair of groups with the smallest maximum native angle merges first, and every cross-group pair must be within ${g.maxAngleDeg}° and within ${g.maxRadiusDiff} of each other’s IDV distance. Ties break by stable product IDs. Matching-IDV footprints are listed separately.`,
      `Groups are ranked by unique modeled overlap with the IDV, Σ_s min(m_0s, max over group members of m_is), which counts each modeled slice once. With fewer than ${g.minCompetitorsForGroups} directional competitors, pairwise angles are reported instead of groups. These thresholds are transparent defaults, not statistically validated.`,
    ],
  },
  {
    id: 'crowding',
    title: 'Segment coverage',
    paragraphs: [
      `For each segment, the count of analyzed competitors with a positive allocation is shown with the IDV’s allocation. With at least ${MODEL_SETTINGS.crowding.minCompetitorsForLabels} competitors, segments above the average count across covered segments are labeled “More crowded” and those below “Less covered in this comparison”.`,
      'These labels describe the entered footprints only. They do not measure demand, profitability, or an untapped market.',
    ],
  },
  {
    id: 'layout',
    title: 'Radial map and map distance error',
    paragraphs: [
      'The IDV sits at the center. Each competitor is placed at its exact modeled distance from the IDV, so radii match the distance bars. Only angles are fitted, minimizing Σ_(i<j) (displayed_ij − d_ij)² over competitor pairs. Coordinates are never scaled.',
      `The fit uses seeded multistart gradient descent with backtracking (${o.starts} starts — warm start from the previous layout, a classical-MDS ordering, an even ordering, then seeded random starts — up to ${o.maxIterations} iterations each, stopping when loss stops improving). The lowest-loss result is kept; one nonzero-radius anchor competitor is fixed to the reference direction, and reflection is aligned with the previous layout. Products with identical positions are drawn as one selectable stack, never jittered.`,
      'Map distance error = √(Σ residual² / Σ native distance²) over all plotted pairs (IDV pairs are exact by construction), plus the largest absolute pair gap. It measures 2D projection distortion only — not data confidence and not a percentage of wrong customers. Reports always use native distances, not map coordinates.',
    ],
  },
  {
    id: 'segments',
    title: 'Modeled segment centers',
    paragraphs: [
      'A modeled segment center is the coverage-weighted average of plotted product positions, z_s = Σ_i m_is x_i / Σ_i m_is. It summarizes the footprint inputs — not measured preferences, users won, or market share. Different allocations can produce the same point; selecting a center shows its contributions.',
    ],
  },
  {
    id: 'price',
    title: 'Price and SOM context',
    paragraphs: [
      'Comparable price is context only and never enters the geometry. Prices are compared only when currency and billing basis match; a yearly price gets a monthly equivalent (÷ 12) only within such a group, and the original price is kept. No currency conversion, no invented seat counts, and quotes or unknown prices are never treated as free.',
      'SOM is an optional scenario estimate (0 to SAM) with an optional horizon. It is never described as current users or measured market share, and a blank SOM means unknown, not zero.',
    ],
  },
];

export const MODEL_NOTE = `Model ${MODEL_VERSION}. Estimated overlap from SAM and segment splits under a nested-coverage assumption.`;

export const FUTURE_WORK =
  'Future work (not part of this MVP): feature weights, adoption or choice-share prediction, automated competitor detection, and longitudinal market-change inference.';
