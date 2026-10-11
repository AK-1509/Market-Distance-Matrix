/** Project CRUD over IndexedDB. All writes resolve only after the transaction commits. */
import { createProject } from '../domain/factory';
import type { LayoutCache, Project } from '../domain/types';
import { createExampleProject } from '../fixtures/example';
import type { AnalysisSnapshot, LandscapeDB } from './db';
import { parseProjectImport } from './json';

export class ProjectRepository {
  readonly db: LandscapeDB;
  constructor(db: LandscapeDB) {
    this.db = db;
  }

  async list(): Promise<Project[]> {
    return this.db.projects.orderBy('updatedAt').reverse().toArray();
  }

  get(id: string): Promise<Project | undefined> {
    return this.db.projects.get(id);
  }

  async save(project: Project): Promise<void> {
    await this.db.projects.put(structuredClone(project));
  }

  async create(init: Partial<Project>): Promise<Project> {
    const project = createProject(init);
    await this.db.projects.add(project);
    return project;
  }

  /** Always a fresh copy with new IDs; never touches existing projects. */
  async createExample(): Promise<Project> {
    const project = createExampleProject();
    await this.db.projects.add(project);
    return project;
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.projects, this.db.snapshots, async () => {
      await this.db.projects.delete(id);
      await this.db.snapshots.delete(id);
    });
  }

  getSnapshot(projectId: string): Promise<AnalysisSnapshot | undefined> {
    return this.db.snapshots.get(projectId);
  }

  async saveSnapshot(snapshot: AnalysisSnapshot): Promise<void> {
    await this.db.snapshots.put(structuredClone(snapshot));
  }

  /**
   * Validate first, then add as a NEW project (new ID; name suffixed if it collides).
   * `add` (not `put`) guarantees an existing record is never overwritten.
   */
  async importJson(text: string, byteLength?: number): Promise<Project> {
    const parsed = parseProjectImport(text, byteLength);
    const existing = await this.db.projects.toArray();
    const names = new Set(existing.map((p) => p.name));
    let name = parsed.project.name;
    if (names.has(name)) {
      let k = 1;
      let candidate = `${name} (imported)`;
      while (names.has(candidate)) candidate = `${name} (imported ${++k})`;
      name = candidate;
    }
    const project: Project = { ...parsed.project, name };
    await this.db.transaction('rw', this.db.projects, this.db.snapshots, async () => {
      await this.db.projects.add(project);
      if (parsed.layoutCache) await this.saveImportedLayout(project, parsed.layoutCache);
    });
    return project;
  }

  private async saveImportedLayout(project: Project, layout: LayoutCache): Promise<void> {
    await this.db.snapshots.put({
      projectId: project.id,
      revision: project.revision,
      inputHash: layout.inputHash,
      modelVersion: layout.modelVersion,
      savedAt: new Date().toISOString(),
      project: structuredClone(project),
      layout,
    });
  }
}
