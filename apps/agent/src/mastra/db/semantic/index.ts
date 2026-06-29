import { assertReadOnly } from '../guard';
import { getActiveProvider, getConnector } from '../connector';
import type { QueryResult } from '../types';
import { compileSemanticQuery } from './compile';
import { model } from './model';
import { assertValidModel, validateModel } from './validate';
import { listStoredModels } from './store';
import type { Cube, CompileResult, SemanticModel, SemanticQuery } from './types';

export { model } from './model';
export { compileSemanticQuery } from './compile';
export { validateModel, assertValidModel } from './validate';
export * from './types';
export * from './store';
export * from './projects-store';
export * from './yaml';

// Fail fast on a structurally broken model (duplicate names, dangling joins,
// unresolved measure/metric refs) — surfaces at agent boot and in `npm run smoke`.
assertValidModel(model);

/**
 * The model the runtime actually uses = the built-in cubes/metrics plus any
 * user-defined cubes persisted in `dex.db` (v0.7; versioned drafts v3.1). Only
 * each model's **published** version is merged — drafts are invisible to the
 * agent. A cube whose name collides with a built-in one, or that breaks
 * validation, is skipped so a bad row can never take the whole model (or the
 * agent) down.
 */
export async function loadMergedModel(): Promise<SemanticModel> {
  let stored;
  try {
    stored = await listStoredModels();
  } catch {
    return model; // store unavailable → fall back to the built-in model
  }
  if (stored.length === 0) return model;

  const builtinNames = new Set(model.cubes.map((c) => c.name));
  const merged: SemanticModel = {
    cubes: [...model.cubes],
    metrics: [...model.metrics],
  };
  for (const m of stored) {
    // The analyst agent queries the built-in warehouse, so only the built-in
    // `dex` project's models are merged into its model. Models in other projects
    // (bound to other data sources) are organizational — visible in the UI but
    // not compiled into the agent's default semantic model.
    if (m.projectId !== 'dex') continue;
    const cube = m.published; // the agent only ever sees the published version
    if (!cube) continue; // draft / never-published → invisible to the agent
    if (builtinNames.has(cube.name)) continue; // never shadow a built-in cube
    if (merged.cubes.some((c) => c.name === cube.name)) continue;
    const candidate: SemanticModel = { cubes: [...merged.cubes, cube], metrics: merged.metrics };
    const issues = validateModel(candidate);
    if (issues.length === 0) {
      merged.cubes.push(cube);
    } else {
      // A published cube that no longer validates against the merged model (e.g.
      // a join whose target was later deleted) is dropped so it can't break the
      // whole model — but warn, since it silently disappears from the agent.
      console.warn(`[semantic] skipping published model "${cube.name}": ${issues.join('; ')}`);
    }
  }
  return merged;
}

/** A project's cube as a join target — enough for the semantic-model assistant
 *  to pick a `to:` and learn the target's base table (it then confirms the join
 *  key columns via FindTableSchemas). */
export interface ProjectCubeInfo {
  name: string;
  baseTable: string;
  title?: string;
  description?: string;
  endorsed: boolean;
  dimensions: { name: string; sql: string }[];
  measures: { name: string; type: string }[];
}

const toCubeInfo = (c: Cube): ProjectCubeInfo => ({
  name: c.name,
  baseTable: c.sql,
  title: c.title,
  description: c.description,
  endorsed: !!c.endorsed,
  dimensions: c.dimensions.map((d) => ({ name: d.name, sql: d.sql })),
  measures: c.measures.map((m) => ({ name: m.name, type: m.type })),
});

/**
 * The cubes in a semantic project: the built-in cubes (only for the `dex`
 * project) plus the project's stored models in their current (`draft ?? published`)
 * view. This is the canonical "what can a model in this project join to" set —
 * `routes.ts` and the `ListProjectModels` tool both read it so the join-target
 * rules can't drift. Falls back to just the built-ins if the store is unavailable.
 */
export async function listProjectCubes(projectId: string): Promise<ProjectCubeInfo[]> {
  const cubes: ProjectCubeInfo[] = projectId === 'dex' ? model.cubes.map(toCubeInfo) : [];
  try {
    for (const m of await listStoredModels(projectId)) {
      const view = m.draft ?? m.published;
      if (view) cubes.push(toCubeInfo(view));
    }
  } catch {
    /* store unavailable → built-ins only */
  }
  return cubes;
}

