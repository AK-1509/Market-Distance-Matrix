import { useRef, useState } from 'react';
import { formatDateTime } from '../domain/format';
import type { Project } from '../domain/types';
import { ImportError } from '../storage/json';
import { repo } from '../storage/instance';
import { Badge, ConfirmButton } from './common';
import { useProjectList } from './hooks';
import { ProjectDialog, type ProjectFields } from './ProjectDialog';

export function ProjectsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { projects, error } = useProjectList();
  const [creating, setCreating] = useState(false);
  const [importMsg, setImportMsg] = useState<{ tone: 'ok' | 'error'; text: string; details?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = async (fields: ProjectFields) => {
    const p = await repo.create({ ...fields });
    setCreating(false);
    onOpen(p.id);
  };

  const importFile = async (file: File) => {
    setImportMsg(null);
    try {
      const text = await file.text();
      const p = await repo.importJson(text, file.size);
      setImportMsg({ tone: 'ok', text: `Imported “${p.name}” as a new project.` });
    } catch (e) {
      if (e instanceof ImportError) setImportMsg({ tone: 'error', text: e.message, details: e.details });
      else setImportMsg({ tone: 'error', text: `Import failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="page projects-page">
      <header className="hero">
        <h1>Market Landscape</h1>
        <p className="lede">Turn a small set of researched competitors into an editable competitive landscape and a presentation-ready graphic.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            Create project
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            Import project
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const p = await repo.createExample();
              onOpen(p.id);
            }}
          >
            Open example
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import project JSON file"
            data-testid="import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
        </div>
        <p className="field-hint">The example (“AI assistants — fictional market footprints”) opens as a new copy and never replaces your projects.</p>
      </header>

      {importMsg && (
        <div className={`alert ${importMsg.tone === 'ok' ? 'alert-ok' : 'alert-error'}`} role={importMsg.tone === 'ok' ? 'status' : 'alert'} data-testid="import-message">
          {importMsg.text}
          {importMsg.details && importMsg.details.length > 0 && (
            <ul>
              {importMsg.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          Projects could not be loaded from browser storage: {error}
        </div>
      )}

      <section aria-labelledby="saved-title">
        <h2 id="saved-title">Saved projects</h2>
        {projects === undefined ? (
          <p role="status">Loading…</p>
        ) : projects.length === 0 ? (
          <div className="card empty-note-card">
            <p>No projects yet. Create one, import a JSON backup, or open the fictional example.</p>
          </div>
        ) : (
          <ul className="project-list">
            {projects.map((p: Project) => (
              <li key={p.id} className="card project-item">
                <div className="project-main">
                  <button type="button" className="link-btn project-open" onClick={() => onOpen(p.id)}>
                    {p.name}
                  </button>
                  {p.isExample && <Badge tone="example">Fictional example</Badge>}
                  <p className="field-hint">
                    {p.marketDescription ? `${p.marketDescription.slice(0, 140)}${p.marketDescription.length > 140 ? '…' : ''} · ` : ''}
                    {p.products.length} product{p.products.length === 1 ? '' : 's'} · last modified {formatDateTime(p.updatedAt)}
                  </p>
                </div>
                <div className="project-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(p.id)}>
                    Open
                  </button>
                  <ConfirmButton label="Delete" confirmLabel="Click again to delete" className="btn btn-ghost btn-sm" onConfirm={() => void repo.delete(p.id)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="storage-note">
        <p>
          <strong>Where your data lives:</strong> projects are stored only in this browser’s IndexedDB for this site — not in the cloud. Another browser, device, or a cleared cache will not have them. Use{' '}
          <em>Export → Project JSON</em> for a durable backup you control.
        </p>
      </footer>

      {creating && <ProjectDialog project={null} onSave={(f) => void create(f)} onClose={() => setCreating(false)} />}
    </main>
  );
}
