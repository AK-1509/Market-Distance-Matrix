export const SCHEMA_VERSION = 1;
export const MODEL_VERSION = 'nested-overlap-1.0';
export const EXPORT_FORMAT = 'market-landscape-project';
export const APP_NAME = 'Market Landscape';

export const LIMITS = {
  maxProducts: 50,
  maxSegments: 30,
  maxSourcesPerItem: 25,
  maxNameLength: 120,
  maxDescriptionLength: 600,
  maxNotesLength: 5000,
  maxShortTextLength: 200,
  maxUrlLength: 2048,
  maxImportBytes: 5_000_000,
  /** Generous ceiling that keeps sums of SAMs far inside exact double range. */
  maxQuantity: 1e15,
} as const;

/**
 * Model settings. These are transparent defaults disclosed in the
 * methodology; they are not statistically validated thresholds.
 */
export const MODEL_SETTINGS = {
  /** IDV distances below this are treated as "same footprint as IDV". */
  zeroRadiusEpsilon: 1e-9,
  /** 1 - G below this is floating-point noise; the distance is reported as 0. */
  similaritySnap: 1e-12,
  /** Allocation fractions must sum to 1 within this tolerance. */
  allocationTolerance: 1e-6,
  /** Relative tolerance when checking modelled union <= TAM. */
  unionRelativeTolerance: 1e-9,
  /** Complete-link directional grouping: every cross pair must satisfy both limits. */
  groupMaxAngleDeg: 30,
  groupMaxRadiusDiff: 0.25,
  /** Fewer competitors than this: report pair relationships instead of groups. */
  minCompetitorsForGroups: 3,
  /** Segment crowding labels (share of competitors with a positive allocation). */
  crowdedShare: 0.5,
  lessCoveredShare: 0.25,
  minCompetitorsForCrowdingLabels: 3,
} as const;

export const LAYOUT_BUDGET = {
  starts: 12,
  maxIterations: 2000,
  learningRate: 0.05,
  /** Convergence: stop when a 50-iteration window improves the loss by less than this. */
  windowSize: 50,
  absoluteTolerance: 1e-12,
  relativeTolerance: 1e-9,
} as const;

export const MARKET_UNIT_PRESETS = ['customers', 'organizations'] as const;
