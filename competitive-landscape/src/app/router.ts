import { useEffect, useState } from 'react';
import { IS_ARTIFACT } from './env';

export type Route = { name: 'projects' } | { name: 'project'; id: string; fresh: boolean };

export function parseHash(hash: string): Route {
  const m = /^#\/project\/([A-Za-z0-9_-]{1,64})(\/new)?$/.exec(hash);
  if (m) return { name: 'project', id: m[1], fresh: Boolean(m[2]) };
  return { name: 'projects' };
}

// The standalone app routes through location.hash (reload keeps your place).
// Inside the artifact viewer only plain #anchors reach the page, so routing
// stays in memory there.
let memoryRoute: Route = { name: 'projects' };
const listeners = new Set<() => void>();

function current(): Route {
  return IS_ARTIFACT ? memoryRoute : parseHash(window.location.hash);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const onChange = () => setRoute(current());
    listeners.add(onChange);
    if (!IS_ARTIFACT) window.addEventListener('hashchange', onChange);
    return () => {
      listeners.delete(onChange);
      if (!IS_ARTIFACT) window.removeEventListener('hashchange', onChange);
    };
  }, []);
  return route;
}

export function navigate(hash: string): void {
  if (IS_ARTIFACT) {
    memoryRoute = parseHash(hash);
    listeners.forEach((l) => l());
    window.scrollTo?.(0, 0);
    return;
  }
  if (window.location.hash !== hash) window.location.hash = hash;
}

/** Drop the one-time "/new" marker without adding a history entry. */
export function replaceHash(hash: string): void {
  if (IS_ARTIFACT) {
    memoryRoute = parseHash(hash);
    listeners.forEach((l) => l());
    return;
  }
  history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
