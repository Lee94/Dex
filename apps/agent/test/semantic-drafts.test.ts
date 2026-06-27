import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createModel,
  saveDraft,
  publishModel,
  discardDraft,
  deleteModel,
  getStoredModelByName,
  statusOf,
  loadMergedModel,
} from '../src/mastra/db/semantic';
import type { Cube } from '../src/mastra/db/semantic';

// Versioned drafts (v3.1): a model carries a published version (agent-visible)
// and/or a draft (an unpublished edit). loadMergedModel only ever exposes the
// published version, so drafts stay invisible to the analyst agent.

const uid = () => `test_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

function makeCube(name: string, measureCount = 1): Cube {
  return {
    name,
    title: name,
    sql: 'products',
    endorsed: false,
    measures: Array.from({ length: measureCount }, (_, i) => ({
      name: i === 0 ? 'n' : `m${i}`,
      title: `Measure ${i}`,
      type: 'count' as const,
      format: 'integer' as const,
    })),
    dimensions: [],
    joins: [],
  };
}

test('a new model is a draft, hidden from the merged model until published', async () => {
  const name = uid();
  await deleteModel(name);
  try {
    const created = await createModel(makeCube(name));
    assert.equal(statusOf(created), 'draft');
    assert.equal(created.published, null);
    assert.ok(created.draft);
    assert.ok(!(await loadMergedModel()).cubes.some((c) => c.name === name));

    const published = await publishModel(name);
    assert.equal(statusOf(published!), 'published');
    assert.equal(published!.draft, null);
    assert.ok((await loadMergedModel()).cubes.some((c) => c.name === name));
  } finally {
    await deleteModel(name);
  }
});

test('a draft over a published model keeps the old published version agent-visible', async () => {
  const name = uid();
  await deleteModel(name);
  try {
    await createModel(makeCube(name, 1), true); // published with 1 measure
    const saved = await saveDraft(name, makeCube(name, 2)); // draft with 2 measures
    assert.equal(statusOf(saved!), 'draft_pending');
    assert.ok(saved!.published && saved!.draft);

    // The agent still sees the published version (1 measure), not the draft.
    const before = await loadMergedModel();
    assert.equal(before.cubes.find((c) => c.name === name)?.measures.length, 1);

    await publishModel(name); // promote the draft
    const after = await loadMergedModel();
    assert.equal(after.cubes.find((c) => c.name === name)?.measures.length, 2);
  } finally {
    await deleteModel(name);
  }
});

test('discarding a draft reverts a published model and removes a never-published one', async () => {
  // published + pending draft → discard reverts to published
  const a = uid();
  await deleteModel(a);
  try {
    await createModel(makeCube(a, 1), true);
    await saveDraft(a, makeCube(a, 2));
    const reverted = await discardDraft(a);
    assert.equal(statusOf(reverted!), 'published');
    assert.equal(reverted!.draft, null);
  } finally {
    await deleteModel(a);
  }

  // never-published draft → discard removes the model entirely
  const b = uid();
  await deleteModel(b);
  await createModel(makeCube(b));
  assert.equal(await discardDraft(b), null);
  assert.equal(await getStoredModelByName(b), null);
});

test('saveDraft can rename a model', async () => {
  const oldName = uid();
  const newName = uid();
  await deleteModel(oldName);
  await deleteModel(newName);
  try {
    await createModel(makeCube(oldName));
    const renamed = await saveDraft(oldName, makeCube(newName));
    assert.equal(renamed!.name, newName);
    assert.equal(await getStoredModelByName(oldName), null);
    assert.ok(await getStoredModelByName(newName));
  } finally {
    await deleteModel(oldName);
    await deleteModel(newName);
  }
});
