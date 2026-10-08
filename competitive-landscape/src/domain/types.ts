// Core entities. Everything here is plain serialisable data so it can be
// stored in IndexedDB, exported as JSON and posted to a Web Worker unchanged.

export type EvidenceStatus = 'estimated' | 'planned' | 'sourced' | 'illustrative';

export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  'estimated',
  'planned',
  'sourced',
  'illustrative',
] as const;

export interface Source {
  id: string;
  title?: string;
  url: string;
  note?: string;
  accessedAt?: string;
  /** Which inputs this reference supports, e.g. `sam`, `price`, `segments`. */
  appliesTo?: string[];
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
}

export interface SegmentAllocation {
  segmentId: string;
  /** Share of the product's SAM in this segment, 0..1. */
  fraction: number;
}

export type AllocationMode = 'equal' | 'custom';

export type PriceKind = 'free' | 'published' | 'quote' | 'unknown';
export type PricePeriod = 'month' | 'year' | 'one-time' | 'usage';

export interface Price {
  kind: PriceKind;
  amount?: number;
  currency?: string;
  period?: PricePeriod;
  /** e.g. "per user", "per team", "per unit". Free text, compared case-insensitively. */
  basis?: string;
  note?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sam: number | null;
  /** Scenario estimate. `null` means unknown, which is different from zero. */
  som: number | null;
  somHorizon?: string;
  allocations: SegmentAllocation[];
  allocationMode: AllocationMode;
  price: Price;
  evidenceStatus: EvidenceStatus;
  sources: Source[];
  notes?: string;
}

export interface LayoutSettings {
  seed: number;
  anchorProductId?: string;
  showSegments: boolean;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  marketDescription: string;
  tam: number | null;
  marketUnit: string;
  referenceDate: string;
  idvProductId: string | null;
  segments: Segment[];
  products: Product[];
  sources: Source[];
  notes?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  modelVersion: string;
  layoutSettings: LayoutSettings;
}

/** Point in the radial map's data space (IDV at the origin, y up). */
export interface Point {
  x: number;
  y: number;
}

/** Output of the constrained radial optimiser. */
export interface LayoutResult {
  inputHash: string;
  anchorId: string | null;
  /** Angle in radians for every competitor with a defined direction; null when it matches IDV. */
  angles: Record<string, number | null>;
  /** Data-space coordinates for every analysed product, IDV included. */
  positions: Record<string, Point>;
  loss: number;
  startsTried: number;
  iterations: number;
  bestStart: string;
  computeMs: number;
}
