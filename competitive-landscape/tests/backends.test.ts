import { describe, expect, it } from 'vitest';
import { AccountBackend, type CollectionLike, type DbLike, type DocRef, type DocSnap, type QueryLike } from '../src/storage/backends';
import { createDemoProject } from '../src/domain/fixtures';

/** Minimal in-memory stand-in for the artifact `db` capability (frozen reads, path checks). */
class FakeDb implements DbLike {
  docs = new Map<string, Record<string, unknown>>();
  writes: string[] = [];
  refuseWrites = false;

  collection(path: string): CollectionLike {
    if (path.split('/').length % 2 !== 1) throw new TypeError('collection path needs an odd number of segments');
    const snap = (id: string): DocSnap => {
      const body = this.docs.get(`${path}/${id}`);
      return { id, exists: body !== undefined, data: () => (body ? deepFreeze(structuredClone(body)) : undefined) };
    };
    const query = (filters: [string, unknown][]): QueryLike => ({
      where: (field, op, value) => {
        if (op !== '==') throw new Error('fake supports == only');
        return query([...filters, [field, value]]);
      },
      get: async () => ({
        docs: [...this.docs.keys()]
          .filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
          .map((k) => snap(k.slice(path.length + 1)))
          .filter((d) => filters.every(([f, v]) => (d.data() as Record<string, unknown>)[f] === v)),
      }),
    });
    return {
      ...query([]),
      doc: (id: string): DocRef => ({
        get: async () => snap(id),
        set: async (data) => {
          if (this.refuseWrites) throw { code: 'invalid_argument', message: 'below minimum level' };
          JSON.stringify(data); // must be plain JSON
          this.writes.push(`${path}/${id}`);
          this.docs.set(`${path}/${id}`, structuredClone(data));
        },
        delete: async () => {
          this.docs.delete(`${path}/${id}`);
        },
      }),
    };
  }
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

describe('account backend (artifact db capability)', () => {
  it('stores each project privately under data/users/<uid> and lists it back', async () => {
    const db = new FakeDb();
    const backend = new AccountBackend(db, 'u_abc');
    const p = createDemoProject();
    await backend.addProject(p);
    expect([...db.docs.keys()]).toEqual([`data/users/u_abc/p_${p.id}`]);
    const list = await backend.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(JSON.parse(JSON.stringify(p)));
    // Returned objects are detached from frozen store data.
    list[0].name = 'changed locally';
    expect((await backend.getProject(p.id))?.name).toBe(p.name);
  });

  it('never overwrites on add, but put saves drafts', async () => {
    const backend = new AccountBackend(new FakeDb(), 'u_abc');
    const p = createDemoProject();
    await backend.addProject(p);
    await expect(backend.addProject({ ...p, name: 'Overwrite attempt' })).rejects.toThrow(/already exists/);
    await backend.putProject({ ...p, tam: -1, revision: 3 });
    expect((await backend.getProject(p.id))?.tam).toBe(-1);
  });

  it('keeps snapshots separate, excludes them from the project list, and deletes both', async () => {
    const db = new FakeDb();
    const backend = new AccountBackend(db, 'u_abc');
    const p = createDemoProject();
    await backend.addProject(p);
    await backend.putSnapshot({
      projectId: p.id,
      revision: 0,
      inputHash: 'h',
      analyzedAt: '2026-10-08T00:00:00Z',
      project: p,
      layout: { inputHash: 'h', anchorId: null, angles: {}, positions: {}, loss: 0, startsTried: 0, iterations: 0, bestStart: 'trivial', computeMs: 0 },
    });
    expect(await backend.listProjects()).toHaveLength(1);
    expect((await backend.getSnapshot(p.id))?.inputHash).toBe('h');
    await backend.deleteProject(p.id);
    expect(db.docs.size).toBe(0);
  });

  it('drops undefined fields so every write is plain JSON', async () => {
    const db = new FakeDb();
    const backend = new AccountBackend(db, 'u_abc');
    const p = createDemoProject();
    p.notes = undefined;
    await backend.putProject(p);
    const stored = db.docs.get(`data/users/u_abc/p_${p.id}`) as { project: Record<string, unknown> };
    expect('notes' in stored.project).toBe(false);
  });

  it('explains a refused write instead of surfacing a raw code', async () => {
    const db = new FakeDb();
    db.refuseWrites = true;
    const backend = new AccountBackend(db, 'u_abc');
    await expect(backend.putProject(createDemoProject())).rejects.toThrow(/does not allow saving/);
  });
});
