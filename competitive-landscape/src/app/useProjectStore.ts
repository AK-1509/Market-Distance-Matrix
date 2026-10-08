import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../domain/types';
import { getProject, saveDraft } from '../storage/repository';

export type SaveState =
  | { kind: 'saved'; savedAt?: string }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'error'; error: string };

export type LoadState = 'loading' | 'ready' | 'missing' | 'error';

export interface UpdateOptions {
  /** Housekeeping writes (e.g. persisting the resolved map anchor) keep revision and updatedAt. */
  housekeeping?: boolean;
  /** Debounce delay in ms; 0 saves right away. */
  delay?: number;
}

const DEBOUNCE_MS = 400;

/**
 * Holds the editable draft and persists it to IndexedDB with a debounce.
 * The save indicator reflects real transaction outcomes: "Saved" only after
 * IndexedDB confirms the write and nothing newer is pending.
 */
export function useProjectStore(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [save, setSave] = useState<SaveState>({ kind: 'saved' });
  const latest = useRef<Project | null>(null);
  const dirty = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    getProject(projectId).then(
      (p) => {
        if (cancelled) return;
        if (!p) {
          setLoadState('missing');
          return;
        }
        latest.current = p;
        setProject(p);
        setLoadState('ready');
      },
      () => !cancelled && setLoadState('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inflight.current) await inflight.current;
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    const record = latest.current;
    setSave({ kind: 'saving' });
    let failed = false;
    const run = saveDraft(record).then(
      () => undefined,
      (err: unknown) => {
        failed = true;
        dirty.current = true;
        setSave({ kind: 'error', error: err instanceof Error ? err.message : String(err) });
      },
    );
    inflight.current = run;
    await run;
    inflight.current = null;
    if (failed) return;
    if (dirty.current) {
      // Edits arrived while writing: save them too.
      await flush();
    } else {
      setSave({ kind: 'saved', savedAt: new Date().toISOString() });
    }
  }, []);

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  const update = useCallback(
    (mutator: (draft: Project) => Project | void, options: UpdateOptions = {}) => {
      const current = latest.current;
      if (!current) return;
      const draft = structuredClone(current);
      const next = mutator(draft) ?? draft;
      if (!options.housekeeping) {
        next.revision = current.revision + 1;
        next.updatedAt = new Date().toISOString();
      }
      latest.current = next;
      setProject(next);
      dirty.current = true;
      setSave((s) => (s.kind === 'saving' ? s : { kind: 'pending' }));
      schedule(options.delay ?? DEBOUNCE_MS);
    },
    [schedule],
  );

  // Flush when the page is hidden or the workspace unmounts.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [flush]);

  return { project, loadState, save, update, flush, latest };
}
