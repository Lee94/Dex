import { registerApiRoute } from '@mastra/core/server';
import { IDENTIFIER } from '../db/guard';
import {
  getConnectorById,
  closeConnectorById,
  createConnectorFromConfig,
  getBuiltinDataSource,
  getActiveProvider,
} from '../db/connector';
import {
  loadAllConfigs,
  loadConfig,
  saveConfig,
  deleteConfig,
  toPublicDataSource,
  type DataSourceType,
  type NewDataSourceInput,
} from '../db/datasources';
import {
  getTableMetadata,
  getColumnMetadataMap,
  getAllTableMetadata,
  upsertTableMetadata,
  upsertColumnMetadata,
  type MetadataPatch,
} from '../db/metadata';
import {
  describeModelSummary,
  model,
  listStoredModels,
  getStoredModelByName,
  createModel,
  saveDraft,
  publishModel,
  discardDraft,
  deleteModel,
  statusOf,
  parseCubeYaml,
  cubeToYaml,
  assertColumnsExist,
} from '../db/semantic';
import type {
  Cube,
  CubeYamlError,
  Dimension,
  DimensionType,
  Measure,
  MeasureType,
  ModelStatus,
} from '../db/semantic';
import { fail } from './http';

/**
 * Data-source module HTTP API (v0.6).
 *
 * Read-only catalog browsing + metadata curation + connection management, all
 * served off Mastra's own server (`apiRoutes` in `index.ts`). These routes are
 * independent of the agent: they never touch the agent's instructions or its
 * env-fixed active dialect, so browsing extra sources at runtime is safe.
 *
 * Every SQL path goes through a `Connector` (whose `runReadOnlySql` runs
 * `assertReadOnly` + Postgres read-only transaction/timeout/row caps); table
 * names are validated against `IDENTIFIER` before any interpolation.
 */

const PREVIEW_DEFAULT = 50;
const PREVIEW_MAX = 200;

/** The single schema "bucket" a connector exposes (it is scoped to one schema). */
function schemaLabel(dialect: 'sqlite' | 'postgres', schema?: string): string {
  if (schema) return schema;
  return dialect === 'postgres' ? 'public' : 'main';
}

// --- semantic projection ----------------------------------------------------

/** Project one cube (built-in or a user model's current view) to the shape the
 *  Data Models UI consumes. */
function projectCube(
  cube: ReturnType<typeof describeModelSummary>['cubes'][number],
  opts: { builtin: boolean; status: ModelStatus; baseTable: string },
) {
  return {
    id: cube.name,
    name: cube.title,
    description: cube.description ?? null,
    endorsed: cube.endorsed,
    builtin: opts.builtin,
    status: opts.status,
    baseTable: opts.baseTable,
    measures: cube.measures.map((m) => ({ code: m.ref, name: m.title, endorsed: m.endorsed })),
    dimensions: cube.dimensions.map((d) => ({ name: d.title, type: d.type })),
    joins: cube.joins,
  };
}

async function semanticProjects() {
  const builtin = getBuiltinDataSource();
  // Built-in cubes are always published + endorsed.
  const builtinSummary = describeModelSummary(model);
  const builtinModels = builtinSummary.cubes.map((cube) =>
    projectCube(cube, { builtin: true, status: 'published', baseTable: cube.name }),
  );
  // User models — projected from the draft??published view, carrying their status
  // (so the UI can show drafts that the agent can't yet see).
  const stored = await listStoredModels();
  const userModels = stored.map((m) => {
    const view = (m.draft ?? m.published)!; // at least one is non-null (rowToStored guarantees it)
    const [summary] = describeModelSummary({ cubes: [view], metrics: [] }).cubes;
    return projectCube(summary, { builtin: false, status: statusOf(m), baseTable: m.baseTable });
  });
  const models = [...builtinModels, ...userModels];
  const project = {
    id: 'dex',
    name: 'Dex semantic model',
    demo: false,
    description: 'Governed metrics, cubes, measures and dimensions (v0.4 semantic layer).',
    source: { name: builtin.name, kind: builtin.dialect },
    modelCount: models.length,
    metrics: builtinSummary.metrics,
    models,
  };
  return { project };
}

/** Throw if `name` collides with a built-in cube or any stored model
 *  (drafts included). `exceptName` skips the model being renamed. */
async function assertNameAvailable(name: string, exceptName?: string): Promise<void> {
  if (model.cubes.some((c) => c.name === name)) {
    throw new Error(`A model named "${name}" already exists`);
  }
  const stored = await listStoredModels();
  if (stored.some((m) => m.name === name && m.name !== exceptName)) {
    throw new Error(`A model named "${name}" already exists`);
  }
}

