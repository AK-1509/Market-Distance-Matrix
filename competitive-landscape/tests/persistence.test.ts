import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/domain/analysis';
import { createDemoProject } from '../src/domain/fixtures';
import { buildLayoutInput, computeLayout } from '../src/domain/layout';
import { buildExportEnvelope, ImportError, parseProjectFile } from '../src/domain/schema';
import { MODEL_VERSION, SCHEMA_VERSION } from '../src/domain/constants';
import type { Project } from '../src/domain/types';
import { LandscapeDB, setDbForTests } from '../src/storage/db';
import {
  addProject,
  createExampleProject,
  getProject,
  getSnapshot,
  importProjectText,
  listProjects,
  saveDraft,
  saveSnapshot,
} from '../src/storage/repository';
import { LayoutCoordinator } from '../src/worker/coordinator';
import type { LayoutJobRequest, LayoutJobResponse, WorkerLike } from '../src/worker/protocol';

let db: LandscapeDB;
let n = 0;
beforeEach(() => {
  db = new LandscapeDB(`test-${++n}`);
  setDbForTests(db);
});
afterEach(async () => {
  await db.delete();
  setDbForTests(null);
});

function exportText(project: Project): string {
  const o = analyzeProject(project);
  const layout = o.status === 'ok' ? computeLayout(buildLayoutInput(o.analysis)) : null;
  return JSON.stringify(buildExportEnvelope(project, layout), null, 2);
}

/** Inputs only: what a round trip must preserve (IDs, numbers, text, settings). */
function inputs(p: Project) {
  const { id: _id, updatedAt: _u, name: _n, ...rest } = p;
  return rest;
}

describe('IndexedDB persistence', () => {
  it('saves drafts (even invalid ones) and lists them by last modified', async () => {
    const p = createDemoProject();
    await addProject(p);
    const draft = { ...structuredClone(p), tam: -1, revision: 1, updatedAt: new Date(Date.now() + 1000).toISOString() };
    await saveDraft(draft);
    expect((await getProject(p.id))?.tam).toBe(-1);
    const list = await listProjects();
    expect(list[0].id).toBe(p.id);
  });

  it('keeps the last valid snapshot separate from the draft', async () => {
    const p = createDemoProject();
    await addProject(p);
    const o = analyzeProject(p);
    if (o.status !== 'ok') throw new Error('demo');
    await saveSnapshot(p, o.analysis.inputHash, computeLayout(buildLayoutInput(o.analysis)));
    await saveDraft({ ...structuredClone(p), tam: 1, revision: 2 });
    const snap = await getSnapshot(p.id);
    expect(snap?.project.tam).toBe(1_000_000);
    expect(snap?.inputHash).toBe(o.analysis.inputHash);
  });

  it('loading the example twice creates two projects with different IDs', async () => {
    const a = await createExampleProject();
    const b = await createExampleProject();
    expect(a.id).not.toBe(b.id);
    expect(a.products[0].id).not.toBe(b.products[0].id);
    expect(await listProjects()).toHaveLength(2);
  });

  it('addProject never overwrites an existing project', async () => {
    const p = createDemoProject();
    await addProject(p);
    await expect(addProject({ ...p, name: 'Overwrite attempt' })).rejects.toThrow();
    expect((await getProject(p.id))?.name).toBe(p.name);
  });
});

