/**
 * Core data contract. These types are shared by the analysis layer, storage,
 * import/export, and UI. The analysis layer never depends on UI or storage.
 */

export const SCHEMA_VERSION = 1;
export const MODEL_VERSION = 'overlap-nested-1.0.0';

export type EvidenceStatus = 'estimated' | 'planned' | 'sourced' | 'illustrative';
export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = ['estimated', 'planned', 'sourced', 'illustrative'];

/** Inputs a source can be attached to. Empty/undefined appliesTo means "general". */
export type SourceTopic = 'tam' | 'description' | 'sam' | 'som' | 'segments' | 'price' | 'general';
export const SOURCE_TOPICS: readonly SourceTopic[] = ['tam', 'description', 'sam', 'som', 'segments', 'price', 'general'];

export interface Source {
  id: string;
  title?: string;
  url: string;
  note?: string;
  accessedAt?: string;
  appliesTo?: SourceTopic[];
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
}

export interface SegmentAllocation {
  segmentId: string;
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
  basis?: string;
  note?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sam: number | null;
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
  /** Set on projects created from the built-in fictional fixture. */
  isExample?: boolean;
}

/** A 2D point in model units (distance units, IDV at origin, y up). */
export interface Point {
  x: number;
  y: number;
}

/** Cached radial layout, stored with the last valid analysis snapshot. */
export interface LayoutCache {
  inputHash: string;
  modelVersion: string;
  anchorProductId: string | null;
  /** Angles in radians for competitors with a nonzero radius. */
  angles: Record<string, number>;
  loss: number;
}
