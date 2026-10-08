import { MODEL_VERSION, SCHEMA_VERSION } from './constants';
import { newId } from './ids';
import type { Product, Project } from './types';

export function createProject(init: Partial<Pick<Project, 'name' | 'marketDescription' | 'tam' | 'marketUnit' | 'referenceDate' | 'notes'>> = {}): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    name: init.name ?? '',
    marketDescription: init.marketDescription ?? '',
    tam: init.tam ?? null,
    marketUnit: init.marketUnit ?? 'customers',
    referenceDate: init.referenceDate ?? String(new Date().getFullYear()),
    idvProductId: null,
    segments: [],
    products: [],
    sources: [],
    notes: init.notes,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    modelVersion: MODEL_VERSION,
    layoutSettings: { seed: 1, showSegments: false },
  };
}

export function createProduct(init: Partial<Product> = {}): Product {
  return {
    id: init.id ?? newId('prd'),
    name: init.name ?? '',
    description: init.description ?? '',
    sam: init.sam ?? null,
    som: init.som ?? null,
    somHorizon: init.somHorizon,
    allocations: init.allocations ?? [],
    allocationMode: init.allocationMode ?? 'equal',
    price: init.price ?? { kind: 'unknown' },
    evidenceStatus: init.evidenceStatus ?? 'estimated',
    sources: init.sources ?? [],
    notes: init.notes,
  };
}