// --- user-defined model construction ----------------------------------------

interface NewModelInput {
  name?: string;
  title?: string;
  description?: string;
  table?: string;
  dimensions?: { name?: string; column?: string; type?: DimensionType }[];
  measures?: { name?: string; title?: string; type?: MeasureType; column?: string }[];
}

const MEASURE_TYPES: MeasureType[] = ['count', 'sum', 'avg', 'count_distinct', 'min', 'max'];
const DIMENSION_TYPES: DimensionType[] = ['categorical', 'temporal', 'numeric'];

function measureFormat(type: MeasureType): 'number' | 'integer' {
  return type === 'count' || type === 'count_distinct' ? 'integer' : 'number';
}

/**
 * Turn the dialog payload into a validated `Cube`. Throws a human-readable error
 * on any problem (bad identifier, unknown column, missing measure). The cube is
 * standalone (no joins) and always un-endorsed.
 */
function buildUserCube(input: NewModelInput, columnNames: Set<string>): { cube: Cube } {
  const name = input.name?.trim() ?? '';
  if (!IDENTIFIER.test(name)) {
    throw new Error('Model name must be an identifier (letters, digits, underscore).');
  }
  const table = input.table?.trim() ?? '';
  if (!IDENTIFIER.test(table)) throw new Error('A valid base table is required.');

  const measures: Measure[] = [];
  for (const m of input.measures ?? []) {
    const mName = m.name?.trim() ?? '';
    if (!IDENTIFIER.test(mName))
      throw new Error(`Measure name "${m.name}" is not a valid identifier.`);
    const type = m.type ?? 'count';
    if (!MEASURE_TYPES.includes(type)) throw new Error(`Unknown measure type "${m.type}".`);
    let sql: string | undefined;
    if (type !== 'count') {
      const col = m.column?.trim() ?? '';
      if (!IDENTIFIER.test(col)) throw new Error(`Measure "${mName}" (${type}) needs a column.`);
      if (!columnNames.has(col)) throw new Error(`Column "${col}" does not exist in ${table}.`);
      sql = `${name}.${col}`;
    } else if (m.column?.trim()) {
      const col = m.column.trim();
      if (!columnNames.has(col)) throw new Error(`Column "${col}" does not exist in ${table}.`);
      sql = `${name}.${col}`;
    }
    measures.push({
      name: mName,
      title: m.title?.trim() || mName,
      type,
      sql,
      format: measureFormat(type),
      endorsed: false,
    });
  }
  if (measures.length === 0) throw new Error('Add at least one measure.');

  const dimensions: Dimension[] = [];
  for (const d of input.dimensions ?? []) {
    const dName = d.name?.trim() ?? '';
    if (!IDENTIFIER.test(dName))
      throw new Error(`Dimension name "${d.name}" is not a valid identifier.`);
    const col = d.column?.trim() ?? '';
    if (!IDENTIFIER.test(col)) throw new Error(`Dimension "${dName}" needs a column.`);
    if (!columnNames.has(col)) throw new Error(`Column "${col}" does not exist in ${table}.`);
    const type = d.type ?? 'categorical';
    if (!DIMENSION_TYPES.includes(type)) throw new Error(`Unknown dimension type "${d.type}".`);
    dimensions.push({ name: dName, title: dName, type, sql: `${name}.${col}` });
  }

  const cube: Cube = {
    name,
    title: input.title?.trim() || name,
    description: input.description?.trim() || undefined,
    sql: table,
    endorsed: false,
    measures,
    dimensions,
    joins: [],
  };
  return { cube };
}

/** Body for create/patch — a GUI payload or (v3.1) a raw YAML cube. */
type ModelBody = NewModelInput & { source?: 'gui' | 'yaml'; yaml?: string };

/** Carries structured YAML parse errors (with line/col) so the client can place
 *  Monaco markers, not just show a flat message. */
class ModelYamlError extends Error {
  constructor(public yamlErrors: CubeYamlError[]) {
    super(yamlErrors.map((e) => e.message).join('\n') || 'Invalid model YAML.');
    this.name = 'ModelYamlError';
  }
}

/** True if the body carries a model definition (vs. a status-only patch). */
function hasBodyDefinition(body: ModelBody): boolean {
  return Array.isArray(body.measures) || (body.source === 'yaml' && typeof body.yaml === 'string');
}

/**
 * Resolve a validated `Cube` from a create/patch body, GUI or YAML. Both paths
 * verify the base table exists in the built-in warehouse and that referenced
 * columns are real; throws a human-readable error (or `ModelYamlError`) otherwise.
 */
