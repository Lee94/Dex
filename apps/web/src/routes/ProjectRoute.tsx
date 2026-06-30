import { useEffect, useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useProjectsContext } from '@/contexts/ProjectsContext';
import { useThreadsContext } from '@/contexts/ThreadsContext';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { listProjectThreads } from '@/lib/threads';
import type { Thread } from '@/types';

const route = getRouteApi('/shell/projects/$id');

/**
 * Project detail at `/projects/:id`. Resolves the project from context (URL is the
 * source of truth) and loads its threads via a server-side metadata filter,
 * merging in any just-created in-session threads. Edits flow back through the
 * projects context (optimistic).
 */
export function ProjectRoute() {
  const { id } = route.useParams();
  const { projects, loading, updateProject, removeProject } = useProjectsContext();
  const { threads: sessionThreads, createThread } = useThreadsContext();
  const navigate = useNavigate();

  const project = id ? (projects.find((p) => p.id === id) ?? null) : null;
  const [fetched, setFetched] = useState<Thread[]>([]);

  // Authoritative list of the project's persisted threads (server metadata filter).
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void listProjectThreads(id)
      .then((t) => {
        if (alive) setFetched(t);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  // Unknown project (deleted or stale link) → back to the list once loaded.
  useEffect(() => {
    if (id && !loading && !projects.some((p) => p.id === id)) {
      navigate({ to: '/projects', replace: true });
    }
  }, [id, loading, projects, navigate]);

  if (!project) return null;

  // Merge in-session threads created in this project (not yet queryable) with the
  // server-fetched ones, deduped by id (session first so new ones surface on top).
  const seen = new Set<string>();
  const threads: Thread[] = [];
  for (const t of [...sessionThreads.filter((s) => s.projectId === id), ...fetched]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    threads.push(t);
  }

  return (
    <ProjectDetail
      key={project.id}
      project={project}
      threads={threads}
      onBack={() => navigate({ to: '/projects' })}
      onChange={(patch) => void updateProject(project.id, patch)}
      onDelete={async () => {
        await removeProject(project.id);
        navigate({ to: '/projects' });
      }}
      onOpenThread={(tid) => navigate({ to: '/threads/$id', params: { id: tid } })}
      onNewThread={() => navigate({ to: '/threads/$id', params: { id: createThread(project.id) } })}
    />
  );
}
