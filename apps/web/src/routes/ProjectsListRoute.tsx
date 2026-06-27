import { useNavigate } from 'react-router';
import { useProjectsContext } from '@/contexts/ProjectsContext';
import { ProjectsList } from '@/components/projects/ProjectsList';
import { useT } from '@/i18n';

/**
 * The projects list at `/projects`. Thin adapter: pulls projects state from
 * context and turns open/new into navigations. Creating a project routes straight
 * into its detail page so the user can fill in name/description/context there.
 */
export function ProjectsListRoute() {
  const { projects, loading, error, refresh, createProject } = useProjectsContext();
  const navigate = useNavigate();
  const t = useT();

  return (
    <ProjectsList
      projects={projects}
      loading={loading}
      error={error}
      onOpen={(id) => navigate(`/projects/${id}`)}
      onRetry={() => void refresh()}
      onNew={() =>
        void (async () => {
          const p = await createProject({ name: t.projects.untitled });
          if (p) navigate(`/projects/${p.id}`);
        })()
      }
    />
  );
}
