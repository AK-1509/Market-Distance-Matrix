// Reusable form pieces: references, segment tags, segment split and price.

import { useId, useState } from 'react';
import { LIMITS } from '../domain/constants';
import { newId } from '../domain/ids';
import { formatQuantity, formatSplitPercent } from '../domain/format';
import type { Price, PriceKind, PricePeriod, Segment, Source } from '../domain/types';
import { isHttpUrl } from '../domain/validation';
import { Field } from './common';

// ---------------------------------------------------------------- References

const APPLIES = ['sam', 'som', 'segments', 'price', 'description'] as const;

export function SourcesEditor({ sources, onChange, scopes = APPLIES }: { sources: Source[]; onChange: (s: Source[]) => void; scopes?: readonly string[] }) {
  const base = useId();
  const set = (i: number, patch: Partial<Source>) => onChange(sources.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div>
      <p className="hint" style={{ margin: '0 0 6px', fontSize: 12.5, color: 'var(--ink-2)' }}>
        Links are stored as references only. They are never fetched, and adding one does not mark the inputs as verified.
      </p>
      {sources.map((s, i) => {
        const urlError = s.url.trim() === '' ? 'Enter a URL.' : !isHttpUrl(s.url) ? 'Use an http:// or https:// link.' : null;
        return (
          <div className="source-row" key={s.id}>
            <Field label={`Reference ${i + 1} URL`} htmlFor={`${base}-url-${i}`} error={urlError} className="full">
              <input
                id={`${base}-url-${i}`}
                type="url"
                inputMode="url"
                value={s.url}
                maxLength={LIMITS.maxUrlLength}
                placeholder="https://"
                aria-invalid={urlError ? true : undefined}
                onChange={(e) => set(i, { url: e.target.value })}
              />
            </Field>
            <Field label="Title" htmlFor={`${base}-title-${i}`}>
              <input id={`${base}-title-${i}`} value={s.title ?? ''} maxLength={LIMITS.maxShortTextLength} onChange={(e) => set(i, { title: e.target.value || undefined })} />
            </Field>
            <Field label="Accessed" htmlFor={`${base}-acc-${i}`}>
              <input id={`${base}-acc-${i}`} type="date" value={s.accessedAt ?? ''} onChange={(e) => set(i, { accessedAt: e.target.value || undefined })} />
            </Field>
            <Field label="Note" htmlFor={`${base}-note-${i}`} className="full">
              <input id={`${base}-note-${i}`} value={s.note ?? ''} maxLength={LIMITS.maxShortTextLength} onChange={(e) => set(i, { note: e.target.value || undefined })} />
            </Field>
            <div className="full">
              <span className="label" style={{ fontWeight: 600, fontSize: 13 }}>
                Supports
              </span>
              <div className="checks">
                {scopes.map((a) => (
                  <label key={a}>
                    <input
                      type="checkbox"
                      checked={s.appliesTo?.includes(a) ?? false}
                      onChange={(e) => {
                        const next = new Set(s.appliesTo ?? []);
                        if (e.target.checked) next.add(a);
                        else next.delete(a);
                        set(i, { appliesTo: next.size ? [...next] : undefined });
                      }}
                    />{' '}
                    {a === 'sam' ? 'SAM' : a === 'som' ? 'SOM' : a === 'tam' ? 'TAM' : a}
                  </label>
                ))}
              </div>
            </div>
            <div className="full">
              <button type="button" className="btn small danger" onClick={() => onChange(sources.filter((_, k) => k !== i))}>
                Remove reference
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn small"
        disabled={sources.length >= LIMITS.maxSourcesPerItem}
        onClick={() => onChange([...sources, { id: newId('src'), url: '' }])}
      >
        Add reference
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Segments

export function SegmentPicker({
  segments,
  selected,
  onToggle,
  onCreate,
  error,
}: {
  segments: Segment[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => void;
  error?: string | null;
}) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const trimmed = draft.trim();
  const duplicate = segments.find((s) => s.name.trim().toLowerCase() === trimmed.toLowerCase());
  const full = segments.length >= LIMITS.maxSegments;
  const add = () => {
    if (!trimmed) return;
    if (duplicate) {
      if (!selected.includes(duplicate.id)) onToggle(duplicate.id);
    } else if (!full) {
      onCreate(trimmed.slice(0, LIMITS.maxShortTextLength));
    }
    setDraft('');
  };
  return (
    <fieldset>
      <legend>Customer segments</legend>
      <span className="hint" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
        Shared tags across the project. Each tag is treated as a distinct market slice, so avoid two tags for the same customers.
      </span>
      {segments.length ? (
        <div className="chips" role="group" aria-label="Select segments">
          {segments.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={selected.includes(s.id)} onClick={() => onToggle(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      ) : (
        <p style={{ margin: '6px 0', fontSize: 13.5, color: 'var(--ink-2)' }}>No segments yet — create the first one below.</p>
      )}
      <div className="inline-add">
        <label htmlFor={inputId} className="visually-hidden">
          New segment name
        </label>
        <input
          id={inputId}
          value={draft}
          placeholder={full ? `Limit of ${LIMITS.maxSegments} segments reached` : 'New segment, e.g. Small agencies'}
          disabled={full}
          maxLength={LIMITS.maxShortTextLength}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn small" onClick={add} disabled={!trimmed || full}>
          {duplicate ? 'Select' : 'Add segment'}
        </button>
      </div>
      {error ? (
        <span className="error-text" role="alert" style={{ fontSize: 12.5, color: 'var(--error)' }}>
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------- Split

export interface SplitState {
  mode: 'equal' | 'custom';
  /** Exact fractions; only fields the user edits are re-derived from text. */
  fractions: Record<string, number>;
  /** Raw percentage text per segment, kept so input is never lost. */
  text: Record<string, string>;
}

export function percentText(fraction: number): string {
  return String(Number((fraction * 100).toFixed(4)));
}

export function SplitEditor({
  segments,
  selected,
  sam,
  split,
  onChange,
  error,
}: {
  segments: Segment[];
  selected: string[];
  sam: number | null;
  split: SplitState;
  onChange: (s: SplitState) => void;
  error?: string | null;
}) {
  const base = useId();
  const k = selected.length;
  const total = selected.reduce((s, id) => s + (split.fractions[id] ?? 0), 0);
  const nameOf = (id: string) => segments.find((s) => s.id === id)?.name ?? 'Segment';
  const toCustom = () => {
    const fractions: Record<string, number> = {};
    const text: Record<string, string> = {};
    for (const id of selected) {
      fractions[id] = 1 / k;
      text[id] = percentText(1 / k);
    }
    onChange({ mode: 'custom', fractions, text });
  };
  return (
    <details className="form-section" open={split.mode === 'custom'}>
      <summary>Adjust segment split</summary>
      {k === 0 ? (
        <p className="hint" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          Select at least one segment first.
        </p>
      ) : (
        <div>
          <div className="checks" role="radiogroup" aria-label="Split mode" style={{ margin: '6px 0' }}>
            <label>
              <input type="radio" name={`${base}-mode`} checked={split.mode === 'equal'} onChange={() => onChange({ ...split, mode: 'equal' })} /> Equal split
              (default)
            </label>
            <label>
              <input type="radio" name={`${base}-mode`} checked={split.mode === 'custom'} onChange={() => (split.mode === 'custom' ? null : toCustom())} /> Custom
              percentages
            </label>
          </div>
          {split.mode === 'equal' ? (
            <p style={{ fontSize: 13.5, margin: '4px 0' }} data-testid="equal-split-note">
              Equal split assumed: {formatSplitPercent(1 / k)} of SAM in each of the {k} selected segment{k === 1 ? '' : 's'}.
            </p>
          ) : (
            <div>
              {selected.map((id) => {
                const f = split.fractions[id] ?? 0;
                return (
                  <div className="split-row" key={id}>
                    <label htmlFor={`${base}-${id}`}>{nameOf(id)}</label>
                    <input
                      id={`${base}-${id}`}
                      inputMode="decimal"
                      value={split.text[id] ?? percentText(f)}
                      aria-label={`${nameOf(id)} percent`}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const parsed = Number(raw.replace(/[%\s]/g, ''));
                        const fractions = { ...split.fractions };
                        if (raw.trim() !== '' && Number.isFinite(parsed)) fractions[id] = parsed / 100;
                        else fractions[id] = Number.NaN;
                        onChange({ ...split, fractions, text: { ...split.text, [id]: raw } });
                      }}
                    />
                    <span className="amount">{sam !== null && Number.isFinite(f) ? formatQuantity(sam * f) : '—'}</span>
                  </div>
                );
              })}
              <div className="split-total">
                <span>Total</span>
                <span data-testid="split-total">{Number.isFinite(total) ? `${Number((total * 100).toFixed(2))}%` : '—'}</span>
              </div>
              <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={() => onChange({ ...split, mode: 'equal' })}>
                Reset to equal split
              </button>
            </div>
          )}
        </div>
      )}
      {error ? (
        <span className="error-text" role="alert" style={{ fontSize: 12.5, color: 'var(--error)', display: 'block', marginTop: 6 }}>
          {error}
        </span>
      ) : null}
    </details>
  );
}

// ---------------------------------------------------------------- Price

export interface PriceDraft {
  kind: PriceKind;
  amount: string;
  currency: string;
  period: PricePeriod | '';
  basis: string;
  note: string;
}

export function priceToDraft(p: Price): PriceDraft {
  return {
    kind: p.kind,
    amount: p.amount === undefined ? '' : String(p.amount),
    currency: p.currency ?? 'USD',
    period: p.period ?? 'month',
    basis: p.basis ?? 'per user',
    note: p.note ?? '',
  };
}

export function draftToPrice(d: PriceDraft): { price: Price; error: string | null } {
  if (d.kind !== 'published') return { price: { kind: d.kind, note: d.note.trim() || undefined }, error: null };
  const raw = d.amount.trim().replace(/[,\s]/g, '');
  let amount: number | undefined;
  let error: string | null = null;
  if (raw !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n)) error = 'Enter the price as a number, e.g. 20 or 19.99.';
    else amount = n;
  }
  return {
    price: {
      kind: 'published',
      amount,
      currency: d.currency.trim().toUpperCase() || undefined,
      period: d.period || undefined,
      basis: d.basis.trim() || undefined,
      note: d.note.trim() || undefined,
    },
    error,
  };
}

export function PriceEditor({ draft, onChange, error }: { draft: PriceDraft; onChange: (d: PriceDraft) => void; error?: string | null }) {
  const base = useId();
  const set = (patch: Partial<PriceDraft>) => onChange({ ...draft, ...patch });
  return (
    <fieldset>
      <legend>Comparable price (optional)</legend>
      <div className="form-grid">
        <Field label="Price status" htmlFor={`${base}-kind`} className="full">
          <select id={`${base}-kind`} value={draft.kind} onChange={(e) => set({ kind: e.target.value as PriceKind })}>
            <option value="unknown">Unknown</option>
            <option value="free">Free</option>
            <option value="published">Published price</option>
            <option value="quote">Contact for quote</option>
          </select>
        </Field>
        {draft.kind === 'published' ? (
          <>
            <Field label="Amount" htmlFor={`${base}-amount`} error={error}>
              <input id={`${base}-amount`} inputMode="decimal" value={draft.amount} aria-invalid={error ? true : undefined} onChange={(e) => set({ amount: e.target.value })} />
            </Field>
            <Field label="Currency" htmlFor={`${base}-cur`} hint="ISO code, e.g. USD, EUR">
              <input id={`${base}-cur`} value={draft.currency} maxLength={12} onChange={(e) => set({ currency: e.target.value })} />
            </Field>
            <Field label="Period" htmlFor={`${base}-period`}>
              <select id={`${base}-period`} value={draft.period} onChange={(e) => set({ period: e.target.value as PricePeriod })}>
                <option value="month">per month</option>
                <option value="year">per year</option>
                <option value="one-time">one-time</option>
                <option value="usage">usage-based</option>
              </select>
            </Field>
            <Field label="Basis" htmlFor={`${base}-basis`} hint="Only identical bases are compared">
              <input id={`${base}-basis`} list={`${base}-bases`} value={draft.basis} maxLength={LIMITS.maxShortTextLength} onChange={(e) => set({ basis: e.target.value })} />
              <datalist id={`${base}-bases`}>
                <option value="per user" />
                <option value="per team" />
                <option value="per unit" />
              </datalist>
            </Field>
          </>
        ) : null}
        {draft.kind !== 'unknown' ? (
          <Field label="Price note" htmlFor={`${base}-note`} className="full">
            <input id={`${base}-note`} value={draft.note} maxLength={LIMITS.maxShortTextLength} onChange={(e) => set({ note: e.target.value })} />
          </Field>
        ) : null}
      </div>
    </fieldset>
  );
}
