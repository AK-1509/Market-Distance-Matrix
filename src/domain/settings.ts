/**
 * Model and data-limit constants. Disclosed in the methodology text; these are
 * transparent defaults, not statistically validated thresholds.
 */
export const MODEL_SETTINGS = {
  /** Maximum products in a project, including the IDV. */
  maxProducts: 50,
  /** Maximum customer segments in a project taxonomy. */
  maxSegments: 30,
  /** Allocation fractions must sum to 1 within this absolute tolerance. */
  allocationTolerance: 1e-6,
  /** Relative tolerance used when comparing market sizes against TAM. */
  marketTolerance: 1e-9,
  /** Distances at or below this are treated as "same footprint as IDV". */
  zeroRadius: 1e-9,
  /** Similarity within this of 1 is treated as exactly 1 (float clean-up only). */
  similaritySnap: 1e-12,
  /** Displayed points closer than this (model units) form a coincident stack. */
  coincidenceTolerance: 1e-6,
  grouping: {
    /** Complete-link limit on native angle between any two members (degrees). */
    maxAngleDeg: 30,
    /** Complete-link limit on IDV-distance difference between any two members. */
    maxRadiusDiff: 0.25,
    /** Below this many directional competitors, report pairs, not groups. */
    minCompetitorsForGroups: 3,
  },
  crowding: {
    /** Below this many competitors, report counts without relative labels. */
    minCompetitorsForLabels: 3,
  },
  optimizer: {
    starts: 12,
    maxIterations: 2000,
    /** Stop a start when relative loss improvement stays below this for `patience` steps. */
    convergenceTolerance: 1e-10,
    patience: 25,
    /** Relative loss difference under which two candidates count as equal fits. */
    equalFitTolerance: 1e-9,
  },
} as const;

export const TEXT_LIMITS = {
  name: 120,
  description: 600,
  shortText: 200,
  notes: 5000,
  url: 2048,
  maxSources: 50,
} as const;

export const IMPORT_LIMITS = {
  maxFileBytes: 5_000_000,
} as const;
