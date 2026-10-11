/** Editable source-reference drafts (pure helpers shared by forms). */
import { TEXT_LIMITS } from '../domain/settings';
import { containsExecutableMarkup, isHttpUrl } from '../domain/text';
import type { Source, SourceTopic } from '../domain/types';

export interface SourceDraft {
  id: string;
  title: string;
  url: string;
  note: string;
  accessedAt: string;
  appliesTo: SourceTopic[];
}

export function toSourceDrafts(sources: readonly Source[]): SourceDraft[] {
  return sources.map((s) => ({ id: s.id, title: s.title ?? '', url: s.url, note: s.note ?? '', accessedAt: s.accessedAt ?? '', appliesTo: s.appliesTo ?? [] }));
}

export function fromSourceDrafts(drafts: readonly SourceDraft[]): Source[] {
  return drafts.map((d) => ({
    id: d.id,
    url: d.url.trim(),
    ...(d.title.trim() ? { title: d.title.trim() } : {}),
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    ...(d.accessedAt.trim() ? { accessedAt: d.accessedAt.trim() } : {}),
    ...(d.appliesTo.length ? { appliesTo: d.appliesTo } : {}),
  }));
}

export function sourceErrors(d: SourceDraft): string | null {
  if (!d.url.trim()) return 'Enter a URL or remove this reference.';
  if (!isHttpUrl(d.url.trim())) return 'Only http:// or https:// links are allowed.';
  if (d.url.length > TEXT_LIMITS.url) return 'URL is too long.';
  if ([d.title, d.note, d.accessedAt, d.url].some(containsExecutableMarkup)) return 'Remove script-like markup (for example <script> or javascript:).';
  if (d.title.length > TEXT_LIMITS.shortText || d.note.length > TEXT_LIMITS.description || d.accessedAt.length > 40) return 'Shorten the title, note, or accessed date.';
  return null;
}
