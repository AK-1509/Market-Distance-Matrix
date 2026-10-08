import { useEffect, useState } from 'react';

export type Route = { name: 'projects' } | { name: 'project'; id: string; fresh: boolean };

export function parseHash(hash: string): Route {
  const m = /^#\/project\/([A-Za-z0-9_-]{1,64})(\/new)?$/.exec(hash);
  if (m) return { name: 'project', id: m[1], fresh: Boolean(m[2]) };
  return { name: 'projects' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(hash: string): void {
  if (window.location.hash !== hash) window.location.hash = hash;
}

/** Drop the one-time "/new" marker without adding a history entry. */
export function replaceHash(hash: string): void {
  history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
