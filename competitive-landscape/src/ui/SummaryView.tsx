import { useState } from 'react';
import { methodology } from '../domain/methodology';
import type { Narrative } from '../domain/narrative';
import { InlineRuns, SafeLink } from './common';

export function SummaryView({ narrative }: { narrative: Narrative }) {
  const [methodOpen, setMethodOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Citations are buttons, not hash links, because the app uses hash routing.
  const onCite = (href: string) => {
    const target = href.replace(/^#/, '');
    if (target === 'methodology') setMethodOpen(true);
    else setRefsOpen(true);
    if (target.startsWith('ref-')) setFlash(target);
    requestAnimationFrame(() => {
      const el = document.getElementById(target === 'references' ? 'summary-references' : target === 'methodology' ? 'summary-methodology' : `summary-${target}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <div className="summary" data-testid="summary">
      {narrative.sections.map((s) => (
        <section key={s.id} aria-labelledby={`sum-${s.id}`}>
          <h3 id={`sum-${s.id}`}>{s.title}</h3>
          {s.paragraphs.map((p, i) => (
            <p key={i}>
              <InlineRuns runs={p} onCite={onCite} />
            </p>
          ))}
          {s.list ? (
            <ul>
              {s.list.map((li, i) => (
                <li key={i}>
                  <InlineRuns runs={li} onCite={onCite} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <details className="section" id="summary-references" open={refsOpen} onToggle={(e) => setRefsOpen((e.target as HTMLDetailsElement).open)}>
        <summary>References ({narrative.references.length})</summary>
        {narrative.references.length ? (
          <ol className="refs">
            {narrative.references.map((r) => (
              <li key={r.anchor} id={`summary-${r.anchor}`} value={r.number} className={flash === r.anchor ? 'flash' : undefined}>
                <strong>{r.scope}</strong>
                {r.source.title ? ` — ${r.source.title}` : ''} — <SafeLink url={r.source.url} />
                {r.source.accessedAt ? ` (accessed ${r.source.accessedAt})` : ''}
                {r.source.appliesTo?.length ? ` · supports ${r.source.appliesTo.join(', ')}` : ''}
                {r.source.note ? <div style={{ color: 'var(--ink-2)' }}>{r.source.note}</div> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: 14 }}>No references entered.</p>
        )}
        {narrative.unsourced.length ? <p style={{ fontSize: 14 }}>Unsourced estimates: {narrative.unsourced.join(', ')}.</p> : null}
        <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>References are recorded as entered; they are not fetched or verified.</p>
      </details>

      <details className="section" id="summary-methodology" open={methodOpen} onToggle={(e) => setMethodOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Methodology</summary>
        {methodology().map((m) => (
          <div key={m.title}>
            <h4 style={{ margin: '12px 0 4px', fontSize: 14 }}>{m.title}</h4>
            {m.paragraphs.map((p, i) => (
              <p key={i} style={{ fontSize: 14 }}>
                {p}
              </p>
            ))}
            {m.formulas?.map((f) => (
              <div key={f}>
                <code className="formula">{f}</code>
              </div>
            ))}
          </div>
        ))}
      </details>
    </div>
  );
}
