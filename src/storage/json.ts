/** Portable JSON backup: export and validated import. */
import { newId } from '../domain/ids';
import { IMPORT_LIMITS } from '../domain/settings';
import { MODEL_VERSION, SCHEMA_VERSION, type LayoutCache, type Project } from '../domain/types';
import { describeZodError, LayoutCacheSchema, ProjectSchema } from './schema';

export const EXPORT_FORMAT = 'market-landscape-project';
export const APP_VERSION = '0.1.0';

export interface ProjectExport {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  modelVersion: string;
  appVersion: string;
  exportedAt: string;
  project: Project;
  layoutCache?: LayoutCache;
}

export function exportProjectJson(project: Project, layoutCache?: LayoutCache | null, now = new Date().toISOString()): string {
  const payload: ProjectExport = {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now,
    project,
    ...(layoutCache ? { layoutCache } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

export class ImportError extends Error {
  readonly details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.details = details;
  }
}

export interface ParsedImport {
  project: Project;
  layoutCache: LayoutCache | null;
  /** The ID the project had in the file (it is always imported under a new ID). */
  originalId: string;
}

/**
 * Validate a JSON export before anything touches storage. The result always carries a
 * new project ID, so importing can never overwrite an existing project.
 */
export function parseProjectImport(text: string, byteLength = new TextEncoder().encode(text).length): ParsedImport {
  if (byteLength > IMPORT_LIMITS.maxFileBytes) {
    throw new ImportError(`File is too large (${(byteLength / 1e6).toFixed(1)} MB). The limit is ${IMPORT_LIMITS.maxFileBytes / 1e6} MB.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('This file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ImportError('This file is not a Market Landscape project export.');
  const env = raw as Record<string, unknown>;
  if (env.format !== EXPORT_FORMAT || !env.project || typeof env.project !== 'object') {
    throw new ImportError('This file is not a Market Landscape project export (missing "format" or "project").');
  }
  const fileVersion = env.schemaVersion;
  const projectVersion = (env.project as Record<string, unknown>).schemaVersion;
  for (const v of [fileVersion, projectVersion]) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
      throw new ImportError('The project schema version is missing or invalid.');
    }
    if (v > SCHEMA_VERSION) {
      throw new ImportError(
        `This file uses project schema version ${v}, which is newer than this app supports (version ${SCHEMA_VERSION}). Open it with a newer version of Market Landscape.`,
      );
    }
  }
  const parsed = ProjectSchema.safeParse(env.project);
  if (!parsed.success) {
    throw new ImportError('The project file failed validation. Nothing was imported.', describeZodError(parsed.error));
  }
  let layoutCache: LayoutCache | null = null;
  if (env.layoutCache !== undefined) {
    const lc = LayoutCacheSchema.safeParse(env.layoutCache);
    if (!lc.success) throw new ImportError('The layout cache in this file is malformed. Nothing was imported.', describeZodError(lc.error));
    layoutCache = lc.data;
  }
  const project = parsed.data as Project;
  return { project: { ...project, id: newId('prj') }, layoutCache, originalId: project.id };
}
