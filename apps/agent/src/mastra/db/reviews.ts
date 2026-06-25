import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Data-team review requests (v0.9 `suggest_review`).
 *
 * When the agent's interpretation is ambiguous or its confidence is low, it can
 * surface a "request a data-team review" affordance *alongside* a complete
 * answer (never instead of one). Each request is persisted here so a future
 * Tasks/review surface can list them; the tool also returns the affordance for
 * the agent to mention.
 */

export type ReviewStatus = 'open' | 'resolved';

export interface ReviewRequest {
  id: string;
  question: string;
  reason: string;
  status: ReviewStatus;
  createdAt: number;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_review_requests (
           id         TEXT PRIMARY KEY,
           question   TEXT NOT NULL,
           reason     TEXT NOT NULL,
           status     TEXT NOT NULL,
           created_at INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function rowToReview(row: Record<string, Cell>): ReviewRequest {
  return {
    id: String(row.id),
    question: String(row.question),
    reason: String(row.reason),
    status: (String(row.status) as ReviewStatus) || 'open',
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function createReviewRequest(input: {
  question: string;
  reason: string;
}): Promise<ReviewRequest> {
  await ensureSchema();
  const review: ReviewRequest = {
    id: randomUUID(),
    question: input.question.trim(),
    reason: input.reason.trim(),
    status: 'open',
    createdAt: Date.now(),
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_review_requests (id, question, reason, status, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [review.id, review.question, review.reason, review.status, review.createdAt],
  });
  return review;
}

export async function listReviewRequests(): Promise<ReviewRequest[]> {
  await ensureSchema();
  const res = await dexStore.execute('SELECT * FROM dex_review_requests ORDER BY created_at DESC');
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToReview);
}

export async function deleteReviewRequest(id: string): Promise<boolean> {
  await ensureSchema();
  const current = await dexStore.execute({
    sql: 'SELECT id FROM dex_review_requests WHERE id = ?',
    args: [id],
  });
  if (current.rows.length === 0) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_review_requests WHERE id = ?', args: [id] });
  return true;
}
