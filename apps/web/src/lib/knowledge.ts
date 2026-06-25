import { apiFetch } from '@/lib/apiClient';

/**
 * Knowledge & memory client (v0.9).
 *
 * Talks to the agent's root REST routes (apps/agent/src/mastra/server/
 * knowledge-routes.ts): org **guides** the agent reads, durable **memories** it
 * honors across threads, and data-team **review requests** it raises. Same thin
 * `apiFetch` pattern as `lib/dataSources.ts` — stateless helpers that return data
 * or throw a clean Error.
 */

export interface GuideSummary {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  excerpt: string;
}

export interface Guide {
  id: string;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: number;
}

export interface Memory {
  id: string;
  resourceId: string;
  content: string;
  createdAt: number;
}

export interface ReviewRequest {
  id: string;
  question: string;
  reason: string;
  status: 'open' | 'resolved';
  createdAt: number;
}

// --- guides -----------------------------------------------------------------

export async function listGuides(): Promise<GuideSummary[]> {
  const { guides } = await apiFetch<{ guides: GuideSummary[] }>('/guides');
  return guides;
}

export async function getGuide(id: string): Promise<Guide> {
  const { guide } = await apiFetch<{ guide: Guide }>(`/guides/${encodeURIComponent(id)}`);
  return guide;
}

export async function createGuide(input: {
  title: string;
  content: string;
  tags: string[];
}): Promise<Guide> {
  const { guide } = await apiFetch<{ guide: Guide }>('/guides', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return guide;
}

export async function updateGuide(
  id: string,
  patch: { title?: string; content?: string; tags?: string[] },
): Promise<Guide> {
  const { guide } = await apiFetch<{ guide: Guide }>(`/guides/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return guide;
}

export async function deleteGuide(id: string): Promise<void> {
  await apiFetch(`/guides/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- memories ---------------------------------------------------------------

export async function listMemories(): Promise<Memory[]> {
  const { memories } = await apiFetch<{ memories: Memory[] }>('/memories');
  return memories;
}

export async function deleteMemory(id: string): Promise<void> {
  await apiFetch(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- review requests --------------------------------------------------------

export async function listReviews(): Promise<ReviewRequest[]> {
  const { reviews } = await apiFetch<{ reviews: ReviewRequest[] }>('/reviews');
  return reviews;
}

export async function deleteReview(id: string): Promise<void> {
  await apiFetch(`/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
