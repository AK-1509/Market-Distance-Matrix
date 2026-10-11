/**
 * "AI assistants — fictional market footprints". Illustrative numbers only: they do not
 * describe actual company markets, usage, prices, or capabilities, and imply no affiliation.
 * Each call returns a fresh copy with new IDs so loading the example never overwrites
 * a user project.
 */
import { createProduct, createProject } from '../domain/factory';
import { newId } from '../domain/ids';
import type { Project } from '../domain/types';

export const EXAMPLE_TITLE = 'AI assistants — fictional market footprints';

const SEGMENTS = [
  { key: 'prog', name: 'Programmers' },
  { key: 'design', name: 'Designers' },
  { key: 'casual', name: 'Casual/daily users' },
  { key: 'image', name: 'Image generation users' },
] as const;

type SegKey = (typeof SEGMENTS)[number]['key'];

const PRODUCTS: { name: string; idv?: boolean; sam: number; amounts: Partial<Record<SegKey, number>>; description: string }[] = [
  {
    name: 'ChatGPT',
    idv: true,
    sam: 500_000,
    amounts: { prog: 150_000, casual: 200_000, image: 150_000 },
    description: 'Fictional fixture footprint for a general-purpose assistant; illustrative numbers only.',
  },
  {
    name: 'Claude',
    sam: 350_000,
    amounts: { prog: 200_000, design: 150_000 },
    description: 'Fictional fixture footprint weighted toward programmers and designers; illustrative only.',
  },
  {
    name: 'Gemini',
    sam: 350_000,
    amounts: { prog: 100_000, casual: 250_000 },
    description: 'Fictional fixture footprint weighted toward casual/daily use; illustrative only.',
  },
  {
    name: 'Grok',
    sam: 250_000,
    amounts: { design: 150_000, image: 100_000 },
    description: 'Fictional fixture footprint across designers and image generation; illustrative only.',
  },
  {
    name: 'DeepSeek',
    sam: 150_000,
    amounts: { prog: 150_000 },
    description: 'Fictional fixture footprint focused on programmers; illustrative only.',
  },
];

export function createExampleProject(now = new Date().toISOString()): Project {
  const segIds = new Map<SegKey, string>(SEGMENTS.map((s) => [s.key, newId('seg')]));
  let idvId: string | null = null;
  const products = PRODUCTS.map((p) => {
    const product = createProduct({
      name: p.name,
      description: p.description,
      sam: p.sam,
      som: null,
      allocationMode: 'custom',
      // Exact internal fractions (amount / SAM); only display formatting rounds them.
      allocations: SEGMENTS.filter((s) => (p.amounts[s.key] ?? 0) > 0).map((s) => ({
        segmentId: segIds.get(s.key) as string,
        fraction: (p.amounts[s.key] as number) / p.sam,
      })),
      price: { kind: 'unknown' },
      evidenceStatus: 'illustrative',
      sources: [],
    });
    if (p.idv) idvId = product.id;
    return product;
  });
  return createProject(
    {
      name: EXAMPLE_TITLE,
      marketDescription:
        'Fictional example: potential customers for AI assistant products. Numbers are illustrative and do not describe real companies.',
      tam: 1_000_000,
      marketUnit: 'potential customers',
      referenceDate: '2026 (illustrative)',
      idvProductId: idvId,
      segments: SEGMENTS.map((s) => ({ id: segIds.get(s.key) as string, name: s.name })),
      products,
      sources: [],
      notes: 'All values are illustrative. Prices and SOM are intentionally unknown; no references are attached.',
      isExample: true,
    },
    now,
  );
}
