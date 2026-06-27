import { apiFetch } from '@/lib/apiClient';
import type { Attachment } from '@/lib/attachments';

/**
 * Projects client (v3.0). Talks to the agent's root `/projects` routes
 * (apps/agent/src/mastra/server/project-routes.ts). A project groups threads and
 * carries shared context — project-level `instructions` plus bound data-source
 * `attachments` — that its threads inherit. Same thin `apiFetch` pattern as the
 * other root-route clients. Thread membership itself lives in Mastra thread
 * metadata (see lib/threads.ts), not on the project.
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Project-level instructions every thread in the project inherits. */
  instructions: string;
  /** Data sources/tables/models bound to the project (inherited by its threads). */
  attachments: Attachment[];
  createdAt: number;
  updatedAt: number;
}

export interface NewProject {
  name: string;
  description?: string;
  instructions?: string;
  attachments?: Attachment[];
}

export interface ProjectPatch {
  name?: string;
  description?: string;
  instructions?: string;
  attachments?: Attachment[];
}

export async function listProjects(): Promise<Project[]> {
  const { projects } = await apiFetch<{ projects: Project[] }>('/projects');
  return projects;
}

export async function getProject(id: string): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>(`/projects/${id}`);
  return project;
}

export async function createProject(input: NewProject): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return project;
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch(`/projects/${id}`, { method: 'DELETE' });
}
