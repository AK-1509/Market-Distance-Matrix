import { LandscapeDB } from './db';
import { ProjectRepository } from './repository';

export const db = new LandscapeDB();
export const repo = new ProjectRepository(db);
