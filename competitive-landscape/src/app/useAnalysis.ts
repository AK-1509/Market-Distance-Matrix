import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { analyzeProject, type Analysis, type AnalysisOutcome } from '../domain/analysis';
import { layoutDiagnostics, type LayoutDiagnostics } from '../domain/diagnostics';
import { buildLayoutInput } from '../domain/layout';
import { buildNarrative, type Narrative } from '../domain/narrative';
import type { LayoutResult, Point, Project } from '../domain/types';
import type { SnapshotRecord } from '../storage/db';
import { getSnapshot, saveSnapshot } from '../storage/repository';
import { createBrowserWorker, LayoutCoordinator } from '../worker/coordinator';

export interface ResolvedView {
  project: Project;
  analysis: Analysis;
  layout: LayoutResult;
  diagnostics: LayoutDiagnostics;
  narrative: Narrative;
}

export interface AnalysisState {
  outcome: AnalysisOutcome | null;
  /** Current analysis (always exact); present whenever the draft is analysable. */
  analysis: Analysis | null;
  /** Current narrative; uses the map diagnostics once the layout is ready. */
  narrative: Narrative | null;
  /** Current analysis + matching layout. Null while the map is being fitted. */
  current: ResolvedView | null;
  /** Last self-consistent map while a new layout is being fitted (rendered dimmed). */
  previous: ResolvedView | null;
  /** Last valid snapshot when the draft cannot be analysed. Never labelled current. */
  stale: (ResolvedView & { revision: number; analyzedAt: string }) | null;
  layoutPending: boolean;
  layoutError: string | null;
}

function resolve(project: Project, analysis: Analysis, layout: LayoutResult): ResolvedView {
  const diagnostics = layoutDiagnostics(analysis, layout);
  return { project, analysis, layout, diagnostics, narrative: buildNarrative(project, analysis, diagnostics) };
}

export function useAnalysis(
  project: Project | null,
  latestProject: MutableRefObject<Project | null>,
  persistAnchor: (anchorId: string) => void,
): AnalysisState {
  const outcome = useMemo(() => (project ? analyzeProject(project) : null), [project]);
  const analysis = outcome?.status === 'ok' ? outcome.analysis : null;
  const hash = analysis?.inputHash ?? null;

  const [snapshot, setSnapshot] = useState<SnapshotRecord | null | undefined>(undefined);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<ResolvedView | null>(null);
  const coordinator = useRef<LayoutCoordinator | null>(null);
  const lastPositions = useRef<Record<string, Point> | null>(null);
  const currentHash = useRef<string | null>(null);
  currentHash.current = hash;
  const projectId = project?.id ?? null;

  useEffect(() => {
    coordinator.current = new LayoutCoordinator(createBrowserWorker);
    return () => coordinator.current?.dispose();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setSnapshot(undefined);
    setLayout(null);
    setPrevious(null);
    lastPositions.current = null;
    getSnapshot(projectId).then(
      (s) => {
        if (cancelled) return;
        setSnapshot(s ?? null);
        if (s) lastPositions.current = s.layout.positions;
      },
      () => !cancelled && setSnapshot(null),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Keep the resolved anchor stable across edits by persisting it.
  const anchorId = analysis?.anchorId ?? null;
  const storedAnchor = project?.layoutSettings.anchorProductId;
  useEffect(() => {
    if (anchorId && anchorId !== storedAnchor) persistAnchor(anchorId);
  }, [anchorId, storedAnchor, persistAnchor]);

  useEffect(() => {
    if (!analysis || snapshot === undefined) return;
    if (layout?.inputHash === analysis.inputHash) return;
    if (snapshot && snapshot.inputHash === analysis.inputHash) {
      setLayout(snapshot.layout);
      lastPositions.current = snapshot.layout.positions;
      setPending(false);
      return;
    }
    const c = coordinator.current;
    if (!c) return;
    setPending(true);
    setError(null);
    let active = true;
    c.request(buildLayoutInput(analysis, lastPositions.current)).then((res) => {
      if (!active) return;
      if (res.status === 'superseded') return;
      if (res.status === 'failed') {
        setPending(false);
        setError(res.error);
        return;
      }
      // Apply only if it still matches the current inputs.
      if (res.result.inputHash !== currentHash.current) return;
      setLayout(res.result);
      setPending(false);
      lastPositions.current = res.result.positions;
      const latest = latestProject.current;
      if (latest) {
        saveSnapshot(latest, res.result.inputHash, res.result).then(
          () => setSnapshot({ projectId: latest.id, revision: latest.revision, inputHash: res.result.inputHash, analyzedAt: new Date().toISOString(), project: structuredClone(latest), layout: res.result }),
          () => undefined,
        );
      }
    });
    return () => {
      active = false;
    };
    // Runs per input hash; `analysis` and `layout` are read at that moment by design.
  }, [hash, snapshot === undefined]);

  const current = useMemo(() => {
    if (!project || !analysis || !layout || layout.inputHash !== analysis.inputHash) return null;
    return resolve(project, analysis, layout);
  }, [project, analysis, layout]);

  useEffect(() => {
    if (current) setPrevious(current);
  }, [current]);

  const narrative = useMemo(() => {
    if (current) return current.narrative;
    if (project && analysis) return buildNarrative(project, analysis, null);
    return null;
  }, [current, project, analysis]);

  const stale = useMemo(() => {
    if (outcome?.status !== 'blocked' || !snapshot) return null;
    const o = analyzeProject(snapshot.project);
    if (o.status !== 'ok' || o.analysis.inputHash !== snapshot.inputHash) return null;
    return { ...resolve(snapshot.project, o.analysis, snapshot.layout), revision: snapshot.revision, analyzedAt: snapshot.analyzedAt };
  }, [outcome?.status, snapshot]);

  return {
    outcome,
    analysis,
    narrative,
    current,
    previous: current ? null : previous,
    stale,
    layoutPending: pending && !current,
    layoutError: error,
  };
}
