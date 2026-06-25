import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuide, deleteGuide, getGuide, updateGuide } from '../src/mastra/db/guides';
import { deleteMemoriesForResource, listMemories, saveMemory } from '../src/mastra/db/memories';
import {
  createReviewRequest,
  deleteReviewRequest,
  listReviewRequests,
} from '../src/mastra/db/reviews';
import { currentDatetime } from '../src/mastra/tools/get-current-datetime';

// Knowledge & memory persistence (v0.9): guides, cross-thread memory, reviews.

test('a guide round-trips by slug and can be edited then deleted', async () => {
  const guide = await createGuide({
    title: 'Test guide — units',
    content: 'Report revenue in thousands.',
    tags: ['test'],
  });
  try {
    const fetched = await getGuide(guide.slug);
    assert.equal(fetched?.content, 'Report revenue in thousands.');
    const edited = await updateGuide(guide.id, { content: 'Report revenue in dollars.' });
    assert.equal(edited?.content, 'Report revenue in dollars.');
    assert.equal(edited?.slug, guide.slug);
  } finally {
    await deleteGuide(guide.id);
  }
  assert.equal(await getGuide(guide.slug), null);
});

test('save_memory persists and recalls across threads, and dedupes', async () => {
  const RES = '__test_resource__';
  await deleteMemoriesForResource(RES);
  try {
    const m1 = await saveMemory('Fiscal year starts in February.', RES);
    const m2 = await saveMemory('Fiscal year starts in February.', RES);
    assert.equal(m1.id, m2.id); // idempotent
    const recalled = await listMemories(RES);
    assert.equal(recalled.length, 1);
    assert.equal(recalled[0]?.content, 'Fiscal year starts in February.');
  } finally {
    await deleteMemoriesForResource(RES);
  }
});

test('suggest_review persists an open request that can be cleared', async () => {
  const review = await createReviewRequest({ question: 'Which revenue?', reason: 'ambiguous' });
  const open = await listReviewRequests();
  assert.ok(open.some((r) => r.id === review.id && r.status === 'open'));
  assert.equal(await deleteReviewRequest(review.id), true);
});

test('currentDatetime formats a fixed instant deterministically', () => {
  const dt = currentDatetime(new Date('2026-06-25T14:30:00.000Z'));
  assert.equal(dt.iso, '2026-06-25T14:30:00.000Z');
  assert.match(dt.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dt.unixMs, Date.parse('2026-06-25T14:30:00.000Z'));
});
