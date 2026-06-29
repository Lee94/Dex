import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import { ResultCard } from '@/components/ResultCard';
import { useThreadsContext } from '@/contexts/ThreadsContext';
import {
  deletePin,
  listPins,
  reorderPins,
  reportToMarkdown,
  type ChartPinPayload,
  type Pin,
} from '@/lib/reports';
import type { SqlResult } from '@/types';
import { useT } from '@/i18n';
import styles from './ReportRoute.module.css';

const ThreadChart = lazy(() => import('@/components/thread/ThreadChart'));

const safeName = (s: string) =>
  (s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';

function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read-only report at `/reports/:threadId` (v3.4) — the ordered set of a thread's
 * pinned results/charts, rendered full-screen (outside the Shell). Doubles as the
 * thread's Share target: copy the link, export to Markdown, reorder/remove pins.
 */
export function ReportRoute() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { threads } = useThreadsContext();

  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const title = threads.find((th) => th.id === threadId)?.title || t.report.title;

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    setError(null);
    try {
      setPins(await listPins(threadId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!threadId) return;
    setPins((prev) => prev.filter((p) => p.id !== id));
    await deletePin(threadId, id).catch((e) => console.error(e));
  };

  const move = async (id: string, dir: -1 | 1) => {
    if (!threadId) return;
    const idx = pins.findIndex((p) => p.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= pins.length) return;
    const reordered = [...pins];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    setPins(reordered);
    await reorderPins(
      threadId,
      reordered.map((p) => p.id),
    ).catch((e) => console.error(e));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const exportMd = () =>
    downloadFile(reportToMarkdown(title, pins), `${safeName(title)}.md`, 'text/markdown;charset=utf-8');

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <IconButton
          icon="chevronLeft"
          size={17}
          color="var(--dex-text-strong)"
          title={t.report.backToThread}
          onClick={() => navigate(threadId ? `/threads/${threadId}` : '/threads')}
          hover="strong"
        />
        <div className={styles.titleWrap}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>
            {t.report.readOnly} · {t.report.pinCount(pins.length)}
          </span>
        </div>
        <span className={styles.spacer} />
        <Button variant="ghost" onClick={() => void copyLink()}>
          <Icon name="link" size={14} color="var(--dex-icon)" />
          {linkCopied ? t.report.linkCopied : t.report.copyLink}
        </Button>
        <Button variant="ghost" onClick={exportMd} disabled={pins.length === 0}>
          <Icon name="archive" size={14} color="var(--dex-icon)" />
          {t.report.exportMarkdown}
        </Button>
      </div>

      <div className={styles.scroll}>
        <div className={styles.page}>
          {loading ? (
            <div className={styles.state}>{t.report.loading}</div>
          ) : error ? (
            <div className={styles.state}>
              <div>{t.report.loadFailed}</div>
              <div className={styles.stateSub}>{error}</div>
              <Button variant="ghost" onClick={() => void load()} style={{ marginTop: 6 }}>
                {t.common.retry}
              </Button>
            </div>
          ) : pins.length === 0 ? (
            <div className={styles.state}>{t.report.empty}</div>
          ) : (
            pins.map((pin, i) => (
              <div key={pin.id} className={styles.pin}>
                <div className={styles.pinBar}>
                  <span className={styles.pinTitle}>{pin.title}</span>
                  <span className={styles.spacer} />
                  <IconButton
                    icon="chevronUp"
                    size={13}
                    title={t.report.moveUp}
                    hover="mid"
                    disabled={i === 0}
                    onClick={() => void move(pin.id, -1)}
                  />
                  <IconButton
                    icon="chevronDown"
                    size={13}
                    title={t.report.moveDown}
                    hover="mid"
                    disabled={i === pins.length - 1}
                    onClick={() => void move(pin.id, 1)}
                  />
                  <IconButton
                    icon="trash"
                    size={13}
                    title={t.report.removePin}
                    hover="mid"
                    onClick={() => void remove(pin.id)}
                  />
                </div>
                {pin.kind === 'table' ? (
                  <ResultCard
                    result={pin.payload}
                    sql={typeof pin.payload.sql === 'string' ? pin.payload.sql : undefined}
                    endorsed={pin.payload.endorsed === true}
                    title={pin.title}
                  />
                ) : (
                  <Suspense fallback={<div className={styles.state}>{t.thread.loadingChart}</div>}>
                    <ThreadChart
                      dsl={(pin.payload as ChartPinPayload).dsl}
                      source={(pin.payload as ChartPinPayload).source as SqlResult | undefined}
                      label={(pin.payload as ChartPinPayload).label}
                    />
                  </Suspense>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
