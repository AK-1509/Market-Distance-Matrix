// IndexedDB persistence via Dexie. Data stays in this browser and origin.
//
// `projects` holds the editable draft (always saved, even when invalid).
// `snapshots` holds the last *valid* analysed state per project: a copy of
// the inputs at that revision plus the fitted layout. A draft that cannot be
// analysed therefore never overwrites or masquerades as the analysed result.

import Dexie, { type EntityTable } from 'dexie';
import type { LayoutResult, Project } from '../domain/types';

export interface SnapshotRecord {
  projectId: string;
  revision: number;
  inputHash: string;
  analyzedAt: string;
  project: Project;
  layout: LayoutResult;
}

export class LandscapeDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  snapshots!: EntityTable<SnapshotRecord, 'projectId'>;

  constructor(name = 'market-landscape') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      snapshots: 'projectId',
    });
  }
}

let instance: LandscapeDB | null = null;

export function getDb(): LandscapeDB {
  if (!instance) instance = new LandscapeDB();
  return instance;
}

export function setDbForTests(db: LandscapeDB | null): void {
  instance = db;
}
