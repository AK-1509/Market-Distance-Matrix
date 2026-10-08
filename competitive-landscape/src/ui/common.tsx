import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../app/router';
import type { SaveState } from '../app/useProjectStore';
import type { Inline } from '../domain/narrative';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
    // Focus is set once when the dialog opens.
  }, []);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header>
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const label =
    state.kind === 'saved' ? 'Saved' : state.kind === 'pending' ? 'Unsaved changes' : state.kind === 'saving' ? 'Saving…' : 'Save failed';
  return (
    <span className={`save-state ${state.kind}`} role="status" aria-live="polite" data-testid="save-status">
      <span className="dot" aria-hidden="true" />
      {label}
      {state.kind === 'error' ? (
        <button type="button" className="link-btn" onClick={onRetry} title={state.error}>
          Retry
        </button>
      ) : null}
    </span>
  );
}

/** Renders narrative runs. Citations are buttons (the app uses hash routing). */
export function InlineRuns({ runs, onCite }: { runs: readonly Inline[]; onCite: (href: string) => void }) {
  return (
    <>
      {runs.map((r, i) => {
        if (typeof r === 'string') return <span key={i}>{r}</span>;
        if ('strong' in r) return <strong key={i}>{r.strong}</strong>;
        return (
          <span key={i} className="cite">
            [
            {r.cite.map((c, k) => (
              <span key={k}>
                {k > 0 ? ', ' : ''}
                <button type="button" title={c.title} onClick={() => onCite(c.href)}>
                  {c.label}
                </button>
              </span>
            ))}
            ]
          </span>
        );
      })}
    </>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  warning,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  warning?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="label">{label}</span>}
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? (
        <span className="error-text" role="alert">
          {error}
        </span>
      ) : null}
      {warning ? <span className="warn-text">{warning}</span> : null}
    </div>
  );
}

export function SafeLink({ url, children }: { url: string; children?: ReactNode }) {
  let ok = false;
  try {
    const u = new URL(url);
    ok = u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    ok = false;
  }
  if (!ok) return <span>{children ?? url}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow">
      {children ?? url}
    </a>
  );
}

/** Measures an element's content width (for responsive SVG scenes). */
export function useElementWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function IdvStar({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M10 1.5l2.47 5.4 5.9.6-4.43 3.95 1.27 5.8L10 14.3l-5.2 2.95 1.27-5.8L1.63 7.5l5.9-.6z" style={{ fill: 'var(--chart-ink)' }} />
    </svg>
  );
}

/** In-app link: works with hash routing (standalone) and memory routing (artifact). */
export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/**
 * Two-step destructive action inside the page. (`window.confirm` is not
 * available in the artifact viewer, and an inline step is clearer anyway.)
 */
export function ConfirmButton({
  label,
  confirmLabel,
  prompt,
  onConfirm,
  className = 'btn small danger',
}: {
  label: string;
  confirmLabel: string;
  prompt: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm-inline" role="group" aria-label={prompt}>
      <span className="confirm-prompt">{prompt}</span>
      <button
        type="button"
        className="btn small danger"
        autoFocus
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn small" onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  );
}
