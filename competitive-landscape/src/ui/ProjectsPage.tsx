import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../app/router';
import { createProject } from '../domain/factory';
import { formatDateTime } from '../domain/format';
import { ImportError } from '../domain/importError';
import { addProject, createExampleProject, deleteProject, errorMessage, importProjectText, listProjects, type ProjectSummary } from '../storage/repository';
import { storageNote, useStorageKind } from '../app/storageInfo';
import { ConfirmButton, Link } from './common';
import { ExamplePreview } from './ExamplePreview';
import { ProjectForm, type ProjectFormValues } from './ProjectForm';

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; title: string; details?: string[]; openId?: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const kind = useStorageKind();

  const refresh = useCallback(() => {
    listProjects().then(setProjects, (e: unknown) => {
      setProjects([]);
      setMessage({ kind: 'error', title: `Could not read saved projects: ${e instanceof Error ? e.message : String(e)}` });
    });
  }, []);
  useEffect(refresh, [refresh]);

  const create = async (v: ProjectFormValues) => {
    const p = createProject({ name: v.name, marketDescription: v.marketDescription, tam: v.tam, marketUnit: v.marketUnit, referenceDate: v.referenceDate, notes: v.notes });
    p.sources = v.sources;
    try {
      await addProject(p);
      setCreating(false);
      navigate(`#/project/${p.id}/new`);
    } catch (e) {
      setMessage({ kind: 'error', title: `Could not save the project: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const openExample = async () => {
    try {
      const p = await createExampleProject();
      navigate(`#/project/${p.id}`);
    } catch (e) {
      setMessage({ kind: 'error', title: `Could not create the example: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const text = await file.text();
      const { project, warnings } = await importProjectText(text);
      setMessage({ kind: 'info', title: `Imported “${project.name}” as a new project.`, details: warnings, openId: project.id });
      refresh();
    } catch (e) {
      if (e instanceof ImportError) setMessage({ kind: 'error', title: `Import failed: ${e.message}`, details: e.details });
      else setMessage({ kind: 'error', title: `Import failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (p: ProjectSummary) => {
    try {
      await deleteProject(p.id);
    } catch (e) {
      setMessage({ kind: 'error', title: `Could not delete the project: ${errorMessage(e)}` });
    }
    refresh();
  };

  return (
    <div className="page">
      <section className="hero">
        <h1>Market Landscape</h1>
        <p>
          Turn a small set of researched competitors into an editable competitive landscape and a presentation-ready graphic. Enter one TAM, your IDV and its
          competitors’ SAMs and customer segments; get exact modelled distances, a radial map and a written summary.
        </p>
        <div className="actions-row">
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            Create project
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import project
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Import project JSON file"
            data-testid="import-input"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
          <button type="button" className="btn" onClick={() => void openExample()}>
            Open example
          </button>
        </div>
      </section>

      {message ? (
        <div className={`notice ${message.kind === 'error' ? 'error' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'} data-testid="projects-message">
          <span className="title">{message.title}</span>{' '}
          {message.openId ? (
            <Link to={`#/project/${message.openId}`} className="btn small">
              Open it
            </Link>
          ) : null}
          {message.details?.length ? (
            <ul>
              {message.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <h2 style={{ fontSize: 18, marginTop: 12 }}>Saved projects</h2>
      {projects === null ? (
        <p>Loading…</p>
      ) : projects.length === 0 ? (
        <>
          <div className="empty" style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}>No projects yet. Create one, import a JSON backup, or open the fictional example below.</p>
          </div>
          <ExamplePreview onOpen={() => void openExample()} />
        </>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li className="project-card" key={p.id} data-testid="project-card">
              <h2>
                <Link to={`#/project/${p.id}`}>{p.name || 'Untitled project'}</Link>
              </h2>
              {p.marketDescription ? <p>{p.marketDescription}</p> : null}
              <span className="meta">
                {p.productCount} product{p.productCount === 1 ? '' : 's'} · last modified {formatDateTime(p.updatedAt)}
              </span>
              <div className="row">
                <Link className="btn small" to={`#/project/${p.id}`}>
                  Open
                </Link>
                <ConfirmButton label="Delete" confirmLabel="Delete project" prompt="Delete for good?" onConfirm={() => void remove(p)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="storage-note" data-testid="storage-note">
        {storageNote(kind)} Use <strong>Export → Project JSON</strong> inside a project to make one.
      </p>

      {creating ? <ProjectForm mode="create" onSubmit={(v) => void create(v)} onCancel={() => setCreating(false)} /> : null}
    </div>
  );
}