async function resolveCubeFromBody(
  body: ModelBody,
  fallbackTable?: string,
): Promise<{ cube: Cube }> {
  if (body.source === 'yaml') {
    const { cube, errors } = parseCubeYaml(body.yaml ?? '');
    if (errors.length > 0 || !cube) throw new ModelYamlError(errors);
    const connector = await getConnectorById('builtin');
    const desc = await connector.describeTable(cube.sql); // base table must exist
    assertColumnsExist(cube, new Set(desc.columns.map((col) => col.name)));
    return { cube };
  }
  const table = body.table?.trim() || fallbackTable || '';
  if (!IDENTIFIER.test(table)) throw new Error('A valid base table is required');
  const connector = await getConnectorById('builtin');
  const desc = await connector.describeTable(table);
  const columnNames = new Set(desc.columns.map((col) => col.name));
  return buildUserCube({ ...body, table }, columnNames);
}

/** Map an error from the create/patch flow to a JSON response body + status,
 *  preserving structured YAML errors. */
function modelErrorResponse(err: unknown): { body: Record<string, unknown>; status: 400 | 409 } {
  if (err instanceof ModelYamlError) {
    return { body: { error: err.message, status: 400, yamlErrors: err.yamlErrors }, status: 400 };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const status: 400 | 409 = /already exists/.test(msg) ? 409 : 400;
  return { body: { error: msg, status }, status };
}

// ---------------------------------------------------------------------------

export const dataSourceRoutes = [
  // --- list / create / delete sources ---------------------------------------
  registerApiRoute('/datasources', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const stored = await loadAllConfigs();
      const datasources = [getBuiltinDataSource(), ...stored.map(toPublicDataSource)];
      return c.json({ datasources });
    },
  }),

  registerApiRoute('/datasources', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Partial<NewDataSourceInput>;
      const type = body.type;
      if (type !== 'sqlite' && type !== 'postgres') {
        const f = fail('type must be "sqlite" or "postgres"');
        return c.json(f, 400);
      }
      if (!body.name?.trim()) {
        const f = fail('name is required');
        return c.json(f, 400);
      }
      if (type === 'sqlite' && !body.filePath?.trim()) {
        const f = fail('filePath is required for a sqlite source');
        return c.json(f, 400);
      }
      if (type === 'postgres' && !body.connectionString?.trim() && !body.host?.trim()) {
        const f = fail('a connectionString or host is required for a postgres source');
        return c.json(f, 400);
      }

      const input: NewDataSourceInput = {
        name: body.name.trim(),
        type: type as DataSourceType,
        host: body.host?.trim() || undefined,
        port: body.port ? Number(body.port) : undefined,
        database: body.database?.trim() || undefined,
        schema: body.schema?.trim() || undefined,
        ssl: body.ssl ?? undefined,
        user: body.user?.trim() || undefined,
        filePath: body.filePath?.trim() || undefined,
        password: body.password || undefined,
        connectionString: body.connectionString || undefined,
      };

      // Probe the connection before persisting anything.
      const probe = createConnectorFromConfig(
        {
          id: '__probe__',
          name: input.name,
          type: input.type,
          host: input.host,
          port: input.port,
          database: input.database,
          schema: input.schema,
          ssl: input.ssl,
          user: input.user,
          filePath: input.filePath,
          createdAt: 0,
        },
        { password: input.password, connectionString: input.connectionString },
      );
      try {
        await probe.listTables();
      } catch (err) {
        await probe.close().catch(() => {});
        const msg = err instanceof Error ? err.message : String(err);
        return c.json(fail(`Could not connect: ${msg}`), 400);
      }
      await probe.close().catch(() => {});

      const config = await saveConfig(input);
      return c.json(toPublicDataSource(config), 201);
    },
  }),

  registerApiRoute('/datasources/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const id = c.req.param('id');
      if (id === 'builtin') {
        return c.json(fail('The built-in (env-configured) source cannot be deleted', 409), 409);
      }
      const config = await loadConfig(id);
      if (!config) return c.json(fail('Data source not found', 404), 404);
      await closeConnectorById(id);
      await deleteConfig(id);
      return c.json({ ok: true });
    },
  }),

  // --- schema/table tree ----------------------------------------------------
  registerApiRoute('/datasources/:id/tree', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const id = c.req.param('id');
      try {
        const schemas = await buildTree(id);
        return c.json({ schemas });
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  registerApiRoute('/datasources/:id/refresh', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const id = c.req.param('id');
      try {
        // Drop the cached connector so introspection re-runs against a fresh one.
        if (id !== 'builtin') await closeConnectorById(id);
        const schemas = await buildTree(id);
        return c.json({ schemas });
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  // --- table detail: columns + metadata -------------------------------------
  registerApiRoute('/datasources/:id/tables/:table', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const id = c.req.param('id');
      const table = c.req.param('table');
      if (!IDENTIFIER.test(table)) return c.json(fail('Invalid table name'), 400);
      try {
        const connector = await getConnectorById(id);
        const desc = await connector.describeTable(table);
        const tableMeta = await getTableMetadata(id, table);
        const colMeta = await getColumnMetadataMap(id, table);
        const columns = desc.columns.map((col) => ({
          name: col.name,
          type: col.type,
          notnull: col.notnull,
          primaryKey: col.primaryKey,
          description: colMeta[col.name]?.description ?? null,
          status: colMeta[col.name]?.status ?? null,
          includedForAi: colMeta[col.name]?.includedForAi ?? true,
        }));
        return c.json({ table, columns, metadata: tableMeta });
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  // --- table preview: first N real rows -------------------------------------
  registerApiRoute('/datasources/:id/tables/:table/preview', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const id = c.req.param('id');
      const table = c.req.param('table');
      if (!IDENTIFIER.test(table)) return c.json(fail('Invalid table name'), 400);
      const limit = Math.min(Number(c.req.query('limit')) || PREVIEW_DEFAULT, PREVIEW_MAX);
      try {
        const connector = await getConnectorById(id);
        // table is IDENTIFIER-validated; runReadOnlySql also re-runs assertReadOnly.
        const result = await connector.runReadOnlySql(
          `SELECT * FROM "${table}" LIMIT ${limit}`,
          limit,
        );
        return c.json(result);
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  // --- metadata upsert ------------------------------------------------------
  registerApiRoute('/datasources/:id/metadata', {
    method: 'PATCH',
    requiresAuth: false,
    handler: async (c) => {
      const id = c.req.param('id');
      const body = (await c.req.json().catch(() => ({}))) as {
        table?: string;
        column?: string;
      } & MetadataPatch;
      const { table, column, ...patch } = body;
      if (!table || !IDENTIFIER.test(table)) return c.json(fail('A valid table is required'), 400);
      if (column != null && !IDENTIFIER.test(column)) {
        return c.json(fail('Invalid column name'), 400);
      }
      try {
        const metadata = column
          ? await upsertColumnMetadata(id, table, column, patch)
          : await upsertTableMetadata(id, table, patch);
        return c.json({ metadata });
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  // --- semantic model browsing ----------------------------------------------
  registerApiRoute('/semantic/projects', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const { project } = await semanticProjects();
      // List view: omit heavy per-model detail.
      const { models: _models, ...summary } = project;
      void _models;
      return c.json({ projects: [summary] });
    },
  }),

  registerApiRoute('/semantic/projects/:projectId', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      if (c.req.param('projectId') !== 'dex') return c.json(fail('Project not found', 404), 404);
      const { project } = await semanticProjects();
      return c.json({ project });
    },
  }),

  registerApiRoute('/semantic/projects/:projectId/models/:modelId', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      if (c.req.param('projectId') !== 'dex') return c.json(fail('Project not found', 404), 404);
      const modelId = c.req.param('modelId');
      const { project } = await semanticProjects();
      const found = project.models.find((m) => m.id === modelId);
      if (!found) return c.json(fail('Model not found', 404), 404);
      // Raw cube definition + its YAML, for the editor to seed from. Built-ins
      // resolve to their typed cube (read-only display).
      const stored = await getStoredModelByName(modelId);
      const builtinCube = model.cubes.find((cb) => cb.name === modelId) ?? null;
      const cube = stored ? (stored.draft ?? stored.published) : builtinCube;
      const yaml = cube ? cubeToYaml(cube) : null;
      // Best-effort preview of the cube's base table (built-in cube names map to
      // tables; user cubes carry their `baseTable`); guarded + capped, empty on
      // any mismatch.
      let preview = {
        columns: [] as string[],
        rows: [] as unknown[],
        rowCount: 0,
        truncated: false,
      };
      const baseTable = found.baseTable ?? found.id;
      if (IDENTIFIER.test(baseTable)) {
        try {
          const connector = await getConnectorById('builtin');
          preview = await connector.runReadOnlySql(`SELECT * FROM "${baseTable}" LIMIT 50`, 50);
        } catch {
          /* leave preview empty */
        }
      }
      return c.json({ model: { ...found, preview, cube, yaml } });
    },
  }),

  // --- create a user-defined model (cube) -----------------------------------
  registerApiRoute('/semantic/projects/:projectId/models', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      if (c.req.param('projectId') !== 'dex') return c.json(fail('Project not found', 404), 404);
      const body = (await c.req.json().catch(() => ({}))) as NewModelInput & { publish?: boolean };
      try {
        const { cube } = await resolveCubeFromBody(body);
        // Reject a name that collides with any existing cube (built-in, published, or draft).
        await assertNameAvailable(cube.name);
        // New models are drafts by default — invisible to the agent until published.
        await createModel(cube, body.publish === true);
        const { project } = await semanticProjects();
        const created = project.models.find((m) => m.id === cube.name);
        return c.json({ model: created }, 201);
      } catch (err) {
        const { body: errBody, status } = modelErrorResponse(err);
        return c.json(errBody, status);
      }
    },
  }),

  // --- edit / publish / discard a user-defined model ------------------------
  registerApiRoute('/semantic/projects/:projectId/models/:modelId', {
    method: 'PATCH',
    requiresAuth: false,
    handler: async (c) => {
      if (c.req.param('projectId') !== 'dex') return c.json(fail('Project not found', 404), 404);
      const modelId = c.req.param('modelId');
      const body = (await c.req.json().catch(() => ({}))) as NewModelInput & {
        action?: 'save' | 'publish' | 'discard';
      };
      const action = body.action ?? 'save';

      // Built-in models are read-only.
      if (model.cubes.some((cb) => cb.name === modelId)) {
        return c.json(fail('Built-in models are read-only', 404), 404);
      }
      const existing = await getStoredModelByName(modelId);
      if (!existing) return c.json(fail('Model not found', 404), 404);

      try {
        if (action === 'discard') {
          const result = await discardDraft(modelId);
          if (!result) return c.json({ model: null }); // never-published model removed
          const { project } = await semanticProjects();
          return c.json({ model: project.models.find((m) => m.id === result.name) ?? null });
        }

        // Build a cube from the body when a definition is supplied; otherwise
        // act on the existing draft (e.g. publish a pending draft as-is).
        let cube: Cube | undefined;
        if (hasBodyDefinition(body)) {
          ({ cube } = await resolveCubeFromBody(body, existing.baseTable));
          if (cube.name !== modelId) await assertNameAvailable(cube.name, modelId);
        }

        const updated =
          action === 'publish'
            ? await publishModel(modelId, cube)
            : await saveDraft(modelId, cube ?? existing.draft ?? existing.published!);
        const { project } = await semanticProjects();
        return c.json({
          model: updated ? (project.models.find((m) => m.id === updated.name) ?? null) : null,
        });
      } catch (err) {
        const { body: errBody, status } = modelErrorResponse(err);
        return c.json(errBody, status);
      }
    },
  }),

  // --- delete a user-defined model ------------------------------------------
  registerApiRoute('/semantic/projects/:projectId/models/:modelId', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      if (c.req.param('projectId') !== 'dex') return c.json(fail('Project not found', 404), 404);
      const modelId = c.req.param('modelId');
      const removed = await deleteModel(modelId);
      if (!removed) {
        return c.json(
          fail('Model not found, or it is a built-in model that cannot be deleted', 404),
          404,
        );
      }
      return c.json({ ok: true });
    },
  }),
];

// ---------------------------------------------------------------------------

interface TreeTable {
  id: string;
  name: string;
  rowCount: number;
  endorsed: boolean;
  description: string | null;
}
interface TreeSchema {
  id: string;
  name: string;
  system: boolean;
  endorsed: boolean;
  tables: TreeTable[];
}

async function buildTree(id: string): Promise<TreeSchema[]> {
  const connector = await getConnectorById(id);
  const tables = await connector.listTables();
  const tableMeta = await getAllTableMetadata(id);

  let schema: string | undefined;
  if (id !== 'builtin') schema = (await loadConfig(id))?.schema;
  else if (getActiveProvider() === 'postgres') schema = process.env.PGSCHEMA?.trim() || 'public';

  const name = schemaLabel(connector.dialect, schema);
  const treeTables: TreeTable[] = tables.map((t) => ({
    id: t.name,
    name: t.name,
    rowCount: t.rowCount,
    endorsed: tableMeta[t.name]?.status === 'endorsed',
    description: tableMeta[t.name]?.description ?? null,
  }));
  return [{ id: name, name, system: false, endorsed: false, tables: treeTables }];
}
