import { createDemoProject } from '../domain/fixtures';
import { asNewProject, parseProjectFile, type ParsedImport } from '../domain/schema';
import type { LayoutResult, Project } from '../domain/types';
import { getDb, type SnapshotRecord } from './db';

export interface ProjectSummary {
  id: string;
  name: string;
  marketDescription: string;
  updatedAt: string;
  productCount: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await getDb().projects.orderBy('updatedAt').reverse().toArray();
  return all.map((p) => ({
    id: p.id,
    name: p.name,
    marketDescription: p.marketDescription,
    updatedAt: p.updatedAt,
    productCount: p.products.length,
  }));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return getDb().projects.get(id);
}

/** Insert a brand-new project. `add` fails rather than overwrite an existing ID. */
export async function addProject(project: Project): Promise<void> {
  await getDb().projects.add(project);
}

/** Save the current draft (debounced by the caller). Resolves only when committed. */
export async function saveDraft(project: Project): Promise<void> {
  await getDb().projects.put(project);
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.projects, db.snapshots, async () => {
    await db.projects.delete(id);
    await db.snapshots.delete(id);
  });
}

export async function getSnapshot(projectId: string): Promise<SnapshotRecord | undefined> {
  return getDb().snapshots.get(projectId);
}

export async function saveSnapshot(project: Project, inputHash: string, layout: LayoutResult): Promise<void> {
  await getDb().snapshots.put({
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
  const parsed: ParsedImport = parseProjectFile(text);
  const names = (await listProjects()).map((p) => p.name);
  const project = asNewProject(parsed, names);
  await addProject(project);
  if (parsed.layoutCache) {
    // Re-use the exported layout only as a warm start; it is applied as the
    // current map only if its input hash matches the re-computed analysis.
    await getDb().snapshots.put({
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
