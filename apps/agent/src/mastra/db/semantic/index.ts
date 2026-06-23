import { assertReadOnly } from '../guard';
import { getActiveProvider, getConnector } from '../connector';
import type { QueryResult } from '../types';
import { compileSemanticQuery } from './compile';
import { model } from './model';
import { assertValidModel } from './validate';
import type { CompileResult, SemanticQuery } from './types';

export { model } from './model';
export { compileSemanticQuery } from './compile';
export { validateModel, assertValidModel } from './validate';
export * from './types';

// Fail fast on a structurally broken model (duplicate names, dangling joins,
// unresolved measure/metric refs) — surfaces at agent boot and in `npm run smoke`.
assertValidModel(model);

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

/** Compile a semantic query to SQL for the active dialect (no execution). */
export function compile(query: SemanticQuery): CompileResult {
  return compileSemanticQuery(query, getActiveProvider(), model);
}

/** Compile + guard + run a semantic query against the active connector. */
export async function runSemanticQuery(query: SemanticQuery): Promise<SemanticResult> {
  const compiled = compile(query);
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

export function listMetricsCatalog() {
  const metrics = model.metrics.map((metric) => {
    const [cubeName, measureName] = metric.measure.split('.');
    const measure = model.cubes
      .find((c) => c.name === cubeName)
      ?.measures.find((m) => m.name === measureName);
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

export function describeModelSummary() {
  return {
    dialect: getActiveProvider(),
    cubes: model.cubes.map((cube) => ({
      name: cube.name,
      title: cube.title ?? cube.name,
      description: cube.description,
      endorsed: !!cube.endorsed,
      measures: cube.measures.map((m) => ({
        name: m.name,
        ref: `${cube.name}.${m.name}`,
        title: m.title ?? m.name,
        type: m.type,
        format: m.format ?? 'number',
        description: m.description,
        endorsed: !!m.endorsed,
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
    metrics: model.metrics.map((m) => ({
      name: m.name,
      title: m.title ?? m.name,
      description: m.description,
      measure: m.measure,
      filters: m.filters,
      endorsed: !!m.endorsed,
    })),
  };
}
