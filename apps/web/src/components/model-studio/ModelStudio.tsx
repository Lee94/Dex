import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/lib/icons';
import { IconButton, Pill, ConfirmDialog } from '@/components/ui';
import { useT } from '@/i18n';
import { useModelStudio, type SemanticModel } from '@/hooks/useModelStudio';
import { StudioYamlEditor, type YamlEditorHandle } from './StudioYamlEditor';
import { StudioAgentPanel } from './StudioAgentPanel';
import { AddJoinDialog } from './AddJoinDialog';
import styles from './modelStudio.module.css';

/** Pull the cube `name` / base table (`sql`) out of the editor's YAML so the
 *  relation builder knows this cube's alias + table without a full YAML parse. */
function readField(yaml: string, key: 'name' | 'sql'): string {
  return new RegExp(`^${key}:\\s*([A-Za-z_][A-Za-z0-9_]*)`, 'm').exec(yaml)?.[1] ?? '';
}

/**
 * Full-page, VS Code-style semantic-model editor (v3.2). Entered from the Data
 * Models surface (new / edit a model); rendered outside the app Shell. Left: an
 * activity bar + a Files list of the project's model `*.yml`. Center: tabbed
 * Monaco YAML editors. Right: the agent panel. Bottom: a status bar.
 */
export function ModelStudio({
  projectId,
  initialOpen,
  initialNew,
  onBack,
}: {
  projectId: string;
  initialOpen?: string;
  initialNew?: boolean;
  onBack: () => void;
}) {
  const t = useT();
  const s = useModelStudio(projectId, t.modelStudio.untitled);
  const [panelOpen, setPanelOpen] = useState(true);
  const [confirmCloseKey, setConfirmCloseKey] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const editorRef = useRef<YamlEditorHandle>(null);
  const foldedRef = useRef(false);
  const seeded = useRef(false);

  // Seed the initial tab once the project has loaded. Entry routes may target a
  // specific file (?open=) or a brand-new model (?new=); otherwise this opens the
  // first existing model so the studio lands in "edit" mode, never auto-creating.
  useEffect(() => {
    if (seeded.current || s.loading) return;
    seeded.current = true;
    if (initialNew) s.openNew(t.modelStudio.newTemplate);
    else if (initialOpen) s.openModel(initialOpen);
    else if (s.models.length > 0) s.openModel(s.models[0].id);
  }, [s, initialNew, initialOpen, t.modelStudio.newTemplate]);

  const active = s.activeFile;

  const requestClose = (key: string) => {
    const f = s.files.find((x) => x.key === key);
    if (f && f.yaml !== f.savedYaml) setConfirmCloseKey(key);
    else s.closeFile(key);
  };

  const toggleFold = () => {
    if (foldedRef.current) editorRef.current?.unfoldAll();
    else editorRef.current?.foldAll();
    foldedRef.current = !foldedRef.current;
  };

  const ACTIVITY: { icon: IconName; key: string; active?: boolean }[] = [
    { icon: 'folder', key: 'files', active: true },
    { icon: 'sigma', key: 'definitions' },
    { icon: 'archive', key: 'history' },
  ];

  return (
    <div className={styles.root}>
      {/* ---- top bar ---- */}
      <header className={styles.topbar}>
        <button type="button" className={styles.menuBtn} onClick={onBack} title={t.common.back}>
          <Icon name="menu" size={16} color="var(--dex-icon)" />
        </button>
        <span className={styles.logo}>
          <CubeMark />
        </span>
        <nav className={styles.crumbs}>
          <button type="button" className={styles.crumbLink} onClick={onBack}>
            {t.modelStudio.dataRoot}
          </button>
          <span className={styles.crumbSep}>/</span>
          <span className={styles.crumbCurrent}>
            {s.project?.name ?? '…'}
            <Icon name="chevronDown" size={12} color="var(--dex-icon-subtle)" />
          </span>
        </nav>
        <button
          type="button"
          className={styles.publishBtn}
          onClick={() => void s.publishAll()}
          disabled={s.publishing}
        >
          {s.publishing ? t.modelStudio.publishing : t.modelStudio.publish}
        </button>
      </header>

      {/* ---- body: activity bar | files | editor | agent ---- */}
      <div className={styles.body}>
        <nav className={styles.activity}>
          {ACTIVITY.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`${styles.activityBtn} ${a.active ? styles.activityActive : ''}`}
              disabled={!a.active}
              aria-label={a.key}
            >
              <Icon
                name={a.icon}
                size={19}
                color={a.active ? 'var(--dex-text)' : 'var(--dex-icon-faint)'}
              />
            </button>
          ))}
        </nav>

        <aside className={styles.files}>
          <div className={styles.filesHead}>
            <span className={styles.filesTitle}>{t.modelStudio.files}</span>
            <IconButton
              icon="plus"
              size={15}
              color="var(--dex-icon)"
              title={t.modelStudio.newModel}
              onClick={() => s.openNew(t.modelStudio.newTemplate)}
            />
          </div>
          <div className={styles.filesList}>
            {s.loading ? (
              <div className={styles.filesCenter}>
                <div className={styles.spinner} />
              </div>
            ) : s.models.length === 0 ? (
              <div className={styles.filesEmpty}>{t.modelStudio.noFiles}</div>
            ) : (
              s.models.map((m) => (
                <FileRow
                  key={m.id}
                  model={m}
                  activeKey={s.activeKey}
                  onOpen={() => s.openModel(m.id)}
                  onDelete={() => void s.removeModel(m.id)}
                />
              ))
            )}
          </div>
        </aside>

        <main className={styles.editorArea}>
          <div className={styles.tabBar}>
            <div className={styles.tabs}>
              {s.files.map((f) => {
                const dirty = f.yaml !== f.savedYaml;
                return (
                  <div
                    key={f.key}
                    className={`${styles.tab} ${f.key === s.activeKey ? styles.tabActive : ''}`}
                    onClick={() => s.setActiveKey(f.key)}
                  >
                    <span className={styles.tabName}>{f.title}</span>
                    {dirty ? <span className={styles.tabDot} aria-hidden="true" /> : null}
                    <button
                      type="button"
                      className={styles.tabClose}
                      title={t.modelStudio.closeFile}
                      onClick={(e) => {
                        e.stopPropagation();
                        requestClose(f.key);
                      }}
                    >
                      <Icon name="cross" size={11} color="var(--dex-icon)" />
                    </button>
                  </div>
                );
              })}
            </div>
            {active && !active.loading ? (
              <div className={styles.tabBarActions}>
                {!active.builtin && !active.loadError ? (
                  <button
                    type="button"
                    className={styles.foldBtn}
                    onClick={() => setJoinOpen(true)}
                  >
                    <Icon name="link" size={12} color="var(--dex-icon-subtle)" />
                    {t.addJoin.add}
                  </button>
                ) : null}
                <button type="button" className={styles.foldBtn} onClick={toggleFold}>
                  <Icon name="maximize" size={12} color="var(--dex-icon-subtle)" />
                  {t.modelStudio.foldDefinitions}
                </button>
              </div>
            ) : null}
          </div>

          <div className={styles.editorHost}>
            {!active ? (
              <div className={styles.editorEmpty}>
                <Icon name="table" size={28} color="var(--dex-icon-faint)" />
                <div className={styles.editorEmptyText}>{t.modelStudio.selectFile}</div>
              </div>
            ) : active.loading ? (
              <div className={styles.editorEmpty}>
                <div className={styles.spinner} />
              </div>
            ) : active.loadError ? (
              <div className={styles.editorEmpty}>
                <Icon name="warning" size={22} color="var(--dex-danger-fg)" />
                <div className={styles.editorEmptyText}>{t.modelStudio.loadFailed}</div>
              </div>
            ) : (
              <StudioYamlEditor
                key={active.key}
                ref={editorRef}
                value={active.yaml}
                onChange={(v) => s.editYaml(active.key, v)}
                markers={active.markers}
                readOnly={active.builtin}
                onSave={() => void s.saveFile(active.key)}
              />
            )}
          </div>

          {active?.builtin ? (
            <div className={styles.editorNote}>{t.modelStudio.readOnlyBuiltin}</div>
          ) : active?.saveError ? (
            <div className={styles.editorError}>{active.saveError}</div>
          ) : null}
        </main>

        {panelOpen ? (
          <StudioAgentPanel
            onClose={() => setPanelOpen(false)}
            onProposal={(yaml) => s.applyProposal(yaml, t.modelStudio.newTemplate)}
          />
        ) : null}
      </div>

      {/* ---- status bar ---- */}
      <footer className={styles.statusbar}>
        <span className={styles.statusItem}>{t.modelStudio.fileCount(s.models.length)}</span>
        <span className={styles.statusItem}>
          <Icon name="cross" size={11} color="var(--dex-icon-subtle)" />
          {s.errorCount}
        </span>
        <span className={styles.statusItem}>
          <Icon name="warning" size={11} color="var(--dex-icon-subtle)" />0
        </span>
        <span className={styles.statusSpacer} />
        {!panelOpen ? (
          <button type="button" className={styles.statusBtn} onClick={() => setPanelOpen(true)}>
            {t.modelStudio.showPanel}
          </button>
        ) : null}
      </footer>

      {confirmCloseKey ? (
        <ConfirmDialog
          title={t.modelStudio.unsavedTitle}
          message={t.modelStudio.unsavedMessage(
            s.files.find((f) => f.key === confirmCloseKey)?.title ?? '',
          )}
          confirmLabel={t.modelStudio.unsavedConfirm}
          onConfirm={() => {
            s.closeFile(confirmCloseKey);
            setConfirmCloseKey(null);
          }}
          onClose={() => setConfirmCloseKey(null)}
        />
      ) : null}

      {joinOpen && active && s.project ? (
        <AddJoinDialog
          project={s.project}
          self={{
            name: readField(active.yaml, 'name') || active.modelId || '',
            baseTable: readField(active.yaml, 'sql'),
          }}
          onAdd={(join) => s.addJoinToActive(join)}
          onClose={() => setJoinOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** A file row in the Files list — opens the model on click, deletes on hover-trash. */
function FileRow({
  model,
  activeKey,
  onOpen,
  onDelete,
}: {
  model: SemanticModel;
  activeKey: string | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const pending = model.status === 'draft' || model.status === 'draft_pending';
  return (
    <div className={`${styles.fileRow} ${activeKey === model.id ? styles.fileRowActive : ''}`}>
      <button type="button" className={styles.fileRowBtn} onClick={onOpen}>
        <Icon name="notebook" size={14} color="var(--dex-icon-subtle)" />
        <span className={styles.fileName}>{model.name}.yml</span>
        {!model.builtin && pending ? (
          <Pill tone="draft">
            {model.status === 'draft_pending' ? t.modelEditor.draftPending : t.modelEditor.draft}
          </Pill>
        ) : null}
      </button>
      {!model.builtin ? (
        <IconButton
          icon="trash"
          size={12}
          color="var(--dex-icon-subtle)"
          title={t.dataModels.deleteLabel}
          hover="mid"
          className={styles.fileDelete}
          onClick={() => setConfirming(true)}
        />
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={t.dataModels.deleteTitle}
          message={
            <>
              {t.dataModels.deleteBefore}
              <strong>{model.name}</strong>
              {t.dataModels.deleteAfter}
            </>
          }
          confirmLabel={t.dataModels.deleteLabel}
          onConfirm={onDelete}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

/** The purple cube brand mark (matches the Data Browser header). */
function CubeMark() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" aria-hidden="true">
      <path
        d="M12 2 4 6.5v9L12 20l8-4.5v-9zM12 2v18M4 6.5l8 4.5 8-4.5"
        stroke="var(--dex-logo-purple)"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}
