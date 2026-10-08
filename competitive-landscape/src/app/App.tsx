import { ProjectsPage } from '../ui/ProjectsPage';
import { Workspace } from '../ui/Workspace';
import { useRoute } from './router';

export function App() {
  const route = useRoute();
  return (
    <>
      <nav className="topbar" aria-label="Main">
        <a href="#/" className="brand">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="14" fill="none" stroke="#2a78d6" strokeWidth="2" />
            <circle cx="16" cy="16" r="7" fill="none" stroke="#2a78d6" strokeWidth="2" />
            <circle cx="16" cy="16" r="3" fill="#0b0b0b" />
          </svg>
          Market Landscape
        </a>
        {route.name === 'project' ? (
          <a href="#/" className="btn ghost small">
            ← All projects
          </a>
        ) : null}
      </nav>
      <main>{route.name === 'project' ? <Workspace key={route.id} projectId={route.id} fresh={route.fresh} /> : <ProjectsPage />}</main>
    </>
  );
}
