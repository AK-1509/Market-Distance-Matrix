import { newId } from '../domain/ids';
import { TEXT_LIMITS } from '../domain/settings';
import type { SourceTopic } from '../domain/types';
import { sourceErrors, type SourceDraft } from '../app/sources';

const TOPIC_LABEL: Record<SourceTopic, string> = {
  tam: 'TAM',
  description: 'Description',
  sam: 'SAM',
  som: 'SOM',
  segments: 'Segments',
  price: 'Price',
  general: 'General',
};

export function SourcesEditor({
  sources,
  onChange,
  topics,
  showErrors,
  idPrefix,
}: {
  sources: SourceDraft[];
  onChange: (s: SourceDraft[]) => void;
  topics: SourceTopic[];
  showErrors: boolean;
  idPrefix: string;
}) {
  const set = (i: number, patch: Partial<SourceDraft>) => onChange(sources.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="sources">
      {sources.length === 0 && <p className="field-hint">No references yet. Links are stored as you enter them; this app never fetches or verifies them.</p>}
      {sources.map((s, i) => {
        const err = showErrors ? sourceErrors(s) : null;
        const base = `${idPrefix}-src-${i}`;
        return (
          <fieldset key={s.id} className="source-row">
            <legend className="sr-only">Reference {i + 1}</legend>
            <div className="grid-2">
              <label className="field">
                <span>URL</span>
                <input id={`${base}-url`} type="url" inputMode="url" value={s.url} placeholder="https://…" onChange={(e) => set(i, { url: e.target.value })} aria-invalid={!!err} aria-describedby={err ? `${base}-err` : undefined} />
              </label>
              <label className="field">
                <span>Title (optional)</span>
                <input value={s.title} maxLength={TEXT_LIMITS.shortText} onChange={(e) => set(i, { title: e.target.value })} />
              </label>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Note (optional)</span>
                <input value={s.note} maxLength={TEXT_LIMITS.description} onChange={(e) => set(i, { note: e.target.value })} />
              </label>
              <label className="field">
                <span>Accessed (optional)</span>
                <input value={s.accessedAt} maxLength={40} placeholder="e.g. 2026-10-01" onChange={(e) => set(i, { accessedAt: e.target.value })} />
              </label>
            </div>
            <div className="topics" role="group" aria-label="Applies to">
              <span className="field-hint">Applies to:</span>
              {topics.map((t) => (
                <label key={t} className="check-inline">
                  <input
                    type="checkbox"
                    checked={s.appliesTo.includes(t)}
                    onChange={(e) => set(i, { appliesTo: e.target.checked ? [...s.appliesTo, t] : s.appliesTo.filter((x) => x !== t) })}
                  />
                  {TOPIC_LABEL[t]}
                </label>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(sources.filter((_, k) => k !== i))}>
                Remove
              </button>
            </div>
            {err && (
              <p className="field-error" id={`${base}-err`} role="alert">
                {err}
              </p>
            )}
          </fieldset>
        );
      })}
      {sources.length < TEXT_LIMITS.maxSources && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...sources, { id: newId('src'), title: '', url: '', note: '', accessedAt: '', appliesTo: [] }])}>
          + Add reference
        </button>
      )}
    </div>
  );
}
