import { Link } from '../ui/common';
import { ProjectsPage } from '../ui/ProjectsPage';
import { Workspace } from '../ui/Workspace';
import { useRoute } from './router';

export function App() {
  const route = useRoute();
  return (
    <>
      <nav className="topbar" aria-label="Main">
        <Link to="#/" className="brand">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="14" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="2" />
            <circle cx="16" cy="16" r="7" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="2" />
            <circle cx="16" cy="16" r="3" style={{ fill: 'var(--chart-ink)' }} />
          </svg>
          Market Landscape
        </Link>
        {route.name === 'project' ? (
          <Link to="#/" className="btn ghost small">
            ← All projects
          </Link>
        ) : null}
      </nav>
      <main>{route.name === 'project' ? <Workspace key={route.id} projectId={route.id} fresh={route.fresh} /> : <ProjectsPage />}</main>
    </>
  );
}
