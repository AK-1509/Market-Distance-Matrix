import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeProject } from '../domain/analysis';
import { createProduct } from '../domain/factory';
import { MODEL_VERSION } from '../domain/types';
import { createExampleProject } from '../fixtures/example';
import { LandscapeDB } from './db';
import { exportProjectJson, ImportError, parseProjectImport } from './json';
import { ProjectRepository } from './repository';

let db: LandscapeDB;
let repo: ProjectRepository;
let n = 0;

beforeEach(async () => {
  db = new LandscapeDB(`test-${n++}`);
  await db.open();
  repo = new ProjectRepository(db);
});
afterEach(async () => {
  db.close();
  await db.delete();
});

function envelope(mutate: (p: Record<string, any>) => void, envMutate?: (e: Record<string, any>) => void): string {
  const env = JSON.parse(exportProjectJson(createExampleProject()));
  mutate(env.project);
  envMutate?.(env);
  return JSON.stringify(env);
}

describe('JSON round trip', () => {
  it('preserves all inputs, IDs, settings, and model version; imports under a new project ID', async () => {
    const original = createExampleProject();
    original.products[1].price = { kind: 'published', amount: 20, currency: 'USD', period: 'month', basis: 'per user', note: 'list price' };
    original.products[1].sources = [{ id: 'src_1', url: 'https://example.com/pricing', title: 'Pricing page', appliesTo: ['price'] }];
    original.products[2].som = 0;
    original.products[2].somHorizon = '3 years';
    await repo.save(original);
    const json = exportProjectJson(original);
    const imported = await repo.importJson(json);

    expect(imported.id).not.toBe(original.id);
    expect(imported.name).toBe(`${original.name} (imported)`);
    const strip = (p: typeof original) => ({ ...p, id: 'x', name: 'x' });
    expect(strip(imported)).toEqual(strip(original));
    expect(imported.modelVersion).toBe(MODEL_VERSION);

    // Both projects exist; the original is untouched.
    const all = await repo.list();
    expect(all.map((p) => p.id).sort()).toEqual([original.id, imported.id].sort());
    expect(await repo.get(original.id)).toEqual(original);

    // Metrics are equal after import.
    const a = analyzeProject(original);
    const b = analyzeProject(imported);
    expect(b.competitors).toEqual(a.competitors);
    expect(b.modeledUnion).toBe(a.modeledUnion);
  });

  it('round-trips the layout cache into a snapshot', async () => {
    const p = createExampleProject();
    const cache = { inputHash: '0123456789abcdef', modelVersion: MODEL_VERSION, anchorProductId: p.products[1].id, angles: { [p.products[1].id]: 0 }, loss: 0.1 };
    const imported = await repo.importJson(exportProjectJson(p, cache));
    const snap = await repo.getSnapshot(imported.id);
    expect(snap?.layout).toEqual(cache);
    expect(snap?.project.id).toBe(imported.id);
  });

  it('never overwrites an existing project, even when the file carries its ID', async () => {
    const p = createExampleProject();
    await repo.save(p);
    const modified = structuredClone(p);
    modified.name = 'Changed elsewhere';
    const imported = await repo.importJson(exportProjectJson(modified));
    expect(imported.id).not.toBe(p.id);
    expect((await repo.get(p.id))?.name).toBe(p.name);
  });
});

describe('import validation', () => {
  const rejects = (text: string, pattern: RegExp) => {
    let err: unknown;
    try {
      parseProjectImport(text);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ImportError);
    const e = err as ImportError;
    expect([e.message, ...e.details].join(' | ')).toMatch(pattern);
  };

  it('rejects malformed JSON and foreign files', () => {
    rejects('{not json', /not valid JSON/);
    rejects(JSON.stringify({ hello: 'world' }), /not a Market Landscape project/);
  });

  it('gives a useful error for a newer schema version', () => {
    rejects(envelope(() => {}, (e) => (e.schemaVersion = 99)), /newer than this app supports/);
    rejects(envelope((p) => (p.schemaVersion = 2)), /schema version 2/);
  });

  it('rejects nonfinite numbers', () => {
    const text = envelope((p) => (p.tam = 12345)).replace('12345', '1e999');
    rejects(text, /tam/);
  });

  it('rejects dangling references', () => {
    rejects(envelope((p) => (p.idvProductId = 'prd_missing')), /IDV refers to a product that does not exist/);
    rejects(envelope((p) => (p.products[0].allocations[0].segmentId = 'seg_missing')), /unknown segment/);
    rejects(envelope((p) => (p.layoutSettings.anchorProductId = 'prd_gone')), /anchor/);
  });

  it('rejects malformed allocations', () => {
    rejects(envelope((p) => (p.products[0].allocations[0].fraction = 1.5)), /between 0 and 1/);
    rejects(envelope((p) => p.products[0].allocations.push({ ...p.products[0].allocations[0] })), /allocated twice/);
  });

  it('rejects executable markup and non-HTTP(S) links', () => {
    rejects(envelope((p) => (p.products[0].name = '<script>alert(1)</script>')), /markup/);
    rejects(envelope((p) => (p.products[0].notes = '<img src=x onerror=alert(1)>')), /markup/);
    rejects(envelope((p) => (p.products[0].sources = [{ id: 's1', url: 'javascript:alert(1)' }])), /http/);
    rejects(envelope((p) => (p.sources = [{ id: 's1', url: 'file:///etc/passwd' }])), /http/);
  });

  it('rejects oversized files and too many products', () => {
    expect(() => parseProjectImport('{}', 6_000_000)).toThrow(/too large/);
    rejects(
      envelope((p) => {
        p.products = Array.from({ length: 51 }, (_, i) => createProduct({ id: `p${i}`, name: `P${i}` }));
        p.idvProductId = 'p0';
      }),
      /at most 50 products/,
    );
  });

  it('accepts drafts the app can save (incomplete products, SAM above TAM)', () => {
    const text = envelope((p) => {
      p.products.push(createProduct({ id: 'prd_draft', name: 'Draft only' }));
      p.products[1].sam = 5_000_000;
    });
    const parsed = parseProjectImport(text);
    expect(parsed.project.products.at(-1)?.sam).toBeNull();
  });

  it('does not touch storage when validation fails', async () => {
    await expect(repo.importJson(envelope((p) => (p.idvProductId = 'nope')))).rejects.toBeInstanceOf(ImportError);
    expect(await repo.list()).toEqual([]);
  });
});

describe('repository', () => {
  it('opening the example twice creates two independent projects', async () => {
    const a = await repo.createExample();
    const b = await repo.createExample();
    expect(a.id).not.toBe(b.id);
    expect(a.products[0].id).not.toBe(b.products[0].id);
    expect(a.segments[0].id).not.toBe(b.segments[0].id);
    expect((await repo.list()).length).toBe(2);
  });

  it('deletes a project with its snapshot', async () => {
    const p = await repo.createExample();
    await repo.saveSnapshot({ projectId: p.id, revision: 1, inputHash: '0123456789abcdef', modelVersion: MODEL_VERSION, savedAt: '', project: p, layout: { inputHash: '0123456789abcdef', modelVersion: MODEL_VERSION, anchorProductId: null, angles: {}, loss: 0 } });
    await repo.delete(p.id);
    expect(await repo.get(p.id)).toBeUndefined();
    expect(await repo.getSnapshot(p.id)).toBeUndefined();
  });
});
