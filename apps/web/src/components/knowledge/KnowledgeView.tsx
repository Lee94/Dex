import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton, Pill, ConfirmDialog } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import {
  type GuideSummary,
  type Memory,
  type ReviewRequest,
  createGuide,
  deleteGuide,
  deleteMemory,
  deleteReview,
  getGuide,
  listGuides,
  listMemories,
  listReviews,
  updateGuide,
} from '@/lib/knowledge';
import styles from './knowledge.module.css';

type Tab = 'guides' | 'memory' | 'reviews';

/** Editor draft for the selected (or new) guide. */
type Draft = { id: string | null; title: string; content: string; tags: string };

/**
 * Knowledge & memory surface (v0.9). Author the org **guides** the agent reads,
 * review/forget durable **memories** it honors across threads, and clear
 * data-team **review requests** it raised. Reachable from the sidebar "Library".
 */
export function KnowledgeView() {
  const [tab, setTab] = useState<Tab>('guides');
  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <Icon name="library" size={18} color="var(--dex-primary)" />
        <span className={styles.headTitle}>Knowledge</span>
        <span className={styles.headSub}>
          What the analyst reads and remembers — guides, saved preferences, and review requests.
        </span>
      </div>
      <div className={styles.tabs}>
        {(['guides', 'memory', 'reviews'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`${styles.tab}${tab === t ? ` ${styles.tabOn}` : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'guides' ? 'Guides' : t === 'memory' ? 'Memory' : 'Reviews'}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {tab === 'guides' ? <GuidesPane /> : tab === 'memory' ? <MemoryPane /> : <ReviewsPane />}
      </div>
    </div>
  );
}

// --- guides -----------------------------------------------------------------

function GuidesPane() {
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setGuides(await listGuides());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openGuide = async (id: string) => {
    setShowPreview(false);
    setSaved(false);
    try {
      const g = await getGuide(id);
      setDraft({ id: g.id, title: g.title, content: g.content, tags: g.tags.join(', ') });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const newGuide = () => {
    setShowPreview(false);
    setSaved(false);
    setDraft({ id: null, title: '', content: '', tags: '' });
  };

  const save = async () => {
    if (!draft) return;
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    try {
      const g = draft.id
        ? await updateGuide(draft.id, { title: draft.title, content: draft.content, tags })
        : await createGuide({ title: draft.title, content: draft.content, tags });
      setDraft({ id: g.id, title: g.title, content: g.content, tags: g.tags.join(', ') });
      setSaved(true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    await deleteGuide(draft.id);
    setDraft(null);
    await refresh();
  };

  return (
    <div className={styles.body} style={{ flex: 1 }}>
      <div className={styles.list}>
        <div className={styles.newBtnRow}>
          <Button variant="green" onClick={newGuide} style={{ width: '100%' }}>
            <Icon name="plus" size={13} color="var(--dex-on-primary)" />
            New guide
          </Button>
        </div>
        {error ? <div className={styles.error}>{error}</div> : null}
        {guides.length === 0 && !error ? (
          <div className={styles.empty}>No guides yet.</div>
        ) : (
          guides.map((g) => (
            <button
              key={g.id}
              className={`${styles.card}${draft?.id === g.id ? ` ${styles.cardOn}` : ''}`}
              onClick={() => void openGuide(g.id)}
            >
              <span className={styles.cardTitle}>{g.title}</span>
              {g.excerpt ? <span className={styles.cardExcerpt}>{g.excerpt}</span> : null}
              {g.tags.length ? (
                <span className={styles.tagRow}>
                  {g.tags.map((t) => (
                    <span key={t} className={styles.tag}>
                      {t}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>

      {draft ? (
        <div className={styles.editor}>
          <div className={styles.editorHead}>
            <input
              className={styles.titleInput}
              placeholder="Guide title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            {draft.id ? (
              <IconButton
                icon="trash"
                size={15}
                color="var(--dex-icon)"
                title="Delete guide"
                hover="mid"
                onClick={() => setConfirmDelete(true)}
              />
            ) : null}
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Tags (comma-separated)</span>
            <input
              className={styles.input}
              placeholder="definitions, revenue"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Content (Markdown)</span>
            {showPreview ? (
              <div className={styles.preview}>
                <Markdown source={draft.content || '_Nothing to preview yet._'} />
              </div>
            ) : (
              <textarea
                className={styles.textarea}
                placeholder="Define a metric, term, or approved query pattern…"
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            )}
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.editorActions}>
            <Button
              variant="green"
              onClick={() => void save()}
              disabled={saving || !draft.title.trim()}
            >
              {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create guide'}
            </Button>
            <Button variant="ghost" onClick={() => setShowPreview((p) => !p)}>
              {showPreview ? 'Edit' : 'Preview'}
            </Button>
            <span className={styles.spacer} />
            {saved ? <span className={styles.savedNote}>Saved</span> : null}
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>Select a guide, or create a new one.</div>
      )}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete guide?"
          message="The analyst will no longer read this guide. This can't be undone."
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}

// --- memory -----------------------------------------------------------------

function MemoryPane() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMemories(await listMemories());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const forget = async (id: string) => {
    await deleteMemory(id);
    await refresh();
  };

  if (error) return <div className={styles.error}>{error}</div>;
  if (memories.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon name="bookmark" size={22} color="var(--dex-icon-faint)" />
        <span>
          Nothing remembered yet. When you tell the analyst a durable preference, it saves it here
          and honors it across threads.
        </span>
      </div>
    );
  }
  return (
    <div className={styles.pane}>
      {memories.map((m) => (
        <div key={m.id} className={styles.rowCard}>
          <Icon name="bookmark" size={15} color="var(--dex-icon-subtle)" style={{ marginTop: 2 }} />
          <div className={styles.rowMain}>
            <span className={styles.rowText}>{m.content}</span>
          </div>
          <IconButton
            icon="trash"
            size={14}
            color="var(--dex-icon)"
            title="Forget this"
            hover="mid"
            onClick={() => void forget(m.id)}
          />
        </div>
      ))}
    </div>
  );
}

// --- reviews ----------------------------------------------------------------

function ReviewsPane() {
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setReviews(await listReviews());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clear = async (id: string) => {
    await deleteReview(id);
    await refresh();
  };

  if (error) return <div className={styles.error}>{error}</div>;
  if (reviews.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon name="warning" size={22} color="var(--dex-icon-faint)" />
        <span>
          No open review requests. The analyst flags an answer here when it&apos;s unsure.
        </span>
      </div>
    );
  }
  return (
    <div className={styles.pane}>
      {reviews.map((r) => (
        <div key={r.id} className={styles.rowCard}>
          <Icon name="warning" size={15} color="var(--dex-icon-subtle)" style={{ marginTop: 2 }} />
          <div className={styles.rowMain}>
            <span className={styles.rowText}>{r.question}</span>
            <span className={styles.rowMeta}>{r.reason}</span>
          </div>
          <Pill tone={r.status === 'open' ? 'beta' : 'success'}>{r.status}</Pill>
          <IconButton
            icon="cross"
            size={14}
            color="var(--dex-icon)"
            title="Clear request"
            hover="mid"
            onClick={() => void clear(r.id)}
          />
        </div>
      ))}
    </div>
  );
}
