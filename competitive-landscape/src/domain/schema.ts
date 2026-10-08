// Runtime validation at the JSON import boundary, and the export envelope.

import { z } from 'zod';
import { APP_NAME, EXPORT_FORMAT, LIMITS, MODEL_VERSION, SCHEMA_VERSION } from './constants';
import { ID_PATTERN, newId } from './ids';
import { ImportError } from './importError';
import { isHttpUrl, MARKUP_PATTERN as MARKUP } from './validation';
import type { LayoutResult, Project } from './types';

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const id = z.string().regex(ID_PATTERN, 'must be a simple identifier');
const shortText = z.string().max(LIMITS.maxShortTextLength);

const sourceSchema = z.strictObject({
  id,
  title: shortText.optional(),
  url: z.string().max(LIMITS.maxUrlLength),
  note: z.string().max(LIMITS.maxNotesLength).optional(),
  accessedAt: shortText.optional(),
  appliesTo: z.array(shortText).max(20).optional(),
});

const priceSchema = z.strictObject({
  kind: z.enum(['free', 'published', 'quote', 'unknown']),
  amount: finite.optional(),
  currency: z.string().max(12).optional(),
  period: z.enum(['month', 'year', 'one-time', 'usage']).optional(),
  basis: shortText.optional(),
  note: z.string().max(LIMITS.maxNotesLength).optional(),
});

const productSchema = z.strictObject({
  id,
  name: z.string().max(LIMITS.maxNameLength),
  description: z.string().max(LIMITS.maxDescriptionLength),
  sam: finite.nullable(),
  som: finite.nullable(),
  somHorizon: shortText.optional(),
  allocations: z.array(z.strictObject({ segmentId: id, fraction: finite })).max(LIMITS.maxSegments),
  allocationMode: z.enum(['equal', 'custom']),
  price: priceSchema,
  evidenceStatus: z.enum(['estimated', 'planned', 'sourced', 'illustrative']),
  sources: z.array(sourceSchema).max(LIMITS.maxSourcesPerItem),
  notes: z.string().max(LIMITS.maxNotesLength).optional(),
});

export const projectSchema = z.strictObject({
  schemaVersion: z.number().int(),
  id,
  name: z.string().max(LIMITS.maxNameLength),
  marketDescription: z.string().max(LIMITS.maxDescriptionLength),
  tam: finite.nullable(),
  marketUnit: shortText,
  referenceDate: shortText,
  idvProductId: id.nullable(),
  segments: z
    .array(z.strictObject({ id, name: shortText, description: z.string().max(LIMITS.maxDescriptionLength).optional() }))
    .max(LIMITS.maxSegments),
  products: z.array(productSchema).max(LIMITS.maxProducts),
  sources: z.array(sourceSchema).max(LIMITS.maxSourcesPerItem),
  notes: z.string().max(LIMITS.maxNotesLength).optional(),
  revision: z.number().int().min(0),
  createdAt: shortText,
  updatedAt: shortText,
  modelVersion: shortText,
  layoutSettings: z.strictObject({
    seed: z.number().int(),
    anchorProductId: id.optional(),
    showSegments: z.boolean(),
  }),
});

const pointSchema = z.strictObject({ x: finite, y: finite });

export const layoutSchema = z.strictObject({
  inputHash: shortText,
  anchorId: id.nullable(),
  angles: z.record(id, finite.nullable()),
  positions: z.record(id, pointSchema),
  loss: finite,
  startsTried: z.number().int(),
  iterations: z.number().int(),
  bestStart: shortText,
  computeMs: finite,
});

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  modelVersion: string;
  app: string;
  exportedAt: string;
  /** IndexedDB storage is per browser and origin; this file is the portable backup. */
  note: string;
  project: Project;
  layoutCache: LayoutResult | null;
}

export function buildExportEnvelope(project: Project, layoutCache: LayoutResult | null): ExportEnvelope {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    app: APP_NAME,
    exportedAt: new Date().toISOString(),
    note: 'Portable Market Landscape project. Import it as a new project from the Projects page.',
    project,
    layoutCache,
  };
}

export { ImportError };


function scanStrings(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'string') {
    if (MARKUP.test(value)) out.push(`${path || 'value'} contains markup or a script URL`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanStrings(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scanStrings(v, path ? `${path}.${k}` : k, out);
  }
}

/** JSON.parse turns 1e999 into Infinity; report such values by path before schema checks. */
function nonFiniteNumbers(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path || 'value'}: must be a finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => nonFiniteNumbers(v, `${path}.${i}`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) nonFiniteNumbers(v, path ? `${path}.${k}` : k, out);
  }
}