/** The set of cube names a model in `projectId` may join to, excluding
 *  `exceptName` (the model being edited). Derived from {@link listProjectCubes}. */
export async function projectCubeNameSet(
  projectId: string,
  exceptName?: string,
): Promise<Set<string>> {
  const names = new Set<string>();
  for (const c of await listProjectCubes(projectId)) {
    if (c.name !== exceptName) names.add(c.name);
  }
  return names;
}

/** The result a semantic query returns — the same shape `run_sql` returns, plus
 *  provenance the UI surfaces (the compiled SQL and whether it's endorsed). */
export type SemanticResult = QueryResult & {
  via: 'semantic';
  sql: string;
  endorsed: boolean;
  measures: string[];
  dimensions: string[];
  cubes: string[];
};

/** Compile a semantic query to SQL for the active dialect, over the built-in
 *  model only (sync; used by `npm run smoke`). */
export function compile(query: SemanticQuery): CompileResult {
  return compileSemanticQuery(query, getActiveProvider(), model);
}

/** Compile + guard + run a semantic query against the active connector. Uses the
 *  merged model so user-defined cubes are queryable too. */
export async function runSemanticQuery(query: SemanticQuery): Promise<SemanticResult> {
  const merged = await loadMergedModel();
  const compiled = compileSemanticQuery(query, getActiveProvider(), merged);
  // The compiled SQL passes through the same read-only guard as hand-written SQL.
  assertReadOnly(compiled.sql);
  const result = await getConnector().runReadOnlySql(compiled.sql);
  return {
    ...result,
    via: 'semantic',
    sql: compiled.sql,
    endorsed: compiled.endorsed,
    measures: compiled.measures,
    dimensions: compiled.dimensions,
    cubes: compiled.cubes,
  };
}

// ---------------------------------------------------------------------------
// Catalog + model summary (what the agent's discovery tools return)
// ---------------------------------------------------------------------------

export function listMetricsCatalog(m: SemanticModel = model) {
  const metrics = m.metrics.map((metric) => {
    const [cubeName, measureName] = metric.measure.split('.');
    const measure = m.cubes
      .find((c) => c.name === cubeName)
      ?.measures.find((mm) => mm.name === measureName);
    return {
      name: metric.name,
      title: metric.title ?? metric.name,
      description: metric.description ?? measure?.description,
      measure: metric.measure,
      format: measure?.format ?? 'number',
      endorsed: !!metric.endorsed,
    };
  });
  return { metrics };
}

export function describeModelSummary(m: SemanticModel = model) {
  return {
    dialect: getActiveProvider(),
    cubes: m.cubes.map((cube) => ({
      name: cube.name,
      title: cube.title ?? cube.name,
      description: cube.description,
      endorsed: !!cube.endorsed,
      measures: cube.measures.map((mm) => ({
        name: mm.name,
        ref: `${cube.name}.${mm.name}`,
        title: mm.title ?? mm.name,
        type: mm.type,
        format: mm.format ?? 'number',
        description: mm.description,
        endorsed: !!mm.endorsed,
      })),
      dimensions: cube.dimensions.map((d) => ({
        name: d.name,
        ref: `${cube.name}.${d.name}`,
        title: d.title ?? d.name,
        type: d.type,
        description: d.description,
      })),
      joins: (cube.joins ?? []).map((j) => ({ to: j.to, relationship: j.relationship })),
    })),
    metrics: m.metrics.map((mm) => ({
      name: mm.name,
      title: mm.title ?? mm.name,
      description: mm.description,
      measure: mm.measure,
      filters: mm.filters,
      endorsed: !!mm.endorsed,
    })),
  };
}

/** Async variants over the merged model — what the agent's tools call so user
 *  cubes are visible to the agent, not just the UI. */
export async function describeModelSummaryAsync() {
  return describeModelSummary(await loadMergedModel());
}

export async function listMetricsCatalogAsync() {
  return listMetricsCatalog(await loadMergedModel());
}
