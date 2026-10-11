import { liveQuery } from 'dexie';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../domain/types';
import { repo } from '../storage/instance';

export type Route = { view: 'projects' } | { view: 'project'; id: string };

function parseHash(hash: string): Route {
  const m = /^#\/project\/([A-Za-z0-9_-]+)/.exec(hash);
  return m ? { view: 'project', id: m[1] } : { view: 'projects' };
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((r: Route) => {
    window.location.hash = r.view === 'project' ? `#/project/${r.id}` : '#/';
  }, []);
  return [route, navigate];
}

/** Live list of saved projects (most recently modified first). */
export function useProjectList(): { projects: Project[] | undefined; error: string | null } {
  const [projects, setProjects] = useState<Project[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sub = liveQuery(() => repo.list()).subscribe({
      next: (v) => setProjects(v),
      error: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    });
    return () => sub.unsubscribe();
  }, []);
  return { projects, error };
}

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

/**
 * Editable draft with debounced autosave. The save indicator reflects actual IndexedDB
 * transaction results: "Saved" only after the write for the latest revision commits.
 */
export function useProjectDraft(projectId: string) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef<Project | null>(null);
  const savedRevision = useRef<number>(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    let alive = true;
    setProject(undefined);
    repo.get(projectId).then(
      (p) => {
        if (!alive) return;
        latest.current = p ?? null;
        savedRevision.current = p?.revision ?? -1;
        setProject(p ?? null);
        setSaveState('saved');
      },
      (e: unknown) => {
        if (!alive) return;
        setSaveError(e instanceof Error ? e.message : String(e));
        setProject(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = latest.current;
    if (!p) return;
    if (p.revision === savedRevision.current) {
      setSaveState('saved');
      return;
    }
    if (inFlight.current) {
      again.current = true; // a newer revision will be written when the current write commits
      return;
    }
    inFlight.current = true;
    setSaveState('saving');
    let ok = false;
    try {
      await repo.save(p);
      ok = true;
      savedRevision.current = p.revision;
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaveState('error');
    } finally {
      inFlight.current = false;
    }
    if (!ok) {
      again.current = false;
      return;
    }
    if (again.current || latest.current?.revision !== p.revision) {
      again.current = false;
      await flush();
      return;
    }
    setSaveState('saved');
  }, []);

  /** Apply an edit. Ordinary edits are debounced; explicit saves (immediate) flush at once. */
  const update = useCallback(
    (mutate: (p: Project) => Project, opts: { immediate?: boolean } = {}) => {
      const prev = latest.current;
      if (!prev) return;
      const next: Project = { ...mutate(prev), revision: prev.revision + 1, updatedAt: new Date().toISOString() };
      latest.current = next;
      setProject(next);
      setSaveState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), opts.immediate ? 0 : 600);
    },
    [flush],
  );

  // Best-effort flush when the page is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onUnload = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      void flush();
    };
  }, [flush]);

  return { project, saveState, saveError, update, flush };
}

/** Observe an element's content width (for building pixel-exact chart scenes). */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