function referenceProblems(project: Project): string[] {
  const problems: string[] = [];
  const productIds = new Set<string>();
  for (const p of project.products) {
    if (productIds.has(p.id)) problems.push(`duplicate product ID ${p.id}`);
    productIds.add(p.id);
  }
  const segmentIds = new Set<string>();
  for (const s of project.segments) {
    if (segmentIds.has(s.id)) problems.push(`duplicate segment ID ${s.id}`);
    segmentIds.add(s.id);
  }
  if (project.idvProductId !== null && !productIds.has(project.idvProductId)) {
    problems.push('idvProductId does not match any product');
  }
  const anchor = project.layoutSettings.anchorProductId;
  if (anchor !== undefined && !productIds.has(anchor)) problems.push('layoutSettings.anchorProductId does not match any product');
  for (const p of project.products) {
    const seen = new Set<string>();
    for (const a of p.allocations) {
      if (!segmentIds.has(a.segmentId)) problems.push(`${p.name || p.id}: allocation refers to unknown segment ${a.segmentId}`);
      if (seen.has(a.segmentId)) problems.push(`${p.name || p.id}: segment allocated twice`);
      seen.add(a.segmentId);
      if (a.fraction < 0 || a.fraction > 1) problems.push(`${p.name || p.id}: allocation fraction outside 0..1`);
    }
    for (const n of [p.sam, p.som, p.price.amount]) {
      if (n !== null && n !== undefined && (n < 0 || n > LIMITS.maxQuantity)) problems.push(`${p.name || p.id}: number out of range`);
    }
  }
  if (project.tam !== null && (project.tam < 0 || project.tam > LIMITS.maxQuantity)) problems.push('TAM out of range');
  const allSources = [...project.sources, ...project.products.flatMap((p) => p.sources)];
  for (const s of allSources) {
    if (!isHttpUrl(s.url)) problems.push(`source URL is not http(s): ${s.url.slice(0, 80)}`);
  }
  return problems;
}

export interface ParsedImport {
  project: Project;
  layoutCache: LayoutResult | null;
  warnings: string[];
}

/** Validate an exported file before anything touches storage. */
export function parseProjectFile(text: string): ParsedImport {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > LIMITS.maxImportBytes) {
    throw new ImportError(`The file is ${(bytes / 1e6).toFixed(1)} MB; the limit is ${LIMITS.maxImportBytes / 1e6} MB.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ImportError('The file is not a Market Landscape project.');
  const env = data as Record<string, unknown>;
  if (env.format !== EXPORT_FORMAT) {
    throw new ImportError('The file is not a Market Landscape project export (missing "format": "market-landscape-project").');
  }
  const version = env.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ImportError('The file has no valid schemaVersion.');
  }
  if (version > SCHEMA_VERSION) {
    throw new ImportError(
      `This file uses schema version ${version}, written by a newer version of Market Landscape. This app reads schema version ${SCHEMA_VERSION}. Update the app, or re-export from the newer version.`,
    );
  }

  const nonFinite: string[] = [];
  nonFiniteNumbers(env.project, '', nonFinite);
  if (nonFinite.length) throw new ImportError('The project contains numbers that are not finite.', nonFinite.slice(0, 12));

  const parsed = projectSchema.safeParse(env.project);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || 'project'}: ${i.message}`);
    throw new ImportError('The project data is malformed.', details);
  }
  const project = parsed.data as Project;
  if (project.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(`The project uses schema version ${project.schemaVersion}, newer than this app supports (${SCHEMA_VERSION}).`);
  }

  const markup: string[] = [];
  scanStrings(env.project, 'project', markup);
  if (markup.length) throw new ImportError('The file contains executable markup and was rejected.', markup.slice(0, 12));

  const problems = referenceProblems(project);
  if (problems.length) throw new ImportError('The project has inconsistent references or values.', problems.slice(0, 12));

  const warnings: string[] = [];
  let layoutCache: LayoutResult | null = null;
  if (env.layoutCache !== undefined && env.layoutCache !== null) {
    const lc = layoutSchema.safeParse(env.layoutCache);
    if (lc.success) layoutCache = lc.data as LayoutResult;
    else warnings.push('The saved map layout was unreadable and will be recomputed.');
  }
  if (project.modelVersion !== MODEL_VERSION) {
    warnings.push(`The file was analysed with model ${project.modelVersion}; it will be re-analysed with ${MODEL_VERSION}.`);
  }
  return { project, layoutCache, warnings };
}

/**
 * Turn a parsed file into a new project record. It always gets a fresh
 * project ID so an import can never overwrite an existing project; product,
 * segment and source IDs are kept so the file round-trips exactly.
 */
export function asNewProject(parsed: ParsedImport, existingNames: readonly string[]): Project {
  const p = structuredClone(parsed.project);
  p.id = newId('prj');
  p.schemaVersion = SCHEMA_VERSION;
  p.modelVersion = MODEL_VERSION;
  p.updatedAt = new Date().toISOString();
  if (existingNames.includes(p.name)) p.name = `${p.name} (imported)`.slice(0, LIMITS.maxNameLength);
  return p;
}
