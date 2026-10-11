import { useState, type FormEvent } from 'react';
import { formatAmount, parseAmountInput } from '../domain/format';
import { MODEL_SETTINGS, TEXT_LIMITS } from '../domain/settings';
import { containsExecutableMarkup } from '../domain/text';
import type { Project, Segment, Source } from '../domain/types';
import { createSegment, segmentUsage } from '../app/mutations';
import { formatExactInput } from '../app/productForm';
import { fromSourceDrafts, sourceErrors, toSourceDrafts, type SourceDraft } from '../app/sources';
import { Dialog, FieldError, FieldHint } from './common';
import { SourcesEditor } from './SourcesEditor';

export interface ProjectFields {
  name: string;
  marketDescription: string;
  tam: number | null;
  marketUnit: string;
  referenceDate: string;
  notes?: string;
  sources: Source[];
  segments: Segment[];
}

const UNITS = ['customers', 'organizations'] as const;

export function ProjectDialog({ project, onSave, onClose }: { project: Project | null; onSave: (fields: ProjectFields) => void; onClose: () => void }) {
  const isNew = project === null;
  const unitKnown = project ? (UNITS as readonly string[]).includes(project.marketUnit) : true;
  const [name, setName] = useState(project?.name ?? '');
  const [desc, setDesc] = useState(project?.marketDescription ?? '');
  const [tam, setTam] = useState(project?.tam != null ? formatExactInput(project.tam) : '');
  const [unit, setUnit] = useState(unitKnown ? (project?.marketUnit ?? 'customers') : 'custom');
  const [customUnit, setCustomUnit] = useState(unitKnown ? '' : (project?.marketUnit ?? ''));
  const [refDate, setRefDate] = useState(project?.referenceDate ?? String(new Date().getFullYear()));
  const [notes, setNotes] = useState(project?.notes ?? '');
  const [sources, setSources] = useState<SourceDraft[]>(toSourceDrafts(project?.sources ?? []));
  const [segments, setSegments] = useState<Segment[]>(project?.segments ?? []);
  const [newSeg, setNewSeg] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const tamValue = parseAmountInput(tam);
  const errors: Record<string, string | undefined> = {};
  const markup = (s: string) => (containsExecutableMarkup(s) ? 'Remove script-like markup (for example <script> or javascript:).' : undefined);
  errors.name = !name.trim() ? 'Project name is required.' : markup(name);
  errors.desc = markup(desc);
  if (tamValue !== null) {
    if (!Number.isFinite(tamValue)) errors.tam = 'Enter TAM as a number, for example 1,000,000.';
    else if (tamValue <= 0) errors.tam = 'TAM must be greater than 0.';
  }
  const finalUnit = unit === 'custom' ? customUnit.trim() : unit;
  if (!finalUnit) errors.unit = 'Enter the market-size unit, for example “clinics”.';
  else errors.unit = markup(finalUnit);
  errors.refDate = markup(refDate);
  errors.notes = markup(notes);
  if (segments.some((s) => !s.name.trim())) errors.segments = 'Every segment needs a name.';
  else if (segments.some((s) => containsExecutableMarkup(s.name) || containsExecutableMarkup(s.description ?? ''))) errors.segments = markup('<script');
  if (sources.some((s) => sourceErrors(s))) errors.sources = 'Fix or remove the highlighted references.';
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (k: string) => (submitted || k === 'tam' ? errors[k] : undefined);

  const removed = project ? project.segments.filter((s) => !segments.some((x) => x.id === s.id)) : [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    onSave({
      name: name.trim(),
      marketDescription: desc.trim(),
      tam: tamValue === null ? null : tamValue,
      marketUnit: finalUnit,
      referenceDate: refDate.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      sources: fromSourceDrafts(sources),
      segments: segments.map((s) => ({ ...s, name: s.name.trim(), ...(s.description?.trim() ? { description: s.description.trim() } : { description: undefined }) })),
    });
  };

  return (
    <Dialog
      title={isNew ? 'Create project' : 'Edit project'}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="project-form" className="btn btn-primary">
            {isNew ? 'Create project' : 'Save project'}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} noValidate>
        {submitted && hasErrors && (
          <div className="alert alert-error" role="alert">
            Please fix the highlighted fields. Your entries are kept.
          </div>
        )}
        <label className="field">
          <span>
            Project name <em className="req">required</em>
          </span>
          <input name="projectName" value={name} maxLength={TEXT_LIMITS.name} onChange={(e) => setName(e.target.value)} aria-invalid={!!show('name')} autoFocus />
          <FieldError id="pj-name-err" message={show('name')} />
        </label>
        <label className="field">
          <span>Market description</span>
          <textarea name="marketDescription" rows={2} value={desc} maxLength={TEXT_LIMITS.description} placeholder="The shared market all products are compared in" onChange={(e) => setDesc(e.target.value)} aria-invalid={!!show('desc')} />
          <FieldError id="pj-desc-err" message={show('desc')} />
        </label>
        <div className="grid-3">
          <label className="field">
            <span>TAM</span>
            <input name="tam" inputMode="decimal" value={tam} placeholder="e.g. 1,000,000" onChange={(e) => setTam(e.target.value)} aria-invalid={!!errors.tam} />
            {errors.tam ? <FieldError id="pj-tam-err" message={errors.tam} /> : <FieldHint>Total addressable market, one number for the whole project.</FieldHint>}
          </label>
          <label className="field">
            <span>Market-size unit</span>
            <select name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="customers">customers</option>
              <option value="organizations">organizations</option>
              <option value="custom">custom unit…</option>
            </select>
            {unit === 'custom' && <input aria-label="Custom unit" value={customUnit} maxLength={60} placeholder="e.g. clinics" onChange={(e) => setCustomUnit(e.target.value)} aria-invalid={!!show('unit')} />}
            <FieldError id="pj-unit-err" message={show('unit')} />
            <FieldHint>Use one non-monetary unit for TAM and every SAM/SOM.</FieldHint>
          </label>
          <label className="field">
            <span>Reference date or year</span>
            <input name="referenceDate" value={refDate} maxLength={40} onChange={(e) => setRefDate(e.target.value)} aria-invalid={!!show('refDate')} />
            <FieldError id="pj-date-err" message={show('refDate')} />
          </label>
        </div>

        {!isNew && (
          <fieldset className="field">
            <legend>Customer segments ({segments.length}/{MODEL_SETTINGS.maxSegments})</legend>
            <FieldHint>Shared tags used by every product. Each segment is a distinct market slice; don’t count the same customers twice.</FieldHint>
            <ul className="segment-list">
              {segments.map((s, i) => {
                const used = project ? segmentUsage(project, s.id) : 0;
                return (
                  <li key={s.id}>
                    <input aria-label={`Segment ${i + 1} name`} value={s.name} maxLength={80} onChange={(e) => setSegments(segments.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
                    <input
                      aria-label={`Segment ${i + 1} description`}
                      placeholder="Description (optional)"
                      value={s.description ?? ''}
                      maxLength={TEXT_LIMITS.shortText}
                      onChange={(e) => setSegments(segments.map((x) => (x.id === s.id ? { ...x, description: e.target.value } : x)))}
                    />
                    <span className="field-hint">{used ? `used by ${used}` : 'unused'}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSegments(segments.filter((x) => x.id !== s.id))}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
            {removed.some((s) => project && segmentUsage(project, s.id) > 0) && (
              <div className="alert alert-warn">
                Removing a segment that products use takes it out of their footprints. Equal splits are recomputed; custom splits keep their other shares and must be adjusted to total 100%.
              </div>
            )}
            <div className="inline-add">
              <input aria-label="New segment name" placeholder="New segment" value={newSeg} maxLength={80} onChange={(e) => setNewSeg(e.target.value)} />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!newSeg.trim() || segments.length >= MODEL_SETTINGS.maxSegments}
                onClick={() => {
                  setSegments([...segments, createSegment(newSeg)]);
                  setNewSeg('');
                }}
              >
                Add segment
              </button>
            </div>
            <FieldError id="pj-seg-err" message={show('segments')} />
          </fieldset>
        )}

        <details className="refs-details" open={sources.length > 0 || !!notes}>
          <summary>Project references and notes ({sources.length})</summary>
          <SourcesEditor sources={sources} onChange={setSources} topics={['tam', 'segments', 'general']} showErrors={submitted} idPrefix="pj" />
          <label className="field">
            <span>Notes (optional)</span>
            <textarea rows={3} value={notes} maxLength={TEXT_LIMITS.notes} onChange={(e) => setNotes(e.target.value)} aria-invalid={!!show('notes')} />
            <FieldError id="pj-notes-err" message={show('notes')} />
          </label>
        </details>
        {project && tamValue !== null && Number.isFinite(tamValue) && project.tam !== null && tamValue !== project.tam && (
          <FieldHint>
            TAM changes from {formatAmount(project.tam)} to {formatAmount(tamValue)}. No product values are rescaled.
          </FieldHint>
        )}
      </form>
    </Dialog>
  );
}
