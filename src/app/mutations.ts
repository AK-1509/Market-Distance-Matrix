/** Immutable project edits used by the UI. None of these rescale or reset user data silently. */
import { equalAllocations } from '../domain/allocation';
import { newId } from '../domain/ids';
import type { Product, Project, Segment } from '../domain/types';

export function upsertProduct(project: Project, product: Product, opts: { makeIdv: boolean; newSegments?: Segment[] }): Project {
  const exists = project.products.some((p) => p.id === product.id);
  const products = exists ? project.products.map((p) => (p.id === product.id ? product : p)) : [...project.products, product];
  let idvProductId = project.idvProductId;
  if (opts.makeIdv) idvProductId = product.id;
  else if (idvProductId === product.id) idvProductId = null;
  return { ...project, products, idvProductId, segments: [...project.segments, ...(opts.newSegments ?? [])] };
}

export function deleteProduct(project: Project, productId: string): Project {
  const { anchorProductId, ...rest } = project.layoutSettings;
  return {
    ...project,
    products: project.products.filter((p) => p.id !== productId),
    idvProductId: project.idvProductId === productId ? null : project.idvProductId,
    layoutSettings: anchorProductId === productId ? rest : project.layoutSettings,
  };
}

export function createSegment(name: string): Segment {
  return { id: newId('seg'), name: name.trim() };
}

export function renameSegment(project: Project, segmentId: string, name: string): Project {
  return { ...project, segments: project.segments.map((s) => (s.id === segmentId ? { ...s, name } : s)) };
}

/**
 * Remove a segment from the taxonomy and from every product. Equal splits are recomputed;
 * custom splits keep their other shares, so their total may need adjusting (reported by validation).
 */
export function removeSegment(project: Project, segmentId: string): Project {
  return {
    ...project,
    segments: project.segments.filter((s) => s.id !== segmentId),
    products: project.products.map((p) => {
      if (!p.allocations.some((a) => a.segmentId === segmentId)) return p;
      const remaining = p.allocations.filter((a) => a.segmentId !== segmentId);
      return { ...p, allocations: p.allocationMode === 'equal' ? equalAllocations(remaining.map((a) => a.segmentId)) : remaining };
    }),
  };
}

export function segmentUsage(project: Project, segmentId: string): number {
  return project.products.filter((p) => p.allocations.some((a) => a.segmentId === segmentId)).length;
}
