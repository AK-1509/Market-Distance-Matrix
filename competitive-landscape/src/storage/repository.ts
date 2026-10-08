import { IS_ARTIFACT, useCapability } from '../app/env';
import { createDemoProject } from '../domain/fixtures';
import type { LayoutResult, Project } from '../domain/types';
import { AccountBackend, DexieBackend, MemoryBackend, type DbLike, type StorageBackend, type StorageKind } from './backends';
import { getDb, type SnapshotRecord } from './db';

export interface ProjectSummary {
  id: string;
  name: string;
  marketDescription: string;
  updatedAt: string;
  productCount: number;
}

let override: StorageBackend | null = null;
let resolving: Promise<StorageBackend> | null = null;

export function setBackendForTests(backend: StorageBackend | null): void {
  override = backend;
  resolving = null;
}

async function resolveBackend(): Promise<StorageBackend> {
  if (IS_ARTIFACT) {
    // Inside the claude.ai viewer: the viewer's private db subtree when signed in.
    const [db, user] = await Promise.all([
      useCapability<DbLike>('db'),
      useCapability<{ id(): Promise<string | null> }>('user'),
    ]);
    const uid = user ? await user.id() : null;
    if (db && uid) {
      const account = new AccountBackend(db, uid);
      try {
        await account.listProjects();
        return account;
      } catch {
        // Fall through to browser storage.
      }
    }
  }
  try {
    await getDb().open();
    return new DexieBackend();
  } catch {
    return new MemoryBackend();
  }
}

export function getBackend(): Promise<StorageBackend> {
  if (override) return Promise.resolve(override);
  if (!resolving) resolving = resolveBackend();
  return resolving;
}

export async function storageKind(): Promise<StorageKind> {
  return (await getBackend()).kind;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await (await getBackend()).listProjects();
  return all
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      marketDescription: p.marketDescription,
      updatedAt: p.updatedAt,
      productCount: p.products.length,
    }));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await getBackend()).getProject(id);
}

/** Insert a brand-new project. Fails rather than overwrite an existing ID. */
export async function addProject(project: Project): Promise<void> {
  await (await getBackend()).addProject(project);
}

/** Save the current draft (debounced by the caller). Resolves only when committed. */
export async function saveDraft(project: Project): Promise<void> {
  await (await getBackend()).putProject(project);
}

export async function deleteProject(id: string): Promise<void> {
  await (await getBackend()).deleteProject(id);
}

export async function getSnapshot(projectId: string): Promise<SnapshotRecord | undefined> {
  return (await getBackend()).getSnapshot(projectId);
}

export async function saveSnapshot(project: Project, inputHash: string, layout: LayoutResult): Promise<void> {
  await (await getBackend()).putSnapshot({
    projectId: project.id,
    revision: project.revision,
    inputHash,
    analyzedAt: new Date().toISOString(),
    project: structuredClone(project),
    layout,
  });
}

/** Load the fictional example as a new project (fresh IDs every time). */
export async function createExampleProject(): Promise<Project> {
  const project = createDemoProject();
  await addProject(project);
  return project;
}

export interface ImportOutcome {
  project: Project;
  warnings: string[];
}

/** Validate first, then insert as a new project. Never overwrites. */
export async function importProjectText(text: string): Promise<ImportOutcome> {
  // Validation (Zod) loads on demand to keep the main bundle small.
  const { asNewProject, parseProjectFile } = await import('../domain/schema');
  const parsed = parseProjectFile(text);
  const names = (await listProjects()).map((p) => p.name);
  const project = asNewProject(parsed, names);
  await addProject(project);
  if (parsed.layoutCache) {
    // Re-use the exported layout only as a warm start; it is applied as the
    // current map only if its input hash matches the re-computed analysis.
    await (await getBackend()).putSnapshot({
      projectId: project.id,
      revision: project.revision,
      inputHash: parsed.layoutCache.inputHash,
      analyzedAt: new Date().toISOString(),
      project: structuredClone(project),
      layout: parsed.layoutCache,
    });
  }
  return { project, warnings: parsed.warnings };
}

/** Human-readable message for Errors and capability error objects ({code, message}). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
