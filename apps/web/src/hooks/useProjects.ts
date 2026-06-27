import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProject as createProjectApi,
  deleteProject as deleteProjectApi,
  listProjects,
  updateProject as updateProjectApi,
  type NewProject,
  type Project,
  type ProjectPatch,
} from '@/lib/projects';

/**
 * Projects state (v3.0) — mirrors `useThreads`: a list loaded once on mount and
 * patched optimistically on create/edit/delete. Mounted once in `RootLayout` (via
 * `ProjectsContext`) so the sidebar, the projects pages, and a thread's
 * shared-context lookup all read the same list across navigation.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  const refresh = useCallback(async (): Promise<Project[]> => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await listProjects();
      setProjects(loaded);
      return loaded;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didInit.current) return; // guard StrictMode double-invoke
    didInit.current = true;
    void refresh();
  }, [refresh]);

  const createProject = useCallback(async (input: NewProject): Promise<Project | null> => {
    try {
      const project = await createProjectApi(input);
      setProjects((prev) => [project, ...prev]);
      return project;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const updateProject = useCallback(
    async (id: string, patch: ProjectPatch): Promise<Project | null> => {
      // Optimistic: apply the patch locally, then reconcile with the server row.
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
      );
      try {
        const updated = await updateProjectApi(id, patch);
        setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        void refresh();
        return null;
      }
    },
    [refresh],
  );

  const removeProject = useCallback(
    async (id: string): Promise<void> => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      try {
        await deleteProjectApi(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        void refresh();
      }
    },
    [refresh],
  );

  return { projects, loading, error, refresh, createProject, updateProject, removeProject };
}
