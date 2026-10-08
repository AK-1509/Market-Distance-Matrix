// Tiny synthetic fixtures, used only by tests (not an onboarding choice).

import { createProduct, createProject } from '../src/domain/factory';
import type { Product, Project } from '../src/domain/types';

export interface Row {
  id: string;
  name?: string;
  sam: number;
  /** segment name -> amount; converted to exact fractions. */
  amounts: Record<string, number>;
}

/** Build a valid project from literal per-segment amounts. First row is the IDV. */
export function projectFromRows(rows: Row[], tam: number, segmentNames?: string[]): Project {
  const names = segmentNames ?? [...new Set(rows.flatMap((r) => Object.keys(r.amounts)))].sort();
  const project = createProject({ name: 'Test', marketDescription: 'Synthetic', tam, marketUnit: 'customers', referenceDate: '2026' });
  project.segments = names.map((n) => ({ id: `seg_${n}`, name: n }));
  project.products = rows.map(
    (r): Product =>
      createProduct({
        id: r.id,
        name: r.name ?? r.id,
        description: `${r.id} test product`,
        sam: r.sam,
        allocationMode: 'custom',
        allocations: Object.entries(r.amounts)
          .filter(([, v]) => v > 0)
          .map(([s, v]) => ({ segmentId: `seg_${s}`, fraction: v / r.sam })),
      }),
  );
  project.idvProductId = rows[0].id;
  return project;
}

/**
 * Brief §10 tiny fixture: IDV SAM 100 split 60 P / 40 D; an identical product;
 * a disjoint product (SAM 100, only C); a product with SAM 30 only in P.
 */
export function tinyProject(): Project {
  return projectFromRows(
    [
      { id: 'a_idv', sam: 100, amounts: { P: 60, D: 40 } },
      { id: 'b_same', sam: 100, amounts: { P: 60, D: 40 } },
      { id: 'c_disjoint', sam: 100, amounts: { C: 100 } },
      { id: 'd_small', sam: 30, amounts: { P: 30 } },
    ],
    1000,
  );
}

/** Deterministic pseudo-random fixtures for property-style checks. */
export function randomProject(seed: number, products: number, segments: number): Project {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const segNames = Array.from({ length: segments }, (_, k) => `S${k}`);
  const rows: Row[] = Array.from({ length: products }, (_, i) => {
    const sam = Math.round(50 + rnd() * 950);
    const chosen = segNames.filter(() => rnd() < 0.5);
    if (chosen.length === 0) chosen.push(segNames[Math.floor(rnd() * segments)]);
    const weights = chosen.map(() => 0.2 + rnd());
    const total = weights.reduce((a, b) => a + b, 0);
    const amounts: Record<string, number> = {};
    chosen.forEach((n, k) => (amounts[n] = (sam * weights[k]) / total));
    return { id: `p${String(i).padStart(2, '0')}`, sam, amounts };
  });
  return projectFromRows(rows, 1e9, segNames);
}