describe('JSON export / import', () => {
  it('round-trips inputs, IDs, settings and model version as a new project', async () => {
    const original = createDemoProject();
    original.products[1].sources = [{ id: 'src_1', url: 'https://example.com/report', title: 'Report', appliesTo: ['sam'] }];
    original.products[1].som = 20_000;
    original.products[1].price = { kind: 'published', amount: 20, currency: 'USD', period: 'month', basis: 'per user' };
    original.layoutSettings.showSegments = true;
    await addProject(original);
    const text = exportText(original);
    const { project: imported } = await importProjectText(text);

    expect(imported.id).not.toBe(original.id);
    expect(inputs(imported)).toEqual(inputs(original));
    expect(imported.modelVersion).toBe(MODEL_VERSION);
    expect(imported.name).toBe(`${original.name} (imported)`);
    expect((await getProject(original.id))?.name).toBe(original.name); // untouched
    expect(await listProjects()).toHaveLength(2);

    const a1 = analyzeProject(original);
    const a2 = analyzeProject(imported);
    if (a1.status !== 'ok' || a2.status !== 'ok') throw new Error('both must analyse');
    expect(a2.analysis.inputHash).toBe(a1.analysis.inputHash);
    expect(a2.analysis.competitors).toEqual(a1.analysis.competitors);
    // Exported layout cache is carried along and matches the recomputed hash.
    expect((await getSnapshot(imported.id))?.inputHash).toBe(a1.analysis.inputHash);
  });

  const envelope = () => JSON.parse(exportText(createDemoProject()));
  type Envelope = ReturnType<typeof envelope>;
  /** `mutate` edits the parsed envelope in place, or returns replacement file text. */
  const rejects = (mutate: (e: Envelope) => void | { text: string }, pattern: RegExp) => {
    const e = envelope();
    const replaced = mutate(e);
    const text = replaced ? replaced.text : JSON.stringify(e);
    let caught: unknown;
    try {
      parseProjectFile(text);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ImportError);
    const err = caught as ImportError;
    expect([err.message, ...err.details].join(' | ')).toMatch(pattern);
  };

  it('explains unknown future schema versions', () => {
    rejects((e) => void (e.schemaVersion = SCHEMA_VERSION + 1), /newer version/);
  });
  it('rejects files that are not project exports', () => {
    rejects(() => ({ text: '{"hello": 1}' }), /not a Market Landscape project/);
    rejects(() => ({ text: 'not json' }), /not valid JSON/);
  });
  it('rejects non-finite numbers', () => {
    rejects((e) => ({ text: JSON.stringify(e).replace('"tam":1000000', '"tam":1e999') }), /tam: must be a finite number/);
  });
  it('rejects dangling IDs and malformed allocations', () => {
    rejects((e) => void (e.project.idvProductId = 'prd_missing'), /idvProductId/);
    rejects((e) => void (e.project.products[1].allocations[0].segmentId = 'seg_missing'), /unknown segment/);
    rejects((e) => void (e.project.products[1].allocations[0].fraction = 1.5), /outside 0\.\.1/);
    rejects((e) => void e.project.products[1].allocations.push({ ...e.project.products[1].allocations[0] }), /allocated twice/);
  });
  it('rejects executable markup and non-http URLs', () => {
    rejects((e) => void (e.project.products[1].name = '<img src=x onerror=alert(1)>'), /markup/);
    rejects((e) => void (e.project.products[1].sources = [{ id: 's1', url: 'javascript:alert(1)' }]), /markup|http/);
    rejects((e) => void (e.project.sources = [{ id: 's1', url: 'ftp://example.com/x' }]), /http/);
  });
  it('rejects oversized files and unknown fields', () => {
    rejects(() => ({ text: ' '.repeat(5_000_001) }), /limit/);
    rejects((e) => void (e.project.products[0].unexpected = true), /malformed/);
  });
  it('a rejected import changes nothing in storage', async () => {
    const p = createDemoProject();
    await addProject(p);
    await expect(importProjectText('{"format":"market-landscape-project","schemaVersion":99}')).rejects.toThrow(ImportError);
    expect(await listProjects()).toHaveLength(1);
  });
});

describe('layout coordinator', () => {
  class FakeWorker implements WorkerLike {
    onmessage: WorkerLike['onmessage'] = null;
    onerror: WorkerLike['onerror'] = null;
    posted: LayoutJobRequest[] = [];
    terminated = false;
    postMessage(m: LayoutJobRequest) {
      this.posted.push(m);
    }
    terminate() {
      this.terminated = true;
    }
    reply(r: LayoutJobResponse) {
      this.onmessage?.({ data: r });
    }
  }

  const demo = analyzeProject(createDemoProject());
  if (demo.status !== 'ok') throw new Error('demo');
  const input = buildLayoutInput(demo.analysis);
  const result = computeLayout(input);

  it('rejects stale worker results after a later edit', async () => {
    const workers: FakeWorker[] = [];
    const c = new LayoutCoordinator(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const first = c.request({ ...input, inputHash: 'rev-1' });
    const second = c.request({ ...input, inputHash: 'rev-2' });
    expect(await first).toEqual({ status: 'superseded' });
    expect(workers[0].terminated).toBe(true);
    // A late reply for job 1 (e.g. already in flight) must be ignored even on the live worker.
    workers[1].reply({ jobId: 1, inputHash: 'rev-1', result: { ...result, inputHash: 'rev-1' } });
    expect(c.staleDropped).toBe(1);
    workers[1].reply({ jobId: 2, inputHash: 'rev-2', result: { ...result, inputHash: 'rev-2' } });
    const out = await second;
    expect(out.status).toBe('done');
    if (out.status === 'done') expect(out.result.inputHash).toBe('rev-2');
  });

  it('falls back to main-thread layout when the worker cannot start', async () => {
    const broken = new FakeWorker();
    const c = new LayoutCoordinator(() => broken);
    const p = c.request(input);
    broken.onerror?.({ message: 'Failed to load worker script' });
    const out = await p;
    expect(c.usingFallback).toBe(true);
    expect(out.status).toBe('done');
    if (out.status === 'done') expect(out.result.positions).toEqual(result.positions);
    // Later jobs keep using the fallback.
    const again = await c.request(input);
    expect(again.status).toBe('done');
  });

  it('reports worker errors without hanging', async () => {
    const w = new FakeWorker();
    const c = new LayoutCoordinator(() => w);
    const p = c.request(input);
    w.reply({ jobId: 1, inputHash: input.inputHash, error: 'boom' });
    expect(await p).toEqual({ status: 'failed', error: 'boom' });
  });
});
