import { useId, useMemo, useState } from 'react';
import { effectiveAllocations } from '../domain/allocation';
import { LIMITS } from '../domain/constants';
import { createProduct } from '../domain/factory';
import { formatQuantity, parseQuantity, quantityToInput } from '../domain/format';
import { newId } from '../domain/ids';
import { EVIDENCE_STATUSES, type EvidenceStatus, type Product, type Project, type Segment, type Source } from '../domain/types';
import { productIssues, type Issue } from '../domain/validation';
import { ConfirmButton, Field } from './common';
import { draftToPrice, percentText, PriceEditor, priceToDraft, SegmentPicker, SourcesEditor, SplitEditor, type SplitState } from './editors';

export interface ProductSave {
  product: Product;
  newSegments: Segment[];
  makeIdv: boolean;
}

interface Props {
  project: Project;
  product: Product | null;
  /** Pre-tick "This is the IDV" for a new product (no IDV yet). */
  defaultIdv: boolean;
  onSave: (save: ProductSave) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const STATUS_HELP: Record<EvidenceStatus, string> = {
  estimated: 'Your own estimate (default).',
  planned: 'A plan or target, not yet observed.',
  sourced: 'Based on the references you attached. They are not verified by this app.',
  illustrative: 'Made-up numbers for demonstration.',
};

export function ProductForm({ project, product, defaultIdv, onSave, onCancel, onDelete }: Props) {
  const base = useId();
  const isNew = product === null;
  const initial = product ?? createProduct();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [isIdv, setIsIdv] = useState(isNew ? defaultIdv : project.idvProductId === initial.id);
  const [samText, setSamText] = useState(quantityToInput(initial.sam));
  const [somText, setSomText] = useState(quantityToInput(initial.som));
  const [somHorizon, setSomHorizon] = useState(initial.somHorizon ?? '');
  const [newSegments, setNewSegments] = useState<Segment[]>([]);
  const [selected, setSelected] = useState<string[]>(initial.allocations.map((a) => a.segmentId));
  const [split, setSplit] = useState<SplitState>(() => {
    const eff = effectiveAllocations(initial);
    return {
      mode: initial.allocationMode,
      fractions: Object.fromEntries(eff.map((a) => [a.segmentId, a.fraction])),
      text: Object.fromEntries(eff.map((a) => [a.segmentId, percentText(a.fraction)])),
    };
  });
  const [price, setPrice] = useState(priceToDraft(initial.price));
  const [status, setStatus] = useState<EvidenceStatus>(initial.evidenceStatus);
  const [sources, setSources] = useState<Source[]>(initial.sources);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [submitted, setSubmitted] = useState(false);

  const allSegments = useMemo(() => [...project.segments, ...newSegments], [project.segments, newSegments]);
  const sam = parseQuantity(samText);
  const som = parseQuantity(somText);
  const priceParsed = draftToPrice(price);

  const toggleSegment = (id: string) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    setSelected(next);
    if (split.mode === 'custom' && !selected.includes(id) && !(id in split.fractions)) {
      // A newly added segment in a custom split starts at 0%; existing shares are kept.
      setSplit({ ...split, fractions: { ...split.fractions, [id]: 0 }, text: { ...split.text, [id]: '0' } });
    }
  };

  const createSegment = (segName: string) => {
    const seg: Segment = { id: newId('seg'), name: segName };
    setNewSegments((s) => [...s, seg]);
    toggleSegment(seg.id);
  };

  /** Build the product from the current form, or report text that cannot be stored. */
  const build = (): { product: Product; parseErrors: Record<string, string> } => {
    const parseErrors: Record<string, string> = {};
    if (sam.error) parseErrors.sam = sam.error;
    if (som.error) parseErrors.som = som.error;
    if (priceParsed.error) parseErrors.price = priceParsed.error;
    const allocations =
      split.mode === 'equal'
        ? selected.map((segmentId) => ({ segmentId, fraction: 1 / selected.length }))
        : selected.map((segmentId) => ({ segmentId, fraction: split.fractions[segmentId] ?? 0 }));
    if (split.mode === 'custom' && allocations.some((a) => !Number.isFinite(a.fraction))) {
      parseErrors.allocations = 'Enter a number for every segment percentage.';
    }
    const p: Product = {
      ...initial,
      name: name.trim().slice(0, LIMITS.maxNameLength),
      description: description.trim(),
      sam: sam.value,
      som: som.value,
      somHorizon: somHorizon.trim() || undefined,
      allocations,
      allocationMode: split.mode,
      price: priceParsed.price,
      evidenceStatus: status,
      sources: sources.map((s) => ({ ...s, url: s.url.trim() })),
      notes: notes.trim() || undefined,
    };
    return { product: p, parseErrors };
  };

