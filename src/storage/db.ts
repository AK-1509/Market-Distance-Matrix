/**
 * IndexedDB persistence via Dexie. Data belongs to this browser and origin only; the
 * JSON export is the durable, user-controlled backup.
 *
 * - `projects`: editable drafts (may be incomplete or invalid).
 * - `snapshots`: the last VALID analysis per project (inputs copy + layout cache),
 *   kept separate so an invalid draft can never masquerade as analyzed data.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { LayoutCache, Project } from '../domain/types';

export interface AnalysisSnapshot {
  projectId: string;
  revision: number;
  inputHash: string;
  modelVersion: string;
  savedAt: string;
  /** Copy of the draft exactly as analyzed. */
  project: Project;
  layout: LayoutCache;
}

export class LandscapeDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  snapshots!: EntityTable<AnalysisSnapshot, 'projectId'>;

  constructor(name = 'market-landscape') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      snapshots: 'projectId',
    });
  }
}
