import { config } from '@/config';

/**
 * Data-source module client (v0.6).
 *
 * The catalog/metadata/connection API the agent exposes (see
 * apps/agent/src/mastra/server/routes.ts) is a set of plain REST routes mounted
 * at the server root (NOT under `/api`, where the agent's own routes live).
 * MastraClient only speaks agent-stream + memory, so this module talks to those
 * routes with `fetch` directly — mirroring `lib/threads.ts`: stateless helpers
 * that return data or throw a clean Error; loading/caching belongs to the hook.
 */

const BASE = config.mastraBaseUrl;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

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
export interface SemanticModel {
  id: string;
  name: string;
  description: string | null;
  endorsed: boolean;
  /** False for user-added models (deletable); true / undefined for built-ins. */
  builtin?: boolean;
  /** The base table the model reads from (== id for built-in cubes). */
  baseTable?: string;
  measures: SemanticMeasure[];
  dimensions: SemanticDimension[];
  joins: SemanticJoin[];
  preview?: PreviewResult;
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
}
export interface SemanticProject {
  id: string;
  name: string;
  demo: boolean;
  description: string | null;
  source: { name: string; kind: ConnectorKind };
  modelCount: number;
  models?: SemanticModel[];
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

export function fetchSemanticModel(projectId: string, modelId: string): Promise<SemanticModel> {
  return apiFetch<{ model: SemanticModel }>(
    `/semantic/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`,
  ).then((r) => r.model);
}

export function createSemanticModel(
  projectId: string,
  input: NewModelInput,
): Promise<SemanticModel> {
  return apiFetch<{ model: SemanticModel }>(
    `/semantic/projects/${encodeURIComponent(projectId)}/models`,
    { method: 'POST', body: JSON.stringify(input) },
  ).then((r) => r.model);
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