  const { product: candidate, parseErrors } = build();
  const issues: Issue[] = productIssues(candidate, { ...project, segments: allSegments });
  const fieldError = (field: string) => parseErrors[field] ?? issues.find((i) => i.field === field && i.severity === 'error')?.message ?? null;
  const fieldWarning = (field: string) => issues.find((i) => i.field === field && i.severity === 'warning')?.message ?? null;
  const nameMissing = !name.trim();
  const blockingParse = Object.keys(parseErrors).length > 0 || nameMissing;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (blockingParse) return;
    // Only persist new segments that are actually used.
    const used = newSegments.filter((s) => selected.includes(s.id));
    onSave({ product: candidate, newSegments: used, makeIdv: isIdv });
  };

  const missing: string[] = [];
  if (sam.value === null && !sam.error) missing.push('SAM');
  if (selected.length === 0) missing.push('a customer segment');

  return (
    <form onSubmit={submit} noValidate data-testid="product-form" aria-label={isNew ? 'Add product' : `Edit ${initial.name}`}>
      <div className="form-grid">
        <Field label="Name" htmlFor={`${base}-name`} error={submitted && nameMissing ? 'Give the product a name.' : fieldError('name')} className="full">
          <input id={`${base}-name`} value={name} maxLength={LIMITS.maxNameLength} required aria-invalid={submitted && nameMissing ? true : undefined} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Short description" htmlFor={`${base}-desc`} warning={submitted ? fieldWarning('description') : null} error={fieldError('description')} className="full">
          <textarea id={`${base}-desc`} value={description} maxLength={LIMITS.maxDescriptionLength} rows={2} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="full">
          <label className="toggle">
            <input type="checkbox" checked={isIdv} onChange={(e) => setIsIdv(e.target.checked)} />
            <span>
              <strong>This is the IDV</strong> — the main product being evaluated (one per project)
            </span>
          </label>
        </div>
        <Field
          label={`SAM (${project.marketUnit || 'units'})`}
          htmlFor={`${base}-sam`}
          hint={project.tam !== null ? `Positive, at most the TAM (${formatQuantity(project.tam)}). Accepts 350000, 350,000 or 350k.` : 'Positive number. Accepts 350000, 350,000 or 350k.'}
          error={fieldError('sam')}
        >
          <input id={`${base}-sam`} inputMode="decimal" value={samText} aria-invalid={fieldError('sam') ? true : undefined} onChange={(e) => setSamText(e.target.value)} />
        </Field>
        <Field label="SOM (optional)" htmlFor={`${base}-som`} hint="Scenario estimate, 0 to SAM. Leave blank if unknown." error={fieldError('som')}>
          <input id={`${base}-som`} inputMode="decimal" value={somText} aria-invalid={fieldError('som') ? true : undefined} onChange={(e) => setSomText(e.target.value)} />
        </Field>
        {somText.trim() ? (
          <Field label="SOM horizon (optional)" htmlFor={`${base}-somh`} className="full">
            <input id={`${base}-somh`} value={somHorizon} maxLength={LIMITS.maxShortTextLength} placeholder="e.g. by 2028" onChange={(e) => setSomHorizon(e.target.value)} />
          </Field>
        ) : null}
        <div className="full">
          <SegmentPicker segments={allSegments} selected={selected} onToggle={toggleSegment} onCreate={createSegment} />
          <SplitEditor
            segments={allSegments}
            selected={selected}
            sam={sam.value}
            split={split}
            onChange={setSplit}
            error={parseErrors.allocations ?? issues.find((i) => i.field === 'allocations' && i.severity === 'error')?.message ?? fieldWarning('allocations')}
          />
        </div>
        <div className="full">
          <PriceEditor draft={price} onChange={setPrice} error={fieldError('price')} />
        </div>
        <Field label="Evidence status" htmlFor={`${base}-status`} hint={STATUS_HELP[status]}>
          <select id={`${base}-status`} value={status} onChange={(e) => setStatus(e.target.value as EvidenceStatus)}>
            {EVIDENCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <div className="full">
          <details className="form-section" open={sources.length > 0}>
            <summary>References ({sources.length})</summary>
            <SourcesEditor sources={sources} onChange={setSources} />
          </details>
          <details className="form-section" open={Boolean(initial.notes)}>
            <summary>Notes</summary>
            <label htmlFor={`${base}-notes`} className="visually-hidden">
              Notes
            </label>
            <textarea id={`${base}-notes`} value={notes} maxLength={LIMITS.maxNotesLength} rows={3} onChange={(e) => setNotes(e.target.value)} />
          </details>
        </div>
      </div>

      <div className="form-errors" aria-live="polite">
        {missing.length > 0 ? (
          <p className="notice">
            Can be saved as a draft. It will join the analysis once it has {missing.join(' and ')}.
          </p>
        ) : null}
        {submitted && blockingParse ? (
          <p className="notice error" role="alert">
            {nameMissing ? 'Add a name. ' : ''}
            {Object.values(parseErrors).join(' ')} Your entries are kept; fix the highlighted fields to save.
          </p>
        ) : null}
        {issues.some((i) => i.severity === 'error') && !blockingParse ? (
          <p className="notice warn">This can be saved as a draft, but the analysis will not update until the highlighted values are fixed.</p>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button type="submit" className="btn primary">
          {isNew ? 'Add product' : 'Save changes'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {onDelete ? (
          <span style={{ marginLeft: 'auto' }}>
            <ConfirmButton label="Delete product" confirmLabel="Delete" prompt="Delete this product?" onConfirm={onDelete} className="btn danger" />
          </span>
        ) : null}
      </div>
    </form>
  );
}
