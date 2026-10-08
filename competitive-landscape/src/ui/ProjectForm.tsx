import { useId, useState } from 'react';
import { LIMITS, MARKET_UNIT_PRESETS } from '../domain/constants';
import { formatQuantity, parseQuantity, quantityToInput } from '../domain/format';
import type { Project, Segment, Source } from '../domain/types';
import { isHttpUrl } from '../domain/validation';
import { Field, Modal } from './common';
import { SourcesEditor } from './editors';

export interface ProjectFormValues {
  name: string;
  marketDescription: string;
  tam: number | null;
  marketUnit: string;
  referenceDate: string;
  sources: Source[];
  notes?: string;
  segments: Segment[];
}

interface Props {
  mode: 'create' | 'edit';
  project?: Project;
  onSubmit: (values: ProjectFormValues) => void;
  onCancel: () => void;
}

export function ProjectForm({ mode, project, onSubmit, onCancel }: Props) {
  const base = useId();
  const presetUnit = project && (MARKET_UNIT_PRESETS as readonly string[]).includes(project.marketUnit) ? project.marketUnit : project ? 'custom' : 'customers';
  const [name, setName] = useState(project?.name ?? '');
  const [market, setMarket] = useState(project?.marketDescription ?? '');
  const [tamText, setTamText] = useState(quantityToInput(project?.tam ?? null));
  const [unitMode, setUnitMode] = useState<string>(presetUnit);
  const [customUnit, setCustomUnit] = useState(presetUnit === 'custom' ? (project?.marketUnit ?? '') : '');
  const [referenceDate, setReferenceDate] = useState(project?.referenceDate ?? String(new Date().getFullYear()));
  const [sources, setSources] = useState<Source[]>(project?.sources ?? []);
  const [notes, setNotes] = useState(project?.notes ?? '');
  const [segments, setSegments] = useState<Segment[]>(project?.segments ?? []);
  const [submitted, setSubmitted] = useState(false);

  const tam = parseQuantity(tamText);
  const unit = unitMode === 'custom' ? customUnit.trim() : unitMode;
  const usage = (segmentId: string) => project?.products.filter((p) => p.allocations.some((a) => a.segmentId === segmentId)).length ?? 0;

  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Give the project a name.';
  if (tam.error) errors.tam = tam.error;
  else if (tam.value !== null && !(tam.value > 0)) errors.tam = 'TAM must be a positive number.';
  if (unitMode === 'custom' && !unit) errors.unit = 'Name the custom unit, e.g. clinics or households.';
  if (/(\$|€|£|¥|\b(usd|eur|gbp|dollars?|revenue)\b)/i.test(unit)) errors.unit = 'Use a count of customers or organisations, not currency.';
  if (referenceDate.trim() && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(referenceDate.trim())) errors.referenceDate = 'Use a year (2026), month (2026-03) or date (2026-03-31).';
  if (sources.some((s) => !isHttpUrl(s.url))) errors.sources = 'Every reference needs an http:// or https:// URL.';
  if (segments.some((s) => !s.name.trim())) errors.segments = 'Segment names cannot be empty.';
  const unitChanged = mode === 'edit' && project && unit !== project.marketUnit && project.products.some((p) => p.sam !== null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    // Only text that cannot be stored blocks saving; a missing TAM is an allowed draft.
    const blocking = ['name', 'unit', 'referenceDate', 'sources', 'segments'].some((k) => errors[k]) || Boolean(tam.error);
    if (blocking) return;
    onSubmit({
      name: name.trim(),
      marketDescription: market.trim(),
      tam: tam.value,
      marketUnit: unit,
      referenceDate: referenceDate.trim(),
      sources,
      notes: notes.trim() || undefined,
      segments: segments.map((s) => ({ ...s, name: s.name.trim() })),
    });
  };
  const show = (k: string) => (submitted || k === 'tam' || k === 'unit' ? errors[k] : null);

  return (
    <Modal
      title={mode === 'create' ? 'Create project' : 'Edit project'}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form={`${base}-form`} className="btn primary">
            {mode === 'create' ? 'Create project' : 'Save project'}
          </button>
        </>
      }
    >
      <form id={`${base}-form`} onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Project name" htmlFor={`${base}-name`} error={show('name')} className="full">
            <input id={`${base}-name`} value={name} maxLength={LIMITS.maxNameLength} aria-invalid={show('name') ? true : undefined} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Market description" htmlFor={`${base}-market`} hint="One or two sentences defining the shared market." className="full">
            <textarea id={`${base}-market`} rows={2} value={market} maxLength={LIMITS.maxDescriptionLength} onChange={(e) => setMarket(e.target.value)} />
          </Field>
          <Field label="TAM" htmlFor={`${base}-tam`} hint="Total addressable market: a positive count in the unit below." error={show('tam')}>
            <input id={`${base}-tam`} inputMode="decimal" value={tamText} aria-invalid={show('tam') ? true : undefined} onChange={(e) => setTamText(e.target.value)} />
          </Field>
          <Field label="Market-size unit" htmlFor={`${base}-unit`} error={show('unit')} warning={unitChanged ? 'Changing the unit does not convert existing numbers.' : null}>
            <select id={`${base}-unit`} value={unitMode} onChange={(e) => setUnitMode(e.target.value)}>
              <option value="customers">customers</option>
              <option value="organizations">organizations</option>
              <option value="custom">custom unit…</option>
            </select>
            {unitMode === 'custom' ? (
              <input aria-label="Custom unit" value={customUnit} placeholder="e.g. potential customers, clinics" maxLength={LIMITS.maxShortTextLength} onChange={(e) => setCustomUnit(e.target.value)} />
            ) : null}
          </Field>
          <Field label="Reference date or year" htmlFor={`${base}-date`} error={show('referenceDate')}>
            <input id={`${base}-date`} value={referenceDate} maxLength={10} onChange={(e) => setReferenceDate(e.target.value)} />
          </Field>
          {tam.value !== null && tam.value > 0 ? (
            <p className="hint full" style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', alignSelf: 'end' }}>
              TAM {formatQuantity(tam.value)} {unit}. Use one unit for every number in this project.
            </p>
          ) : null}
          {mode === 'edit' && segments.length > 0 ? (
            <fieldset className="full">
              <legend>Customer segments</legend>
              {segments.map((s, i) => {
                const used = usage(s.id);
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
                    <input aria-label={`Segment ${i + 1} name`} value={s.name} maxLength={LIMITS.maxShortTextLength} onChange={(e) => setSegments(segments.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{used} product{used === 1 ? '' : 's'}</span>
                    <button
                      type="button"
                      className="btn small"
                      disabled={used > 0}
                      title={used > 0 ? 'Remove it from every product first' : 'Delete segment'}
                      onClick={() => setSegments(segments.filter((_, k) => k !== i))}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
              {show('segments') ? <span className="error-text">{errors.segments}</span> : null}
              <span className="hint" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                Segments in use cannot be deleted. Add new segments from a product’s form.
              </span>
            </fieldset>
          ) : null}
          <div className="full">
            <details className="form-section" open={sources.length > 0}>
              <summary>Project references ({sources.length})</summary>
              <SourcesEditor sources={sources} onChange={setSources} scopes={['tam', 'segments']} />
              {show('sources') ? <span className="error-text">{errors.sources}</span> : null}
            </details>
            <details className="form-section" open={Boolean(project?.notes)}>
              <summary>Notes</summary>
              <label htmlFor={`${base}-notes`} className="visually-hidden">
                Project notes
              </label>
              <textarea id={`${base}-notes`} rows={3} value={notes} maxLength={LIMITS.maxNotesLength} onChange={(e) => setNotes(e.target.value)} />
            </details>
          </div>
        </div>
      </form>
    </Modal>
  );
}
