import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/lib/icons';
import { Button, IconButton, Pill, ConfirmDialog } from '@/components/ui';
import {
  typeColorVar,
  type ModelStatus,
  type SemanticModel,
  type SemanticProject,
} from '@/lib/dataSources';
import type { DataBrowserState } from '@/hooks/useDataBrowser';
import { DataGrid } from './Detail';
import { AddProjectDialog } from './AddProjectDialog';
import { useT } from '@/i18n';
import styles from './dataBrowser.module.css';

/** Path to the full-screen model studio for a project, optionally pre-opening a file. */
function studioPath(projectId: string, query: string): string {
  return `/data/models/${encodeURIComponent(projectId)}${query}`;
}

/** Data Models tab: semantic projects → models → measures/dimensions/joins.
 *  Creating / editing a model jumps to the full-page studio (`/data/models/:id`). */
export function DataModelsPanel({ db }: { db: DataBrowserState }) {
  if (db.modelDetail) return <ModelDetail db={db} />;
  if (db.projectDetail) return <ProjectDetail db={db} />;
  return <ProjectList db={db} />;
}

/** Draft / unpublished-changes badge (published models show no badge). */
function StatusBadge({ status, builtin }: { status?: ModelStatus; builtin?: boolean }) {
  const t = useT();
  if (builtin || !status || status === 'published') return null;
  return (
    <Pill tone="draft">
      {status === 'draft_pending' ? t.modelEditor.draftPending : t.modelEditor.draft}
    </Pill>
  );
}

function ProjectList({ db }: { db: DataBrowserState }) {
  const t = useT();
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className={styles.detailScroll}>
      <div className={styles.detailHeaderRow}>
        <span className={styles.detailTitle}>{t.dataModels.semanticProjects}</span>
        <Button variant="green" style={{ marginLeft: 'auto' }} onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={13} color="#fff" />
          {t.dataModels.newProject}
        </Button>
      </div>
      {db.projectsLoading ? (
        <div className={styles.center}>
          <div className={styles.spinner} />
        </div>
      ) : db.projectsError ? (
        <div className={styles.center}>
          <Icon name="warning" size={18} color="var(--dex-danger-fg)" />
          <div className={styles.errorText}>{db.projectsError}</div>
        </div>
      ) : (
        <div className={styles.dmGrid}>
          {db.projects.map((p) => (
            <ProjectCard key={p.id} project={p} db={db} />
          ))}
        </div>
      )}
      {addOpen ? (
        <AddProjectDialog
          sources={db.sources}
          onClose={() => setAddOpen(false)}
          onSubmit={db.createProject}
        />
      ) : null}
    </div>
  );
}

/** A project card in the semantic-projects grid — opens on click, deletes on
 *  hover-trash (the built-in `dex` project can't be deleted). */
