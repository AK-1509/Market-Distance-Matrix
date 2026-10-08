// Build target. `vite build --mode artifact` produces the Claude Artifact
// version, which runs inside the claude.ai viewer and reaches storage and
// downloads through runtime capabilities instead of browser APIs.

export const IS_ARTIFACT = import.meta.env.MODE === 'artifact';

type UseFn = (name: string) => Promise<unknown>;

/**
 * Resolve an artifact runtime capability, or null when this view cannot run
 * it (standalone build, page opened outside a viewer, not granted, signed out).
 */
export async function useCapability<T>(name: string): Promise<T | null> {
  if (!IS_ARTIFACT) return null;
  const claude = (globalThis as { claude?: { use?: UseFn } }).claude;
  if (!claude || typeof claude.use !== 'function') return null;
  try {
    return ((await claude.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}
