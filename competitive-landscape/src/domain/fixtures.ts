// The one-click fictional demo. Every call returns a fresh copy with new IDs,
// so loading the example never overwrites a user project.

import { createProduct, createProject } from './factory';
import { newId } from './ids';
import type { Project } from './types';

export const DEMO_TITLE = 'AI assistants — fictional market footprints';

const SEGMENTS = ['Programmers', 'Designers', 'Casual/daily users', 'Image generation users'] as const;

/** Amounts per segment, in the order of SEGMENTS. Converted to exact fractions below. */
const DEMO_ROWS: { name: string; sam: number; amounts: [number, number, number, number]; description: string }[] = [
  {
    name: 'ChatGPT',
    sam: 500_000,
    amounts: [150_000, 0, 200_000, 150_000],
    description: 'Fictional fixture: a general assistant footprint weighted toward casual users, with programmer and image-generation slices.',
  },
  {
    name: 'Claude',
    sam: 350_000,
    amounts: [200_000, 150_000, 0, 0],
    description: 'Fictional fixture: a footprint concentrated on programmers and designers.',
  },
  {
    name: 'Gemini',
    sam: 350_000,
    amounts: [100_000, 0, 250_000, 0],
    description: 'Fictional fixture: a footprint led by casual/daily users with a programmer slice.',
  },
  {
    name: 'Grok',
    sam: 250_000,
    amounts: [0, 150_000, 0, 100_000],
    description: 'Fictional fixture: a footprint split between designers and image-generation users.',
  },
  {
    name: 'DeepSeek',
    sam: 150_000,
    amounts: [150_000, 0, 0, 0],
    description: 'Fictional fixture: a footprint addressing programmers only.',
  },
];

export function createDemoProject(): Project {
  const project = createProject({
    name: DEMO_TITLE,
    marketDescription:
      'Illustrative only: people who could use a general-purpose AI assistant. All numbers are invented to demonstrate the method; ' +
      'they do not describe any real company’s market, usage, prices or capabilities, and product names imply no affiliation.',
    tam: 1_000_000,
    marketUnit: 'potential customers',
    referenceDate: String(new Date().getFullYear()),
    notes: 'Fictional example fixture. Statuses are illustrative, prices and SOM are unknown, and there are no references.',
  });
  project.segments = SEGMENTS.map((name) => ({ id: newId('seg'), name }));
  project.products = DEMO_ROWS.map((row) =>
    createProduct({
      name: row.name,
      description: row.description,
      sam: row.sam,
      allocationMode: 'custom',
      // Exact fractions from the source amounts; formatting happens only on display.
      allocations: row.amounts
        .map((amount, k) => ({ segmentId: project.segments[k].id, fraction: amount / row.sam }))
        .filter((a) => a.fraction > 0),
      evidenceStatus: 'illustrative',
      price: { kind: 'unknown' },
    }),
  );
  project.idvProductId = project.products[0].id;
  return project;
}
