/**
 * Runtime validation at the import boundary. Rejects nonfinite numbers, dangling IDs,
 * malformed allocations, non-HTTP(S) URLs, executable markup, and oversized content.
 * Accepts every state the app itself can save (including incomplete drafts).
 */
import { z } from 'zod';
import { MODEL_SETTINGS, TEXT_LIMITS } from '../domain/settings';
import { containsExecutableMarkup, isHttpUrl } from '../domain/text';
import { EVIDENCE_STATUSES, SOURCE_TOPICS } from '../domain/types';

const MARKUP_MESSAGE = 'contains markup that could execute (e.g. <script> or javascript:)';

const text = (max: number) =>
  z
    .string()
    .max(max, `must be at most ${max} characters`)
    .refine((s) => !containsExecutableMarkup(s), MARKUP_MESSAGE);

const finite = () => z.number().refine(Number.isFinite, 'must be a finite number');

export const IdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'must contain only letters, digits, "_" or "-"');

export const SourceSchema = z.object({
  id: IdSchema,
  title: text(TEXT_LIMITS.shortText).optional(),
  url: z
    .string()
    .max(TEXT_LIMITS.url)
    .refine(isHttpUrl, 'must be an http:// or https:// URL')
    .refine((s) => !containsExecutableMarkup(s), MARKUP_MESSAGE),
  note: text(TEXT_LIMITS.description).optional(),
  accessedAt: text(40).optional(),
  appliesTo: z.array(z.enum(SOURCE_TOPICS as unknown as [string, ...string[]])).max(SOURCE_TOPICS.length).optional(),
});

const SourcesSchema = z
  .array(SourceSchema)
  .max(TEXT_LIMITS.maxSources)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: 'custom', message: 'duplicate source id', path: [i, 'id'] });
      seen.add(s.id);
    });
  });

export const PriceSchema = z.object({
  kind: z.enum(['free', 'published', 'quote', 'unknown']),
  amount: finite().min(0, 'must be zero or positive').optional(),
  currency: text(12).optional(),
  period: z.enum(['month', 'year', 'one-time', 'usage']).optional(),
  basis: text(60).optional(),
  note: text(TEXT_LIMITS.description).optional(),
});

export const ProductSchema = z
  .object({
    id: IdSchema,
    name: text(TEXT_LIMITS.name),
    description: text(TEXT_LIMITS.description),
    sam: finite().positive('SAM must be positive (or blank when unknown)').nullable(),
    som: finite().min(0, 'SOM must be zero or positive (or blank when unknown)').nullable(),
    somHorizon: text(80).optional(),
    allocations: z
      .array(
        z.object({
          segmentId: IdSchema,
          fraction: finite().min(0, 'must be between 0 and 1').max(1, 'must be between 0 and 1'),
        }),
      )
      .max(MODEL_SETTINGS.maxSegments),
    allocationMode: z.enum(['equal', 'custom']),
    price: PriceSchema,
    evidenceStatus: z.enum(EVIDENCE_STATUSES as unknown as [string, ...string[]]),
    sources: SourcesSchema,
    notes: text(TEXT_LIMITS.notes).optional(),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.allocations.forEach((a, i) => {
      if (seen.has(a.segmentId)) ctx.addIssue({ code: 'custom', message: 'segment allocated twice', path: ['allocations', i] });
      seen.add(a.segmentId);
    });
    if (p.sam !== null && p.som !== null && p.som > p.sam * (1 + 1e-9)) {
      ctx.addIssue({ code: 'custom', message: 'SOM cannot exceed SAM', path: ['som'] });
    }
  });

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    name: text(TEXT_LIMITS.name).min(1, 'project name is required'),
    marketDescription: text(TEXT_LIMITS.description),
    tam: finite().positive('TAM must be positive (or blank)').nullable(),
    marketUnit: text(60).min(1, 'market unit is required'),
    referenceDate: text(40),
    idvProductId: IdSchema.nullable(),
    segments: z
      .array(z.object({ id: IdSchema, name: text(80).min(1, 'segment name is required'), description: text(TEXT_LIMITS.shortText).optional() }))
      .max(MODEL_SETTINGS.maxSegments, `at most ${MODEL_SETTINGS.maxSegments} segments`),
    products: z.array(ProductSchema).max(MODEL_SETTINGS.maxProducts, `at most ${MODEL_SETTINGS.maxProducts} products`),
    sources: SourcesSchema,
    notes: text(TEXT_LIMITS.notes).optional(),
    revision: z.number().int().min(0),
    createdAt: text(40),
    updatedAt: text(40),
    modelVersion: text(60),
    layoutSettings: z.object({
      seed: z.number().int().min(0).max(4294967295),
      anchorProductId: IdSchema.optional(),
      showSegments: z.boolean(),
    }),
    isExample: z.boolean().optional(),
  })
  .superRefine((p, ctx) => {
    const segIds = new Set<string>();
    p.segments.forEach((s, i) => {
      if (segIds.has(s.id)) ctx.addIssue({ code: 'custom', message: 'duplicate segment id', path: ['segments', i, 'id'] });
      segIds.add(s.id);
    });
    const productIds = new Set<string>();
    p.products.forEach((prod, i) => {
      if (productIds.has(prod.id)) ctx.addIssue({ code: 'custom', message: 'duplicate product id', path: ['products', i, 'id'] });
      productIds.add(prod.id);
      prod.allocations.forEach((a, k) => {
        if (!segIds.has(a.segmentId)) {
          ctx.addIssue({ code: 'custom', message: `refers to unknown segment "${a.segmentId}"`, path: ['products', i, 'allocations', k, 'segmentId'] });
        }
      });
    });
    if (p.idvProductId !== null && !productIds.has(p.idvProductId)) {
      ctx.addIssue({ code: 'custom', message: 'IDV refers to a product that does not exist', path: ['idvProductId'] });
    }
    const anchor = p.layoutSettings.anchorProductId;
    if (anchor !== undefined && !productIds.has(anchor)) {
      ctx.addIssue({ code: 'custom', message: 'layout anchor refers to a product that does not exist', path: ['layoutSettings', 'anchorProductId'] });
    }
  });

export const LayoutCacheSchema = z.object({
  inputHash: z.string().regex(/^[0-9a-f]{16}$/),
  modelVersion: text(60),
  anchorProductId: IdSchema.nullable(),
  angles: z.record(IdSchema, finite()),
  loss: finite().min(0),
});

export function describeZodError(error: z.ZodError, max = 6): string[] {
  return error.issues.slice(0, max).map((i) => {
    const path = i.path
      .map((seg) => (typeof seg === 'number' ? `[${seg}]` : `.${String(seg)}`))
      .join('')
      .replace(/^\./, '');
    return path ? `${path}: ${i.message}` : i.message;
  });
}
