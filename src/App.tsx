import { ProjectsPage } from './ui/ProjectsPage';
import { Workspace } from './ui/Workspace';
import { useHashRoute } from './ui/hooks';

export function App() {
  const [route, navigate] = useHashRoute();
  if (route.view === 'project') return <Workspace key={route.id} projectId={route.id} onBack={() => navigate({ view: 'projects' })} />;
  return <ProjectsPage onOpen={(id) => navigate({ view: 'project', id })} />;
}
