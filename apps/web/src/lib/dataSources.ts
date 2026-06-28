import { apiFetch } from '@/lib/apiClient';

/**
 * Data-source module client (v0.6).
 *
 * The catalog/metadata/connection API the agent exposes (see
 * apps/agent/src/mastra/server/routes.ts) is a set of plain REST routes mounted
 * at the server root (NOT under `/api`, where the agent's own routes live).
 * MastraClient only speaks agent-stream + memory, so this module talks to those
 * routes via the shared `apiFetch` (lib/apiClient.ts) — mirroring
 * `lib/threads.ts`: stateless helpers that return data or throw a clean Error;
 * loading/caching belongs to the hook.
 */

// --- types (mirror the backend route payloads) ------------------------------

export type ConnectorKind = 'sqlite' | 'postgres';

export interface DataSource {
  id: string;
  name: string;
  type: ConnectorKind;
  dialect: ConnectorKind;
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  user?: string;
  target: string;
  isBuiltin: boolean;
  isAgentSource: boolean;
  createdAt: number;
}

export interface TableNode {
  id: string;
  name: string;
  rowCount: number;
  endorsed: boolean;
  description: string | null;
}

export interface SchemaNode {
  id: string;
  name: string;
  system: boolean;
  endorsed: boolean;
  tables: TableNode[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  primaryKey: boolean;
  description: string | null;
  status: string | null;
  includedForAi: boolean;
}

export interface Metadata {
  description: string | null;
  status: string | null;
  categories: string[];
  includedForAi: boolean;
}

export interface TableDetail {
  table: string;
  columns: ColumnInfo[];
  metadata: Metadata;
}

export interface PreviewResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface SemanticMeasure {
  code: string;
  name: string;
  endorsed: boolean;
}
export interface SemanticDimension {
  name: string;
  type: string;
}
export interface SemanticJoin {
  to: string;
  relationship?: string;
}
/** A cube.js-style relation as authored (matches the agent's `Join`). */
export interface CubeJoinDef {
  to: string;
  relationship: string;
  sql: string;
}
/** Versioned-draft status (v3.1). `draft_pending` = published + an unpublished edit. */
export type ModelStatus = 'draft' | 'published' | 'draft_pending';

/** Raw cube definition the editor seeds its GUI/YAML tabs from (the
 *  draft??published view; null for built-ins served read-only via `yaml`). */
export interface CubeMeasureDef {
  name: string;
  title?: string;
  description?: string;
  type: string; // count | sum | avg | count_distinct | min | max | ratio
  sql?: string;
  format?: string;
}
export interface CubeDimensionDef {
  name: string;
  title?: string;
  description?: string;
  type: DimensionKind;
  sql: string;
}
export interface CubeDef {
  name: string;
  title?: string;
  description?: string;
  sql: string;
  measures: CubeMeasureDef[];
  dimensions: CubeDimensionDef[];
  joins?: CubeJoinDef[];
}

export interface SemanticModel {
  id: string;
  name: string;
  description: string | null;
  endorsed: boolean;
  /** False for user-added models (deletable); true / undefined for built-ins. */
  builtin?: boolean;
  /** Versioned-draft status; absent for built-ins (treated as published). */
  status?: ModelStatus;
  /** The base table the model reads from (== id for built-in cubes). */
  baseTable?: string;
  measures: SemanticMeasure[];
  dimensions: SemanticDimension[];
  joins: SemanticJoin[];
  preview?: PreviewResult;
  /** Raw cube definition + its YAML (only on the single-model GET, for the editor). */
  cube?: CubeDef | null;
  yaml?: string | null;
}

export type MeasureKind = 'count' | 'sum' | 'avg' | 'count_distinct' | 'min' | 'max';
export type DimensionKind = 'categorical' | 'temporal' | 'numeric';

export interface NewModelInput {
  name: string;
  title?: string;
  description?: string;
  table: string;
  measures: { name: string; title?: string; type: MeasureKind; column?: string }[];
  dimensions: { name: string; column: string; type: DimensionKind }[];
  joins?: CubeJoinDef[];
}

/** Create payload: a GUI form or a raw YAML cube; `publish` skips the draft. */
export type CreateModelInput =
  | ({ source?: 'gui'; publish?: boolean } & NewModelInput)
  | { source: 'yaml'; yaml: string; baseTable?: string; publish?: boolean };

/** Patch payload: a definition edit (GUI or YAML) and/or a lifecycle action. */
export interface UpdateModelPatch {
  source?: 'gui' | 'yaml';
  yaml?: string;
  name?: string;
  title?: string;
  description?: string;
  table?: string;
  measures?: NewModelInput['measures'];
  dimensions?: NewModelInput['dimensions'];
  joins?: CubeJoinDef[];
  action?: 'save' | 'publish' | 'discard';
}
export interface SemanticProject {
  id: string;
  name: string;
  demo: boolean;
  description: string | null;
  /** The bound data connection's id (`builtin` for the `dex` project) — used to
   *  fetch base-table columns when authoring joins. */
  sourceId: string;
  source: { name: string; kind: ConnectorKind };
  modelCount: number;
  models?: SemanticModel[];
}

/** Create payload for a new semantic project (bound to a data connection). */
export interface NewProjectInput {
  name: string;
  description?: string;
  sourceId: string;
}

export interface NewConnectionInput {
  name: string;
  type: ConnectorKind;
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  ssl?: boolean;
  filePath?: string;
}

export interface MetadataPatch {
  table: string;
  column?: string;
  description?: string | null;
  status?: string | null;
  categories?: string[];
  includedForAi?: boolean;
}

// --- fetch functions --------------------------------------------------------

export function listDataSources(): Promise<DataSource[]> {
  return apiFetch<{ datasources: DataSource[] }>('/datasources').then((r) => r.datasources);
}

export function addDataSource(input: NewConnectionInput): Promise<DataSource> {
  return apiFetch<DataSource>('/datasources', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteDataSource(id: string): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/datasources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then(() => undefined);
}

export function fetchSchemaTree(connId: string): Promise<SchemaNode[]> {
  return apiFetch<{ schemas: SchemaNode[] }>(
    `/datasources/${encodeURIComponent(connId)}/tree`,
  ).then((r) => r.schemas);
}

export function refreshMetadata(connId: string): Promise<SchemaNode[]> {
  return apiFetch<{ schemas: SchemaNode[] }>(`/datasources/${encodeURIComponent(connId)}/refresh`, {
    method: 'POST',
  }).then((r) => r.schemas);
}

export function fetchTableDetail(connId: string, table: string): Promise<TableDetail> {
  return apiFetch<TableDetail>(
    `/datasources/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}`,
  );
}

export function fetchPreview(connId: string, table: string, limit = 50): Promise<PreviewResult> {
  return apiFetch<PreviewResult>(
    `/datasources/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/preview?limit=${limit}`,
  );
}

export function updateMetadata(connId: string, patch: MetadataPatch): Promise<Metadata> {
  return apiFetch<{ metadata: Metadata }>(`/datasources/${encodeURIComponent(connId)}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then((r) => r.metadata);
}

export function listSemanticProjects(): Promise<SemanticProject[]> {
  return apiFetch<{ projects: SemanticProject[] }>('/semantic/projects').then((r) => r.projects);
}

export function fetchSemanticProject(projectId: string): Promise<SemanticProject> {
  return apiFetch<{ project: SemanticProject }>(
    `/semantic/projects/${encodeURIComponent(projectId)}`,
  ).then((r) => r.project);
}

export function createSemanticProject(input: NewProjectInput): Promise<SemanticProject> {
  return apiFetch<{ project: SemanticProject }>('/semantic/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.project);
}

export function deleteSemanticProject(projectId: string): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/semantic/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  }).then(() => undefined);
}

export function fetchSemanticModel(projectId: string, modelId: string): Promise<SemanticModel> {
  return apiFetch<{ model: SemanticModel }>(
    `/semantic/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`,
  ).then((r) => r.model);
}

export function createSemanticModel(
  projectId: string,
  input: CreateModelInput,
): Promise<SemanticModel> {
  return apiFetch<{ model: SemanticModel }>(
    `/semantic/projects/${encodeURIComponent(projectId)}/models`,
    { method: 'POST', body: JSON.stringify(input) },
  ).then((r) => r.model);
}

/** Edit a model's draft and/or run a lifecycle action (save / publish / discard).
 *  Returns the updated model, or null when a never-published draft is discarded. */
export function updateSemanticModel(
  projectId: string,
  modelId: string,
  patch: UpdateModelPatch,
): Promise<SemanticModel | null> {
  return apiFetch<{ model: SemanticModel | null }>(
    `/semantic/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  ).then((r) => r.model);
}

export function publishSemanticModel(
  projectId: string,
  modelId: string,
  patch: Omit<UpdateModelPatch, 'action'> = {},
): Promise<SemanticModel | null> {
  return updateSemanticModel(projectId, modelId, { ...patch, action: 'publish' });
}

export function discardModelDraft(
  projectId: string,
  modelId: string,
): Promise<SemanticModel | null> {
  return updateSemanticModel(projectId, modelId, { action: 'discard' });
}

export function deleteSemanticModel(projectId: string, modelId: string): Promise<void> {
  return apiFetch<{ ok: boolean }>(
    `/semantic/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`,
    { method: 'DELETE' },
  ).then(() => undefined);
}

// --- pure display helpers ---------------------------------------------------

/** Map a SQL column/dimension type to a type-dot CSS variable. */
export function typeColorVar(type: string): string {
  const t = type.toLowerCase();
  if (/(int|real|numeric|decimal|double|float|serial|money)/.test(t))
    return 'var(--dex-type-number)';
  if (/bool/.test(t)) return 'var(--dex-type-bool)';
  if (/(date|time|timestamp)/.test(t)) return 'var(--dex-type-date)';
  return 'var(--dex-type-text)';
}

/** Short label for a column type chip (e.g. "character varying" → "varchar"). */
export function shortType(type: string): string {
  return type
    .toLowerCase()
    .replace('character varying', 'varchar')
    .replace('timestamp without time zone', 'timestamp');
}

/** Render a cell value for the preview/data grid. */
export function fmtCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Compact integer formatting for row counts ("1,234"). */
export function fmtCount(n: number): string {
  return n.toLocaleString();
}

/** The brand color var for a connector kind. */
export function kindColorVar(kind: ConnectorKind): string {
  return kind === 'postgres' ? 'var(--dex-conn-pg)' : 'var(--dex-conn-sf)';
}
