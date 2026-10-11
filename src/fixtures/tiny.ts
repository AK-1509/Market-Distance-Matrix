/**
 * Tiny synthetic fixture used only by tests (not offered in the UI).
 * IDV: SAM 100 split 60 P / 40 D. Twin: identical. Disjoint: SAM 100 in C only.
 * Narrow: SAM 30 in P only → overlap 30, IDV exposure 30%, own exposure 100%,
 * distance sqrt(1 - 30/sqrt(3000)) ≈ 0.6725157563.
 */
import { createProduct, createProject } from '../domain/factory';
import type { Project } from '../domain/types';

export function createTinyProject(): Project {
  const seg = (id: string, name: string) => ({ id, name });
  return createProject(
    {
      id: 'prj_tiny',
      name: 'Tiny synthetic fixture',
      marketDescription: 'Synthetic test market',
      tam: 1000,
      marketUnit: 'customers',
      referenceDate: '2026',
      idvProductId: 'p_idv',
      segments: [seg('s_P', 'P'), seg('s_D', 'D'), seg('s_C', 'C')],
      products: [
        createProduct({
          id: 'p_idv',
          name: 'IDV',
          description: 'Main product',
          sam: 100,
          allocationMode: 'custom',
          allocations: [
            { segmentId: 's_P', fraction: 0.6 },
            { segmentId: 's_D', fraction: 0.4 },
          ],
        }),
        createProduct({
          id: 'p_twin',
          name: 'Twin',
          description: 'Identical footprint',
          sam: 100,
          allocationMode: 'custom',
          allocations: [
            { segmentId: 's_P', fraction: 0.6 },
            { segmentId: 's_D', fraction: 0.4 },
          ],
        }),
        createProduct({
          id: 'p_disjoint',
          name: 'Disjoint',
          description: 'Only segment C',
          sam: 100,
          allocations: [{ segmentId: 's_C', fraction: 1 }],
        }),
        createProduct({
          id: 'p_narrow',
          name: 'Narrow',
          description: 'Only segment P',
          sam: 30,
          allocations: [{ segmentId: 's_P', fraction: 1 }],
        }),
      ],
    },
    '2026-01-01T00:00:00.000Z',
  );
}
