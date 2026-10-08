import { LAYOUT_BUDGET, MODEL_SETTINGS, MODEL_VERSION } from './constants';

export interface MethodSection {
  title: string;
  paragraphs: string[];
  formulas?: string[];
}

/** Methodology text shared by the app and the exported report. */
export function methodology(): MethodSection[] {
  const S = MODEL_SETTINGS;
  return [
    {
      title: 'Inputs',
      paragraphs: [
        'Each product has a SAM (M) in the project’s market unit and a split of that SAM across shared customer-segment tags. By default the SAM is split equally across the selected segments; a custom split must total 100%.',
        'Each tag is treated as a distinct market slice. The same customers should not appear under two tags, because the model would count them twice.',
      ],
      formulas: ['m_is = M_i × p_is   (addressed amount of product i in segment s)'],
    },
    {
      title: 'Modelled overlap and distance',
      paragraphs: [
        'Real customer overlap cannot be recovered from SAM totals and segment names. The model therefore uses modelled shared segment capacity: within a shared segment the smaller addressed population is assumed to lie inside the larger one (a maximum-overlap, nested-coverage assumption). This is a modelling choice, not an observation, and nothing in the data proves the nesting.',
        'G is a cosine-style similarity in [0, 1]. The distance d is 0 for identical modelled footprints and 1 for footprints with no shared segment. It is a modelled market distance, not a percentage of customers.',
      ],
      formulas: [
        'O_ij = Σ_s min(m_is, m_js)',
        'G_ij = O_ij / √(M_i × M_j)',
        'd_ij = √(max(0, 1 − clamp(G_ij, 0, 1)))',
      ],
    },
    {
      title: 'Market accounting',
      paragraphs: [
        'Under the same assumption the union of all modelled footprints is the sum, over segments, of the largest addressed amount. It must not exceed the TAM; if it does, the app keeps the draft and asks for the TAM, SAMs or splits to be reconciled. Nothing is rescaled automatically.',
        'The sum of SAMs may exceed the TAM because footprints overlap. TAM minus the modelled union is “outside the modelled footprints”, not proven unmet demand. The TAM is never used as a chart scale.',
      ],
      formulas: ['modelled union = Σ_s max_i m_is ≤ TAM'],
    },
    {
      title: 'Metrics relative to the IDV',
      paragraphs: [
        'For each competitor i (IDV = 0): shared market = O_0i; IDV exposure = O_0i / M_0; competitor exposure = O_0i / M_i; distance = d_0i. Closeness, absolute shared market and the two directional exposures are ranked separately because they answer different questions.',
        `Native angular separation between competitors i and j, as seen from the IDV, comes from the law of cosines on the exact distances. It is undefined when a competitor’s footprint matches the IDV’s (distance below ${S.zeroRadiusEpsilon}). These are pairwise separations in the model’s high-dimensional geometry, not 0–360° bearings.`,
      ],
      formulas: ['cos θ_ij = (d_0i² + d_0j² − d_ij²) / (2 d_0i d_0j)'],
    },
    {
      title: 'Directional groups',
      paragraphs: [
        `Competitors with a defined direction are grouped by deterministic complete-link agglomeration: repeatedly merge the eligible pair of groups with the smallest largest cross-pair angle, where a merge is eligible only if every cross pair is within ${S.groupMaxAngleDeg}° and within ${S.groupMaxRadiusDiff} of each other in distance from the IDV. Ties break by stable product ID.`,
        `Groups are ranked by unique modelled overlap with the IDV, Σ_s min(m_0s, max_{i∈group} m_is), so each market slice counts once. With fewer than ${S.minCompetitorsForGroups} directional competitors, pair relationships are reported instead. These thresholds are transparent defaults, not statistically validated values.`,
      ],
    },
    {
      title: 'Segment coverage',
      paragraphs: [
        `For each segment the summary counts competitors with a positive allocation and shows the IDV’s allocation. With at least ${S.minCompetitorsForCrowdingLabels} competitors, a segment is “More crowded” when at least ${S.crowdedShare * 100}% of competitors are present and “Less covered in this comparison” when at most ${S.lessCoveredShare * 100}% are. These labels describe the compared set only; they do not measure demand or profitability.`,
      ],
    },
    {
      title: 'Exact distance bars',
      paragraphs: [
        'The bar chart shows d_0i directly on one fixed 0–1 scale for every project. No dimensionality reduction is involved.',
      ],
    },
    {
      title: 'Radial map',
      paragraphs: [
        'The IDV sits at the centre. Each competitor is plotted at radius r_i = d_0i exactly — the same value as its bar — and only its angle is fitted, minimising the squared error between plotted and native competitor-to-competitor distances. This is a constrained fit, not ordinary multidimensional scaling, and in general not every pairwise distance can be preserved in two dimensions.',
        `The optimiser runs in a Web Worker: a warm start from the previous layout (when available), a deterministic law-of-cosines placement, and seeded random starts (${LAYOUT_BUDGET.starts} starts in total, at most ${LAYOUT_BUDGET.maxIterations} Adam iterations each with early stopping, then a monotone line-search polish). The lowest-loss result is kept. One non-zero-radius anchor product is fixed at angle 0 to remove arbitrary rotation and is kept across edits; the remaining reflection is aligned to the previous layout. Coordinates are never scaled. Products with identical footprints share a position and are drawn as one selectable stack.`,
        'Map distance error is the relative RMS error over all pairs, √(Σ residual² / Σ native distance²), where residual = displayed − native distance; the maximum absolute error and worst pair are also shown. It measures how well the flat map reproduces the model, not confidence in the data.',
      ],
      formulas: [
        'x_i = d_0i cos φ_i,  y_i = d_0i sin φ_i',
        'loss = Σ_{i<j} (‖p_i − p_j‖ − d_ij)²',
      ],
    },
    {
      title: 'Modelled segment centres',
      paragraphs: [
        'The optional overlay plots, for each segment, the coverage-weighted centre of the plotted products: z_s = Σ_i m_is p_i / Σ_i m_is. It summarises the entered footprints, not measured preferences, users won or market share. Different distributions can produce the same centre; select a centre to see its allocations.',
      ],
    },
    {
      title: 'Price and SOM',
      paragraphs: [
        'Comparable price is context only. Annual prices are divided by 12 for a monthly equivalent only when currency and billing basis match; per-team and per-seat prices are never compared, currencies are never converted, and quotes or unknown prices are never treated as free. SOM is an optional scenario estimate and is never described as current users or market share.',
      ],
    },
    {
      title: 'Future work (not in this version)',
      paragraphs: [
        'Feature weights, adoption or choice-share predictions, automated competitor detection, overlapping personas and longitudinal market-change inference are outside this MVP.',
      ],
    },
    {
      title: 'Version',
      paragraphs: [`Model ${MODEL_VERSION}.`],
    },
  ];
}
