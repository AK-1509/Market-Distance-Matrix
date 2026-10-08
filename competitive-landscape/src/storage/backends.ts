// Storage backends behind one interface.
//
// - Browser (Dexie/IndexedDB): the standalone app, and the artifact's fallback.
// - Account (artifact `db` capability): each viewer's projects live in their
//   own private `data/users/<id>/` subtree, kept across devices and republishes.
// - Memory: last resort when neither is available; nothing survives a reload.

import type { Project } from '../domain/types';
import type { SnapshotRecord } from './db';
import { getDb } from './db';

export type StorageKind = 'account' | 'browser' | 'memory';

export interface StorageBackend {
  kind: StorageKind;
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  /** Insert only; rejects if the ID already exists. */
  addProject(project: Project): Promise<void>;
  putProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getSnapshot(projectId: string): Promise<SnapshotRecord | undefined>;
  putSnapshot(record: SnapshotRecord): Promise<void>;
}

/** JSON round-trip: drops `undefined`, and detaches frozen store objects. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class DexieBackend implements StorageBackend {
  kind: StorageKind = 'browser';
  async listProjects() {
    return getDb().projects.toArray();
  }
  async getProject(id: string) {
    return getDb().projects.get(id);
  }
  async addProject(project: Project) {
    await getDb().projects.add(project);
  }
  async putProject(project: Project) {
    await getDb().projects.put(project);
  }
  async deleteProject(id: string) {
    const db = getDb();
    await db.transaction('rw', db.projects, db.snapshots, async () => {
      await db.projects.delete(id);
      await db.snapshots.delete(id);
    });
  }
  async getSnapshot(projectId: string) {
    return getDb().snapshots.get(projectId);
  }
  async putSnapshot(record: SnapshotRecord) {
    await getDb().snapshots.put(record);
  }
}

export class MemoryBackend implements StorageBackend {
  kind: StorageKind = 'memory';
  private projects = new Map<string, Project>();
  private snapshots = new Map<string, SnapshotRecord>();
  async listProjects() {
    return [...this.projects.values()].map((p) => structuredClone(p));
  }
  async getProject(id: string) {
    const p = this.projects.get(id);
    return p ? structuredClone(p) : undefined;
  }
  async addProject(project: Project) {
    if (this.projects.has(project.id)) throw new Error(`Project ${project.id} already exists.`);
    this.projects.set(project.id, structuredClone(project));
  }
  async putProject(project: Project) {
    this.projects.set(project.id, structuredClone(project));
  }
  async deleteProject(id: string) {
    this.projects.delete(id);
    this.snapshots.delete(id);
  }
  async getSnapshot(projectId: string) {
    const s = this.snapshots.get(projectId);
    return s ? structuredClone(s) : undefined;
  }
  async putSnapshot(record: SnapshotRecord) {
    this.snapshots.set(record.projectId, structuredClone(record));
  }
}

// ---------------------------------------------------------------- artifact db

/** The subset of the artifact `db` capability this backend uses (fakeable in tests). */
export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface QueryLike {
  where(field: string, op: string, value: unknown): QueryLike;
  get(): Promise<{ docs: DocSnap[] }>;
}
export interface CollectionLike extends QueryLike {
  doc(id: string): DocRef;
}
export interface DbLike {
  collection(path: string): CollectionLike;
}

/**
 * One document per project (`p_<id>`) and one per last-valid snapshot
 * (`s_<id>`) in the viewer's private collection `data/users/<uid>`.
 * Writes to the same document are serialised (the store asks for one write
 * at a time per document).
 */
export class AccountBackend implements StorageBackend {
  kind: StorageKind = 'account';
  private chains = new Map<string, Promise<unknown>>();
  constructor(
    private readonly db: DbLike,
    private readonly uid: string,
  ) {}

  private col(): CollectionLike {
    return this.db.collection(`data/users/${this.uid}`);
  }

  private serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const guarded = async () => {
      try {
        return await fn();
      } catch (e) {
        // The store refuses writes below the viewer's sharing level with
        // `invalid_argument`; explain it instead of a raw code.
        if (e && typeof e === 'object' && (e as { code?: string }).code === 'invalid_argument') {
          throw new Error('Your access to this page does not allow saving projects. Ask the owner for Contributor access, or export a JSON backup.');
        }
        throw e;
      }
    };
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(guarded, guarded);
    this.chains.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  async listProjects() {
    const snap = await this.col().where('kind', '==', 'project').get();
    return snap.docs.filter((d) => d.exists).map((d) => plain((d.data() as { project: Project }).project));
  }

  async getProject(id: string) {
    const d = await this.col().doc(`p_${id}`).get();
    return d.exists ? plain((d.data() as { project: Project }).project) : undefined;
  }

  async addProject(project: Project) {
    const ref = this.col().doc(`p_${project.id}`);
    await this.serial(`p_${project.id}`, async () => {
      if ((await ref.get()).exists) throw new Error(`Project ${project.id} already exists.`);
      await ref.set({ kind: 'project', updatedAt: project.updatedAt, project: plain(project) });
    });
  }

  async putProject(project: Project) {
    const ref = this.col().doc(`p_${project.id}`);
    await this.serial(`p_${project.id}`, () => ref.set({ kind: 'project', updatedAt: project.updatedAt, project: plain(project) }));
  }

  async deleteProject(id: string) {
    await this.serial(`p_${id}`, () => this.col().doc(`p_${id}`).delete());
    await this.serial(`s_${id}`, () => this.col().doc(`s_${id}`).delete());
  }

  async getSnapshot(projectId: string) {
    const d = await this.col().doc(`s_${projectId}`).get();
    return d.exists ? plain((d.data() as { record: SnapshotRecord }).record) : undefined;
  }

  async putSnapshot(record: SnapshotRecord) {
    const ref = this.col().doc(`s_${record.projectId}`);
    await this.serial(`s_${record.projectId}`, () => ref.set({ kind: 'snapshot', record: plain(record) }));
  }
}
