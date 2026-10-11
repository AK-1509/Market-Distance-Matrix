import { useMemo, useState, type FormEvent } from 'react';
import { createProduct } from '../domain/factory';
import { formatAmount, parseAmountInput } from '../domain/format';
import { MODEL_SETTINGS, TEXT_LIMITS } from '../domain/settings';
import type { EvidenceStatus, PriceKind, PricePeriod, Product, Project, Segment } from '../domain/types';
import { createSegment } from '../app/mutations';
import { BASIS_OPTIONS, checkProductForm, defaultPercents, formFromProduct, productFromForm, type FormField, type ProductFormState } from '../app/productForm';
import { ConfirmButton, Dialog, FieldError, FieldHint } from './common';
import { SourcesEditor } from './SourcesEditor';

interface Props {
  project: Project;
  /** Existing product to edit, or null to add a new one. */
  product: Product | null;
  onSave: (product: Product, opts: { makeIdv: boolean; newSegments: Segment[] }) => void;
  onDelete?: (productId: string) => void;
  onClose: () => void;
}

const EVIDENCE_HELP: Record<EvidenceStatus, string> = {
  estimated: 'Your estimate (default).',
  planned: 'A planned or target figure.',
  sourced: 'Based on the references below. A link alone does not verify the whole record.',
  illustrative: 'Example numbers, not real data.',
};

