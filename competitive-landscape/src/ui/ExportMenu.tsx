import { useEffect, useId, useRef, useState } from 'react';
import type { ExportKind } from '../app/exports';
import { storageNote, useStorageKind } from '../app/storageInfo';
import { canSaveFiles } from '../export/save';
import type { ResolvedView } from '../app/useAnalysis';
import type { LayoutResult, Project } from '../domain/types';

const ITEMS: { kind: ExportKind; label: string; hint: string; needsView: boolean }[] = [
  { kind: 'landscape-png', label: 'Landscape PNG', hint: '1920 × 1080, opaque, legend and model note', needsView: true },
  { kind: 'landscape-svg', label: 'Landscape SVG', hint: 'Vector, embedded styles, no external fonts', needsView: true },
  { kind: 'distance-png', label: 'Distance chart PNG', hint: '1920 wide, exact distances', needsView: true },
  { kind: 'distance-svg', label: 'Distance chart SVG', hint: 'Vector', needsView: true },
  { kind: 'report', label: 'Report (HTML)', hint: 'Summary, both charts, methodology, references — print to PDF', needsView: true },
];

export function ExportMenu({ view, project, layoutCache }: { view: ResolvedView | null; project: Project; layoutCache: LayoutResult | null }) {
  const [open, setOpen] = useState(false);
  const [clean, setClean] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canSave, setCanSave] = useState<boolean | null>(null);
  const kind = useStorageKind();
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    canSaveFiles().then((ok) => live && setCanSave(ok), () => live && setCanSave(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = async (exportKind: ExportKind) => {
    setBusy(true);
    setMessage(null);
    try {
      // Export code (including react-dom/server) loads on first use.
      const { runExport } = await import('../app/exports');
      const out = await runExport(exportKind, view, project, layoutCache, clean);
      setMessage(out.status === 'saved' ? `Saved ${out.file}` : out.status === 'delivered' ? `Sent ${out.file}` : `Downloaded ${out.file}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="menu-wrap" ref={wrap}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        Export
      </button>
      {open ? (
        <div className="menu" id={menuId} role="menu" aria-label="Export">
          {ITEMS.map((it) => (
            <button key={it.kind} type="button" role="menuitem" className="item" disabled={busy || canSave === false || (it.needsView && !view)} onClick={() => go(it.kind)}>
              {it.label}
              <small>{it.needsView && !view ? 'Available when the analysis is current' : it.hint}</small>
            </button>
          ))}
          <label className="toggle menu-note">
            <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} /> Clean presentation variant (charts)
          </label>
          <hr />
          <button type="button" role="menuitem" className="item" disabled={busy || canSave === false} onClick={() => go('json')}>
            Project JSON (backup)
            <small>All inputs, IDs, sources, settings and the last map layout</small>
          </button>
          {canSave === false ? <p className="menu-note">Saving files is not available in this view (for example a signed-out or public view).</p> : null}
          <p className="menu-note">{storageNote(kind)} Import a backup from the Projects page.</p>
          {message ? (
            <p className="menu-note" role="status">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
