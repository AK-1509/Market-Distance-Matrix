import { newId } from './ids';
import { MODEL_VERSION, SCHEMA_VERSION, type Product, type Project } from './types';

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

export function createProject(init: Partial<Project> = {}, now = new Date().toISOString()): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: init.id ?? newId('prj'),
    name: init.name ?? 'Untitled landscape',
    marketDescription: init.marketDescription ?? '',
    tam: init.tam ?? null,
    marketUnit: init.marketUnit ?? 'customers',
    referenceDate: init.referenceDate ?? String(new Date(now).getFullYear()),
    idvProductId: init.idvProductId ?? null,
    segments: init.segments ?? [],
    products: init.products ?? [],
    sources: init.sources ?? [],
    notes: init.notes,
    revision: init.revision ?? 1,
    createdAt: init.createdAt ?? now,
    updatedAt: init.updatedAt ?? now,
    modelVersion: init.modelVersion ?? MODEL_VERSION,
    layoutSettings: init.layoutSettings ?? { seed: 20260101, showSegments: false },
    isExample: init.isExample,
  };
}
