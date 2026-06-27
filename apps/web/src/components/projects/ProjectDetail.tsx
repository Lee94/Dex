import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, ConfirmDialog } from '@/components/ui';
import { ContextPicker } from '@/components/ContextPicker';
import { relativeTime } from '@/lib/threads';
import { useT } from '@/i18n';
import type { Project, ProjectPatch } from '@/lib/projects';
import type { Attachment } from '@/lib/attachments';
import type { Thread } from '@/types';
import styles from './project.module.css';

function chipIcon(kind: Attachment['kind']): string {
  if (kind === 'model') return 'layers';
  if (kind === 'table') return 'table';
  if (kind === 'file') return 'projects';
  return 'data';
}

/**
 * Project detail/editor. Edits the name, description, and shared context
 * (project-level instructions + bound data sources every thread inherits), lists
 * the project's threads, and can start a new thread inside the project or delete it.
 * Text edits save on blur; attachment edits save immediately (optimistic upstream).
 */
export function ProjectDetail({
  project,
  threads,
  onBack,
  onChange,
  onDelete,
  onOpenThread,
  onNewThread,
}: {
  project: Project;
  threads: Thread[];
  onBack: () => void;
  onChange: (patch: ProjectPatch) => void;
  onDelete: () => void | Promise<void>;
  onOpenThread: (id: string) => void;
  onNewThread: () => void;
}) {
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedKeys = new Set(project.attachments.map((a) => a.key));
  const toggleAttachment = (a: Attachment) => {
    const exists = project.attachments.some((x) => x.key === a.key);
    const next = exists
      ? project.attachments.filter((x) => x.key !== a.key)
      : [...project.attachments, a];
    onChange({ attachments: next });
  };
  const removeAttachment = (key: string) =>
    onChange({ attachments: project.attachments.filter((a) => a.key !== key) });

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.backRow}>
          <Button variant="ghost" onClick={onBack}>
            <Icon name="chevronLeft" size={14} color="var(--dex-icon)" />
            {t.projects.back}
          </Button>
        </div>

        {/* name + description */}
        <div className={styles.section}>
          <div className={styles.cardTop}>
            <Icon name="projects" size={18} color="var(--dex-accent)" />
            <input
              className={styles.nameInput}
              defaultValue={project.name}
              placeholder={t.projects.namePh}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== project.name) onChange({ name: v });
              }}
            />
          </div>
          <label className={styles.label}>{t.projects.description}</label>
          <textarea
            className={styles.textarea}
            rows={2}
            defaultValue={project.description}
            placeholder={t.projects.descriptionPh}
            onBlur={(e) => {
              if (e.target.value !== project.description) onChange({ description: e.target.value });
            }}
          />
        </div>

        {/* shared context */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{t.projects.sharedContext}</div>
          <label className={styles.label}>{t.projects.instructions}</label>
          <textarea
            className={styles.textarea}
            rows={4}
            defaultValue={project.instructions}
            placeholder={t.projects.instructionsPh}
            onBlur={(e) => {
              if (e.target.value !== project.instructions)
                onChange({ instructions: e.target.value });
            }}
          />
          <div className={styles.hint}>{t.projects.inheritHint}</div>

          <label className={styles.label}>{t.projects.dataSources}</label>
          {project.attachments.length > 0 ? (
            <div className={styles.chips}>
              {project.attachments.map((a) => (
                <span key={a.key} className={styles.chip}>
                  <Icon name={chipIcon(a.kind)} size={12} color="var(--dex-accent)" />
                  {a.label}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    title={t.common.remove}
                    onClick={() => removeAttachment(a.key)}
                  >
                    <Icon name="cross" size={10} color="var(--dex-icon-subtle)" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className={styles.chips}>
              <span className={styles.empty}>{t.projects.noDataSources}</span>
            </div>
          )}
          <div className={styles.addWrap}>
            <Button variant="ghost" onClick={() => setPickerOpen((o) => !o)}>
              <Icon name="plus" size={13} color="var(--dex-icon)" />
              {t.projects.addData}
            </Button>
            {pickerOpen ? (
              <ContextPicker
                selected={selectedKeys}
                onToggle={toggleAttachment}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}
          </div>
        </div>

        {/* threads */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            {t.projects.threads}
            <span className={styles.sectionSpacer} />
            <Button variant="ghost" onClick={onNewThread}>
              <Icon name="plus" size={13} color="var(--dex-icon)" />
              {t.projects.newThread}
            </Button>
          </div>
          {threads.length === 0 ? (
            <div className={styles.empty}>{t.projects.noThreads}</div>
          ) : (
            threads.map((thr) => (
              <button
                key={thr.id}
                className={styles.threadRow}
                onClick={() => onOpenThread(thr.id)}
              >
                <Icon name="threads" size={14} color="var(--dex-icon-subtle)" />
                <span className={styles.threadName}>{thr.title}</span>
                {thr.updatedAt ? (
                  <span className={styles.threadTime}>{relativeTime(thr.updatedAt)}</span>
                ) : null}
              </button>
            ))
          )}
        </div>

        {/* danger zone */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{t.projects.dangerZone}</div>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={13} color="currentColor" />
            {t.projects.deleteProject}
          </Button>
          <div className={styles.hint}>{t.projects.deleteHint}</div>
        </div>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title={t.projects.deleteConfirmTitle}
          message={t.projects.deleteConfirmMessage(project.name)}
          confirmLabel={t.projects.deleteProject}
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}