export function ProductDialog({ project, product, onSave, onDelete, onClose }: Props) {
  const isNew = product === null;
  const initial = useMemo(() => {
    const base = product ?? createProduct();
    const makeIdv = product ? product.id === project.idvProductId : project.idvProductId === null;
    return formFromProduct(base, makeIdv);
  }, [product, project.idvProductId]);
  const [f, setF] = useState<ProductFormState>(initial);
  const [created, setCreated] = useState<Segment[]>([]);
  const [newSeg, setNewSeg] = useState('');
  const [newSegError, setNewSegError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [splitOpen, setSplitOpen] = useState(initial.allocationMode === 'custom');
  const [refsOpen, setRefsOpen] = useState(initial.sources.length > 0 || !!initial.notes);

  const allSegments = [...project.segments, ...created];
  const check = checkProductForm(f, { tam: project.tam, unit: project.marketUnit });
  const show = (field: FormField) => (submitted || field === 'split' || field === 'som' || field === 'sam' ? check.errors[field] : undefined);
  const set = (patch: Partial<ProductFormState>) => setF((prev) => ({ ...prev, ...patch }));
  const samValue = parseAmountInput(f.sam);
  const samOk = samValue !== null && Number.isFinite(samValue) && samValue > 0;
  const unit = project.marketUnit;
  const wasIdv = !isNew && product?.id === project.idvProductId;

  const toggleSegment = (id: string, on: boolean) => {
    setF((prev) => {
      const segmentIds = on ? [...prev.segmentIds, id] : prev.segmentIds.filter((s) => s !== id);
      // Custom splits are preserved: a new segment starts at 0%, removal leaves the rest as entered.
      const percents = prev.allocationMode === 'custom' ? { ...prev.percents, ...(on ? { [id]: prev.percents[id] ?? '0' } : {}) } : defaultPercents(segmentIds);
      return { ...prev, segmentIds, percents };
    });
  };

  const addSegment = () => {
    const name = newSeg.trim();
    if (!name) return;
    if (allSegments.length >= MODEL_SETTINGS.maxSegments) {
      setNewSegError(`A project can have at most ${MODEL_SETTINGS.maxSegments} segments.`);
      return;
    }
    const existing = allSegments.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!f.segmentIds.includes(existing.id)) toggleSegment(existing.id, true);
    } else {
      const seg = createSegment(name.slice(0, 80));
      setCreated((c) => [...c, seg]);
      toggleSegment(seg.id, true);
    }
    setNewSeg('');
    setNewSegError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(check.errors).length > 0) {
      const first = document.querySelector<HTMLElement>('.dialog [aria-invalid="true"]');
      first?.focus();
      return;
    }
    const p = productFromForm(f);
    const newSegments = created.filter((s) => p.allocations.some((a) => a.segmentId === s.id));
    onSave(p, { makeIdv: f.isIdv, newSegments });
  };

  const equalShare = f.segmentIds.length ? 100 / f.segmentIds.length : 0;

  return (
    <Dialog
      title={isNew ? (initial.isIdv ? 'Add your main product (IDV)' : 'Add competitor') : `Edit ${product?.name || 'product'}`}
      onClose={onClose}
      wide
      footer={
        <>
          {!isNew && onDelete && <ConfirmButton label="Delete product" confirmLabel="Click again to delete" onConfirm={() => onDelete(product!.id)} />}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="product-form" className="btn btn-primary">
            Save product
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate>
        {submitted && Object.keys(check.errors).length > 0 && (
          <div className="alert alert-error" role="alert">
            Please fix the highlighted fields. Your entries are kept.
          </div>
        )}
        <div className="grid-2">
          <label className="field">
            <span>
              Name <em className="req">required</em>
            </span>
            <input
              name="name"
              value={f.name}
              maxLength={TEXT_LIMITS.name}
              onChange={(e) => set({ name: e.target.value })}
              aria-invalid={!!show('name')}
              aria-describedby="pf-name-err"
              autoFocus
            />
            <FieldError id="pf-name-err" message={show('name')} />
          </label>
          <div className="field">
            <span>Role</span>
            <label className="check-inline check-block">
              <input type="checkbox" name="isIdv" checked={f.isIdv} onChange={(e) => set({ isIdv: e.target.checked })} />
              This is the IDV — the main product being evaluated
            </label>
            {wasIdv && !f.isIdv && <FieldHint>The project needs exactly one IDV; mark another product as the IDV afterwards.</FieldHint>}
            {!wasIdv && f.isIdv && project.idvProductId && project.idvProductId !== f.id && (
              <FieldHint>The current IDV becomes a competitor when you save.</FieldHint>
            )}
          </div>
        </div>

        <label className="field">
          <span>
            Short description <em className="req">required</em>
          </span>
          <textarea
            name="description"
            rows={2}
            value={f.description}
            maxLength={TEXT_LIMITS.description}
            onChange={(e) => set({ description: e.target.value })}
            aria-invalid={!!show('description')}
            aria-describedby="pf-desc-err"
          />
          <FieldError id="pf-desc-err" message={show('description')} />
        </label>

        <div className="grid-3">
          <label className="field">
            <span>SAM ({unit})</span>
            <input
              name="sam"
              inputMode="decimal"
              value={f.sam}
              placeholder="e.g. 350,000"
              onChange={(e) => set({ sam: e.target.value })}
              aria-invalid={!!check.errors.sam}
              aria-describedby="pf-sam-msg"
            />
            {check.errors.sam ? (
              <FieldError id="pf-sam-msg" message={check.errors.sam} />
            ) : (
              <FieldHint id="pf-sam-msg">
                {check.warnings.sam ?? `Serviceable addressable market, at most the TAM${project.tam !== null ? ` (${formatAmount(project.tam)})` : ''}.`}
              </FieldHint>
            )}
          </label>
          <label className="field">
            <span>SOM (optional)</span>
            <input name="som" inputMode="decimal" value={f.som} placeholder="Blank = unknown" onChange={(e) => set({ som: e.target.value })} aria-invalid={!!check.errors.som} aria-describedby="pf-som-msg" />
            {check.errors.som ? <FieldError id="pf-som-msg" message={check.errors.som} /> : <FieldHint id="pf-som-msg">Scenario estimate from 0 to SAM. Not current users.</FieldHint>}
          </label>
          <label className="field">
            <span>SOM horizon (optional)</span>
            <input name="somHorizon" value={f.somHorizon} maxLength={80} placeholder="e.g. 3 years" onChange={(e) => set({ somHorizon: e.target.value })} />
          </label>
        </div>

        <fieldset className="field segments-field" aria-describedby="pf-seg-help">
          <legend>Customer segments</legend>
          <FieldHint id="pf-seg-help">
            Select every segment this product addresses. Treat each segment as a distinct slice of the market — don’t count the same customers in two segments.
          </FieldHint>
          <div className="chips" role="group" aria-label="Segments">
            {allSegments.length === 0 && <span className="field-hint">No segments yet — create the first one below.</span>}
            {allSegments.map((s) => {
              const on = f.segmentIds.includes(s.id);
              return (
                <button key={s.id} type="button" className={`chip ${on ? 'chip-on' : ''}`} aria-pressed={on} onClick={() => toggleSegment(s.id, !on)}>
                  {on ? '✓ ' : ''}
                  {s.name}
                </button>
              );
            })}
          </div>
          <div className="inline-add">
            <input
              aria-label="New segment name"
              placeholder="New segment, e.g. Designers"
              value={newSeg}
              maxLength={80}
              onChange={(e) => setNewSeg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSegment();
                }
              }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addSegment} disabled={!newSeg.trim()}>
              Add segment
            </button>
          </div>
          {newSegError && <p className="field-error">{newSegError}</p>}
          {check.warnings.segments && <FieldHint>{check.warnings.segments}</FieldHint>}

          {f.segmentIds.length > 0 && f.allocationMode === 'equal' && (
            <p className="split-summary">
              Equal split assumption: {Number(equalShare.toFixed(2))}% of SAM in each of {f.segmentIds.length} segment{f.segmentIds.length === 1 ? '' : 's'}
              {samOk ? ` (${formatAmount((samValue as number) / f.segmentIds.length)} ${unit} each)` : ''}.
            </p>
          )}
          <details className="split-details" open={splitOpen} onToggle={(e) => setSplitOpen((e.target as HTMLDetailsElement).open)}>
            <summary>Adjust segment split</summary>
            {f.segmentIds.length === 0 ? (
              <p className="field-hint">Select segments first.</p>
            ) : f.allocationMode === 'equal' ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ allocationMode: 'custom', percents: defaultPercents(f.segmentIds), originalFractions: {} })}>
                Use a custom split
              </button>
            ) : (
              <div className="split-editor">
                {f.segmentIds.map((id) => {
                  const seg = allSegments.find((s) => s.id === id);
                  const pct = Number((f.percents[id] ?? '').trim() || 0);
                  return (
                    <label key={id} className="split-row">
                      <span className="split-name">{seg?.name ?? 'Segment'}</span>
                      <span className="pct-input">
                        <input
                          inputMode="decimal"
                          aria-label={`Share of SAM for ${seg?.name ?? 'segment'} (percent)`}
                          value={f.percents[id] ?? ''}
                          onChange={(e) => set({ percents: { ...f.percents, [id]: e.target.value } })}
                          aria-invalid={!!check.errors.split}
                        />
                        %
                      </span>
                      <span className="split-amount">{samOk && Number.isFinite(pct) ? `= ${formatAmount(((samValue as number) * pct) / 100)} ${unit}` : ''}</span>
                    </label>
                  );
                })}
                <p className={`split-total ${check.errors.split ? 'is-bad' : 'is-ok'}`} aria-live="polite">
                  Total: {check.splitTotal === null ? '—' : `${Number(check.splitTotal.toFixed(4))}%`} {check.errors.split ? '' : '✓'}
                </p>
                <FieldError id="pf-split-err" message={check.errors.split} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ allocationMode: 'equal', percents: defaultPercents(f.segmentIds), originalFractions: {} })}>
                  Reset to equal split
                </button>
              </div>
            )}
          </details>
        </fieldset>

        <fieldset className="field">
          <legend>Comparable price (optional)</legend>
          <div className="radio-row" role="radiogroup" aria-label="Price status">
            {(
              [
                ['unknown', 'Unknown'],
                ['free', 'Free'],
                ['published', 'Published price'],
                ['quote', 'Contact for quote'],
              ] as [PriceKind, string][]
            ).map(([k, label]) => (
              <label key={k} className="check-inline">
                <input type="radio" name="priceKind" value={k} checked={f.priceKind === k} onChange={() => set({ priceKind: k })} />
                {label}
              </label>
            ))}
          </div>
          {f.priceKind === 'published' && (
            <div className="grid-4">
              <label className="field">
                <span>Amount</span>
                <input name="priceAmount" inputMode="decimal" value={f.priceAmount} onChange={(e) => set({ priceAmount: e.target.value })} aria-invalid={!!show('priceAmount')} />
                <FieldError id="pf-price-err" message={show('priceAmount')} />
              </label>
              <label className="field">
                <span>Currency</span>
                <input name="currency" value={f.currency} maxLength={12} onChange={(e) => set({ currency: e.target.value })} aria-invalid={!!show('currency')} />
                <FieldError id="pf-cur-err" message={show('currency')} />
              </label>
              <label className="field">
                <span>Period</span>
                <select value={f.period} onChange={(e) => set({ period: e.target.value as PricePeriod })}>
                  <option value="month">per month</option>
                  <option value="year">per year</option>
                  <option value="one-time">one-time</option>
                  <option value="usage">usage-based</option>
                </select>
              </label>
              <label className="field">
                <span>Basis</span>
                <select value={f.basis} onChange={(e) => set({ basis: e.target.value })}>
                  {BASIS_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  <option value="other">other…</option>
                </select>
                {f.basis === 'other' && <input aria-label="Custom billing basis" value={f.basisCustom} maxLength={60} placeholder="e.g. per 1k requests" onChange={(e) => set({ basisCustom: e.target.value })} aria-invalid={!!show('basis')} />}
                <FieldError id="pf-basis-err" message={show('basis')} />
              </label>
            </div>
          )}
          <label className="field">
            <span>Price note (optional)</span>
            <input value={f.priceNote} maxLength={TEXT_LIMITS.description} onChange={(e) => set({ priceNote: e.target.value })} />
          </label>
          <FieldHint>Price is context only. Prices are compared only when currency and basis match; it never affects distances.</FieldHint>
        </fieldset>

        <label className="field">
          <span>Evidence status</span>
          <select name="evidenceStatus" value={f.evidenceStatus} onChange={(e) => set({ evidenceStatus: e.target.value as EvidenceStatus })}>
            <option value="estimated">Estimated</option>
            <option value="planned">Planned</option>
            <option value="sourced">Sourced</option>
            <option value="illustrative">Illustrative</option>
          </select>
          <FieldHint>{EVIDENCE_HELP[f.evidenceStatus]}</FieldHint>
        </label>

        <details className="refs-details" open={refsOpen} onToggle={(e) => setRefsOpen((e.target as HTMLDetailsElement).open)}>
          <summary>References and notes ({f.sources.length})</summary>
          <SourcesEditor sources={f.sources} onChange={(sources) => set({ sources })} topics={['description', 'sam', 'som', 'segments', 'price', 'general']} showErrors={submitted} idPrefix="pf" />
          <label className="field">
            <span>Notes (optional)</span>
            <textarea rows={3} value={f.notes} maxLength={TEXT_LIMITS.notes} onChange={(e) => set({ notes: e.target.value })} aria-invalid={!!show('notes')} />
            <FieldError id="pf-notes-err" message={show('notes')} />
          </label>
        </details>
        {submitted && check.errors.sources && <FieldError id="pf-src-err" message={check.errors.sources} />}
      </form>
    </Dialog>
  );
}
