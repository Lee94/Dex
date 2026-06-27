import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  loadMergedModel,
  runSemanticQuery,
  type SemanticFilter,
  type SemanticQuery,
} from '../db/semantic';
import { appendCell, type NotebookCell } from '../db/notebooks';

/**
 * `CreateSemanticTable` (Hex) — materialize a semantic-layer result as a durable
 * notebook cell. Hex creates a "table cell from a semantic dataset"; Dex compiles
 * the requested measures/dimensions to governed read-only SQL (`runSemanticQuery`)
 * and persists it as a SQL cell (so it renders, chains by outputName, and carries
 * the endorsed/`via:'semantic'` provenance the UI shows as a "Trusted definition").
 *
 * Field shape mirrors Hex (`fieldName` + `queryPath`); Dex resolves the cube for a
 * field from its queryPath (the joined dataset) or the base `datasetName`, builds a
 * `cube.field` reference, and lets the semantic compiler plan the joins.
 */

const fieldRef = z.object({
  fieldName: z.string(),
  queryPath: z.array(z.string()).nullable().optional(),
});

const measureField = fieldRef;
const dimensionField = fieldRef.extend({
  aggregation: z
    .string()
    .nullable()
    .optional()
    .describe('Accepted for parity; not applied by Dex.'),
});

const filterField = fieldRef.extend({
  columnType: z.string().optional(),
  operation: z.string(),
  value: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
});

/** Map Hex's verbose filter operations onto Dex's semantic filter operators. */
const OP_MAP: Record<string, SemanticFilter['operator'] | undefined> = {
  equals: 'equals',
  'not equals': 'not_equals',
  'greater than': 'gt',
  'greater than or equal': 'gte',
  'less than': 'lt',
  'less than or equal': 'lte',
  contains: 'contains',
  'is one of': 'in',
  'date equals': 'equals',
  'date not equals': 'not_equals',
  'date after': 'gt',
  'date before': 'lt',
  'date on or after': 'gte',
  'date on or before': 'lte',
};

type FieldRef = z.infer<typeof fieldRef>;
/** Resolve a field's cube: the last queryPath hop (joined dataset) or the base dataset. */
const cubeOf = (f: FieldRef, base: string) =>
  f.queryPath && f.queryPath.length > 0 ? f.queryPath[f.queryPath.length - 1] : base;
const refOf = (f: FieldRef, base: string) => `${cubeOf(f, base)}.${f.fieldName}`;

export const createSemanticTableTool = createTool({
  id: 'CreateSemanticTable',
  description:
    'Create a durable table cell from a semantic dataset — the standard way to materialize a ' +
    'semantic-layer result (detail rows, grouped metrics, or a single-number answer). Behavior: ' +
    'dimensions only → row-level detail; measures only → a single aggregated row (e.g. total ' +
    'revenue); dimensions + measures → grouped aggregation (e.g. revenue by category). Put pre-defined ' +
    'metrics in `measures` (never aggregate them again) and grouping/detail fields in `dimensions`. ' +
    'Provide `queryPath` for each field: empty/omitted for base-dataset fields, or the joined-dataset ' +
    'path for joined fields. Verify dataset and field names via FindSemanticColumns / ' +
    'InspectSemanticData first. The cell renders as a table, chains by outputName, and shows a Trusted ' +
    'definition badge when every measure used is endorsed. Reference it in your answer with ' +
    '[cell:<cellId>].',
  inputSchema: z.object({
    semanticInput: z.object({
      semanticProjectName: z.string(),
      datasetName: z.string(),
    }),
    label: z.string().optional(),
    outputName: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .optional(),
    dimensions: z.array(dimensionField).nullable().optional(),
    measures: z.array(measureField).nullable().optional(),
    filters: z.array(filterField).nullable().optional(),
    sort: z
      .object({
        direction: z.enum(['asc', 'desc']),
        fieldName: z.string(),
        queryPath: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
    dataConnectionId: z.string().nullable().optional(),
  }),
  outputSchema: z.object({
    cellId: z.string(),
    outputName: z.string().nullable(),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.any())),
    rowCount: z.number(),
    truncated: z.boolean(),
    sql: z.string(),
    endorsed: z.boolean(),
    via: z.literal('semantic'),
  }),
  execute: async (input, ctx) => {
    const base = input.semanticInput.datasetName;
    const measures = (input.measures ?? []).map((m) => refOf(m, base));
    if (measures.length === 0 && (input.dimensions ?? []).length === 0) {
      throw new Error('Provide at least one measure or dimension.');
    }
    const dimensions = (input.dimensions ?? []).map((d) => refOf(d, base));

    const filters: SemanticFilter[] = [];
    for (const f of input.filters ?? []) {
      const operator = OP_MAP[f.operation];
      if (!operator) continue; // skip operations Dex's semantic layer can't express
      const values = Array.isArray(f.value) ? f.value : f.value != null ? [f.value] : [];
      if (values.length === 0) continue;
      filters.push({ member: refOf(f, base), operator, values });
    }

    // A dimensions-only "detail/grouping" request still needs a measure for the
    // compiler — inject a count measure from the base cube so the table compiles.
    let effectiveMeasures = measures;
    if (effectiveMeasures.length === 0) {
      const model = await loadMergedModel();
      const cube = model.cubes.find((c) => c.name === base);
      const counter =
        cube?.measures.find((m) => m.type === 'count' || m.type === 'count_distinct') ??
        cube?.measures[0];
      if (!counter) {
        throw new Error(
          `Dataset "${base}" has no measure to aggregate by. For raw detail rows, use CreateSqlCell instead.`,
        );
      }
      effectiveMeasures = [`${base}.${counter.name}`];
    }

    const query: SemanticQuery = {
      measures: effectiveMeasures,
      dimensions: dimensions.length > 0 ? dimensions : undefined,
      filters: filters.length > 0 ? filters : undefined,
      order: input.sort
        ? [{ member: input.sort.fieldName, direction: input.sort.direction }]
        : undefined,
    };

    const result = await runSemanticQuery(query);

    const cellId = randomUUID();
    const outputName = input.outputName?.trim() || undefined;
    const threadId = ctx?.agent?.threadId;
    if (threadId) {
      const cell: NotebookCell = { id: cellId, kind: 'sql', source: result.sql, outputName };
      await appendCell(threadId, cell, { titleIfNew: input.label });
    }
    return {
      cellId,
      outputName: outputName ?? null,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
      sql: result.sql,
      endorsed: result.endorsed,
      via: 'semantic' as const,
    };
  },
});
