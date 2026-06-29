import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal semantic project the mocked REST layer returns. `createSemanticModel`
// mutates it so a subsequent `fetchSemanticProject` (the post-save reload) reports
// the new draft — mirroring the server persisting it.
const blankProject = () => ({
  id: 'dex',
  name: 'Dex',
  description: null,
  demo: false,
  sourceId: 'builtin',
  source: { name: 'Sample', kind: 'sqlite' },
  modelCount: 0,
  models: [] as unknown[],
  metrics: [] as unknown[],
});

const h = vi.hoisted(() => ({ project: null as unknown }));

vi.mock('@/lib/dataSources', () => ({
  fetchSemanticProject: vi.fn(async () => h.project),
  fetchSemanticModel: vi.fn(async () => ({ yaml: '', status: 'published', builtin: false })),
  createSemanticModel: vi.fn(async () => {
    const m = {
      id: 'my_model',
      name: 'my_model',
      description: null,
      endorsed: false,
      status: 'draft',
      measures: [],
      dimensions: [],
      joins: [],
    };
    h.project = { ...(h.project as Record<string, unknown>), models: [m], modelCount: 1 };
    return m;
  }),
  updateSemanticModel: vi.fn(async () => null),
  deleteSemanticModel: vi.fn(async () => {}),
  publishSemanticModel: vi.fn(async () => null),
}));

import { useModelStudio, AUTOSAVE_MS } from '@/hooks/useModelStudio';
import { createSemanticModel } from '@/lib/dataSources';

const TEMPLATE = 'name: my_model\nsql: my_table\nmeasures:\n  - name: count\n    type: count\n';
const KEY = 'dex.modelStudio.drafts.dex';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  h.project = blankProject();
  vi.mocked(createSemanticModel).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useModelStudio server-side draft autosave', () => {
  it('auto-saves an edited new file to the server as a draft after a pause', async () => {
    const { result } = renderHook(() => useModelStudio('dex', 'untitled'));
    await act(async () => {}); // flush the mount load

    act(() => result.current.openNew(TEMPLATE));
    // Nothing is sent on the keystroke itself — only after the idle window.
    expect(createSemanticModel).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(createSemanticModel).toHaveBeenCalledTimes(1);
    // The tab now tracks the persisted model, and the post-save reload lists it
    // in the directory as a saved (non-unsaved) row.
    expect(result.current.files[0].modelId).toBe('my_model');
    expect(result.current.directory.some((e) => e.name === 'my_model' && !e.unsaved)).toBe(true);
  });

  it('does not busy-retry while the YAML stays invalid, then retries after an edit', async () => {
    vi.mocked(createSemanticModel).mockRejectedValueOnce(new Error('Table does not exist'));
    const { result } = renderHook(() => useModelStudio('dex', 'untitled'));
    await act(async () => {});

    act(() => result.current.openNew(TEMPLATE));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    expect(createSemanticModel).toHaveBeenCalledTimes(1);
    expect(result.current.files[0].saveError).toBeTruthy();

    // No edits → the rejected draft must not hammer the server again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 3);
    });
    expect(createSemanticModel).toHaveBeenCalledTimes(1);

    // Editing clears the error and re-arms autosave.
    const key = result.current.files[0].key;
    act(() => result.current.editYaml(key, `${TEMPLATE}# tweak\n`));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    expect(createSemanticModel).toHaveBeenCalledTimes(2);
  });
});

describe('useModelStudio localStorage fallback', () => {
  it('mirrors an unsaved new file to localStorage and restores it on remount', async () => {
    const { result, unmount } = renderHook(() => useModelStudio('dex', 'untitled'));
    await act(async () => {});

    // Open a new file but never let autosave run — the draft lives only in memory
    // + localStorage (the case where the server can't accept it yet).
    act(() => result.current.openNew(TEMPLATE));
    expect(localStorage.getItem(KEY)).toBeTruthy();

    unmount(); // simulate a refresh (cancels any pending autosave timer)
    expect(createSemanticModel).not.toHaveBeenCalled();

    const { result: r2 } = renderHook(() => useModelStudio('dex', 'untitled'));
    await act(async () => {});

    // The draft comes back as an open tab and an unsaved directory row.
    expect(r2.current.files.some((f) => f.modelId === null && f.yaml.includes('my_model'))).toBe(
      true,
    );
    expect(r2.current.directory.some((e) => e.unsaved && e.name === 'my_model')).toBe(true);
  });

  it('clears the local copy once the draft lands on the server', async () => {
    const { result } = renderHook(() => useModelStudio('dex', 'untitled'));
    await act(async () => {});

    act(() => result.current.openNew(TEMPLATE));
    expect(localStorage.getItem(KEY)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    // Saved server-side → no longer an unsaved new file → local fallback cleared.
    expect(result.current.files[0].modelId).toBe('my_model');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
