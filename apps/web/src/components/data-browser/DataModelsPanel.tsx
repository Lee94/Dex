import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton, Pill, ConfirmDialog } from '@/components/ui';
import { typeColorVar, type SemanticModel } from '@/lib/dataSources';
import type { DataBrowserState } from '@/hooks/useDataBrowser';
import { DataGrid } from './Detail';
import { AddModelDialog } from './AddModelDialog';
import styles from './dataBrowser.module.css';

/** Data Models tab: semantic projects → models → measures/dimensions/joins. */
export function DataModelsPanel({ db }: { db: DataBrowserState }) {
  if (db.modelDetail) return <ModelDetail db={db} />;
  if (db.projectDetail) return <ProjectDetail db={db} />;
  return <ProjectList db={db} />;
}

function ProjectList({ db }: { db: DataBrowserState }) {
  return (
    <div className={styles.detailScroll}>
      <div className={styles.detailHeaderRow}>
        <span className={styles.detailTitle}>Semantic projects</span>
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
            <button
              key={p.id}
              type="button"
              className={styles.dmCard}
              onClick={() => void db.openProject(p.id)}
            >
              <div className={styles.dmCardHead}>
                <Icon name="layers" size={16} color="var(--dex-accent)" />
                <span className={styles.dmCardName}>{p.name}</span>
                {p.demo ? <span className={styles.demoBadge}>DEMO</span> : null}
              </div>
              {p.description ? <div className={styles.dmCardDesc}>{p.description}</div> : null}
              <div className={styles.dmCardMeta}>
                <Icon name="data" size={12} color="var(--dex-icon-faint)" />
                {p.source.name} · {p.modelCount} model{p.modelCount === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ db }: { db: DataBrowserState }) {
  const project = db.projectDetail!;
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className={styles.detailScroll}>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.crumb} onClick={db.backToProjects}>
          All semantic projects
        </button>
        <Icon name="chevronRight" size={11} color="var(--dex-icon-faint)" />
        <span className={styles.crumbCurrent}>{project.name}</span>
      </div>
      <div className={styles.detailHeaderRow}>
        <Icon name="layers" size={18} color="var(--dex-accent)" />
        <span className={styles.detailTitle}>{project.name}</span>
        <Button variant="green" style={{ marginLeft: 'auto' }} onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={13} color="#fff" />
          New model
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

      {addOpen ? <AddModelDialog onClose={() => setAddOpen(false)} onSubmit={db.addModel} /> : null}
    </div>
  );
}

function ModelCard({ model, db }: { model: SemanticModel; db: DataBrowserState }) {
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
          {model.endorsed ? <Pill tone="endorsed">Endorsed</Pill> : null}
        </div>
        {model.description ? <div className={styles.dmCardDesc}>{model.description}</div> : null}
        <div className={styles.dmCardMeta}>
          {model.measures.length} measures · {model.dimensions.length} dimensions
        </div>
      </button>
      {model.builtin ? null : (
        <IconButton
          icon="trash"
          size={13}
          color="var(--dex-icon-subtle)"
          title="Delete model"
          hover="mid"
          className={`${styles.rowDelete} ${styles.dmCardDelete}`}
          onClick={() => setConfirming(true)}
        />
      )}
      {confirming ? (
        <ConfirmDialog
          title="Delete data model"
          message={
            <>
              Delete the model <strong>{model.name}</strong>? This removes the semantic definition;
              the underlying table is not affected.
            </>
          }
          confirmLabel="Delete model"
          onConfirm={() => db.removeModel(model.id)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function ModelDetail({ db }: { db: DataBrowserState }) {
  const project = db.projectDetail;
  const model = db.modelDetail!;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.detailScroll}>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.crumb} onClick={db.backToProjects}>
          All semantic projects
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
        {model.endorsed ? <Pill tone="endorsed">Endorsed</Pill> : null}
        {model.builtin ? null : (
          <Button
            variant="ghost"
            style={{ marginLeft: 'auto' }}
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" size={13} color="var(--dex-danger-fg)" />
            Delete
          </Button>
        )}
      </div>
      {model.description ? <div className={styles.descEditable}>{model.description}</div> : null}

      <div className={styles.segTabs}>
        <button
          type="button"
          className={`${styles.segTab} ${db.dmTab === 'dims' ? styles.segTabActive : ''}`}
          onClick={() => db.setDmTab('dims')}
        >
          Definition
        </button>
        <button
          type="button"
          className={`${styles.segTab} ${db.dmTab === 'preview' ? styles.segTabActive : ''}`}
          onClick={() => db.setDmTab('preview')}
        >
          Preview
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
          <div className={styles.joinsEmpty}>No preview available.</div>
        )
      ) : (
        <div className={styles.modelCols}>
          <div className={styles.modelCol}>
            <div className={styles.modelColTitle}>Measures</div>
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
            <div className={styles.modelColTitle}>Dimensions</div>
            {model.dimensions.length === 0 ? (
              <div className={styles.joinsEmpty}>No dimensions.</div>
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
            <div className={styles.modelColTitle}>Joins</div>
            {model.joins.length === 0 ? (
              <div className={styles.joinsEmpty}>No joins configured.</div>
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
          title="Delete data model"
          message={
            <>
              Delete the model <strong>{model.name}</strong>? This removes the semantic definition;
              the underlying table is not affected.
            </>
          }
          confirmLabel="Delete model"
          onConfirm={() => db.removeModel(model.id)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