function ProjectCard({ project, db }: { project: SemanticProject; db: DataBrowserState }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const isBuiltin = project.id === 'dex';
  return (
    <div className={styles.dmCard}>
      <button
        type="button"
        className={styles.dmCardBtn}
        onClick={() => void db.openProject(project.id)}
      >
        <div className={styles.dmCardHead}>
          <Icon name="layers" size={16} color="var(--dex-accent)" />
          <span className={styles.dmCardName}>{project.name}</span>
          {project.demo ? <span className={styles.demoBadge}>{t.dataModels.demo}</span> : null}
        </div>
        {project.description ? (
          <div className={styles.dmCardDesc}>{project.description}</div>
        ) : null}
        <div className={styles.dmCardMeta}>
          <Icon name="data" size={12} color="var(--dex-icon-faint)" />
          <span className={styles.dmCardMetaText}>
            {project.source.name} · {t.dataModels.modelCount(project.modelCount)}
          </span>
        </div>
      </button>
      {isBuiltin ? null : (
        <IconButton
          icon="trash"
          size={13}
          color="var(--dex-icon-subtle)"
          title={t.dataModels.deleteProjectLabel}
          hover="mid"
          className={`${styles.rowDelete} ${styles.dmCardDelete}`}
          onClick={() => setConfirming(true)}
        />
      )}
      {confirming ? (
        <ConfirmDialog
          title={t.dataModels.deleteProjectTitle}
          message={
            <>
              {t.dataModels.deleteProjectBefore}
              <strong>{project.name}</strong>
              {t.dataModels.deleteProjectAfter}
            </>
          }
          confirmLabel={t.dataModels.deleteProjectLabel}
          onConfirm={() => db.removeProject(project.id)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function ProjectDetail({ db }: { db: DataBrowserState }) {
  const t = useT();
  const navigate = useNavigate();
  const project = db.projectDetail!;

  return (
    <div className={styles.detailScroll}>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.crumb} onClick={db.backToProjects}>
          {t.dataModels.allSemanticProjects}
        </button>
        <Icon name="chevronRight" size={11} color="var(--dex-icon-faint)" />
        <span className={styles.crumbCurrent}>{project.name}</span>
      </div>
      <div className={styles.detailHeaderRow}>
        <Icon name="layers" size={18} color="var(--dex-accent)" />
        <span className={styles.detailTitle}>{project.name}</span>
        <Button
          variant="green"
          style={{ marginLeft: 'auto' }}
          onClick={() => navigate(studioPath(project.id, ''))}
        >
          <Icon name="edit" size={13} color="#fff" />
          {t.dataModels.editModels}
        </Button>
      </div>
      {project.description ? (
        <div className={styles.descEditable}>{project.description}</div>
      ) : null}
      <div className={styles.dmGrid}>
        {(project.models ?? []).map((m) => (
          <ModelCard key={m.id} model={m} db={db} />
        ))}
      </div>
    </div>
  );
}

function ModelCard({ model, db }: { model: SemanticModel; db: DataBrowserState }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.dmCard}>
      <button
        type="button"
        className={styles.dmCardBtn}
        onClick={() => void db.openModel(model.id)}
      >
        <div className={styles.dmCardHead}>
          <Icon name="table" size={15} color="var(--dex-icon)" />
          <span className={styles.dmCardName}>{model.name}</span>
          {model.endorsed ? <Pill tone="endorsed">{t.dataModels.endorsed}</Pill> : null}
          <StatusBadge status={model.status} builtin={model.builtin} />
        </div>
        {model.description ? <div className={styles.dmCardDesc}>{model.description}</div> : null}
        <div className={styles.dmCardMeta}>
          <span className={styles.dmCardMetaText}>
            {t.dataModels.measuresDimensions(model.measures.length, model.dimensions.length)}
          </span>
        </div>
      </button>
      {model.builtin ? null : (
        <IconButton
          icon="trash"
          size={13}
          color="var(--dex-icon-subtle)"
          title={t.dataModels.deleteLabel}
          hover="mid"
          className={`${styles.rowDelete} ${styles.dmCardDelete}`}
          onClick={() => setConfirming(true)}
        />
      )}
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
          onConfirm={() => db.removeModel(model.id)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function ModelDetail({ db }: { db: DataBrowserState }) {
  const t = useT();
  const navigate = useNavigate();
  const project = db.projectDetail;
  const model = db.modelDetail!;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.detailScroll}>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.crumb} onClick={db.backToProjects}>
          {t.dataModels.allSemanticProjects}
        </button>
        <Icon name="chevronRight" size={11} color="var(--dex-icon-faint)" />
        <button type="button" className={styles.crumb} onClick={db.backToModels}>
          {project?.name}
        </button>
        <Icon name="chevronRight" size={11} color="var(--dex-icon-faint)" />
        <span className={styles.crumbCurrent}>{model.name}</span>
      </div>

      <div className={styles.detailHeaderRow}>
        <Icon name="table" size={18} color="var(--dex-icon)" />
        <span className={styles.detailTitle}>{model.name}</span>
        {model.endorsed ? <Pill tone="endorsed">{t.dataModels.endorsed}</Pill> : null}
        <StatusBadge status={model.status} builtin={model.builtin} />
        {model.builtin ? null : (
          <div className={styles.headerActions}>
            <Button
              variant="ghost"
              onClick={() =>
                navigate(studioPath(project?.id ?? 'dex', `?open=${encodeURIComponent(model.id)}`))
              }
            >
              <Icon name="edit" size={13} color="var(--dex-icon)" />
              {t.dataModels.edit}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={13} color="var(--dex-danger-fg)" />
              {t.dataModels.delete}
            </Button>
          </div>
        )}
      </div>
      {model.description ? <div className={styles.descEditable}>{model.description}</div> : null}

      <div className={styles.segTabs}>
        <button
          type="button"
          className={`${styles.segTab} ${db.dmTab === 'dims' ? styles.segTabActive : ''}`}
          onClick={() => db.setDmTab('dims')}
        >
          {t.dataModels.definition}
        </button>
        <button
          type="button"
          className={`${styles.segTab} ${db.dmTab === 'preview' ? styles.segTabActive : ''}`}
          onClick={() => db.setDmTab('preview')}
        >
          {t.dataModels.preview}
        </button>
      </div>

      {db.modelLoading ? (
        <div className={styles.center}>
          <div className={styles.spinner} />
        </div>
      ) : db.dmTab === 'preview' ? (
        model.preview ? (
          <DataGrid columns={model.preview.columns} rows={model.preview.rows} />
        ) : (
          <div className={styles.joinsEmpty}>{t.dataModels.noPreview}</div>
        )
      ) : (
        <div className={styles.modelCols}>
          <div className={styles.modelCol}>
            <div className={styles.modelColTitle}>{t.dataModels.measures}</div>
            {model.measures.map((m) => (
              <div key={m.code} className={styles.memberRow}>
                <Icon name="sigma" size={14} color="var(--dex-accent)" />
                <span className={styles.memberName}>{m.name}</span>
                {m.endorsed ? (
                  <Icon name="tickCircle" size={12} color="var(--dex-success-check)" />
                ) : null}
                <span className={styles.codeBadge}>{m.code}</span>
              </div>
            ))}
          </div>
          <div className={styles.modelCol}>
            <div className={styles.modelColTitle}>{t.dataModels.dimensions}</div>
            {model.dimensions.length === 0 ? (
              <div className={styles.joinsEmpty}>{t.dataModels.noDimensions}</div>
            ) : (
              model.dimensions.map((d) => (
                <div key={d.name} className={styles.memberRow}>
                  <span className={styles.typeDot} style={{ background: typeColorVar(d.type) }} />
                  <span className={styles.memberName}>{d.name}</span>
                  <span className={styles.codeBadge}>{d.type}</span>
                </div>
              ))
            )}
          </div>
          <div className={styles.modelCol}>
            <div className={styles.modelColTitle}>{t.dataModels.joins}</div>
            {model.joins.length === 0 ? (
              <div className={styles.joinsEmpty}>{t.dataModels.noJoins}</div>
            ) : (
              model.joins.map((j) => (
                <div key={j.to} className={styles.memberRow}>
                  <Icon name="link" size={13} color="var(--dex-icon)" />
                  <span className={styles.memberName}>{j.to}</span>
                  {j.relationship ? (
                    <span className={styles.codeBadge}>{j.relationship}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      )}

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
          onConfirm={() => db.removeModel(model.id)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
