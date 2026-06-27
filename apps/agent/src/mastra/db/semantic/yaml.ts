import { parse, stringify, YAMLParseError } from 'yaml';
import { IDENTIFIER } from '../guard';
import { validateModel } from './validate';
import type { Cube, Dimension, DimensionType, Format, Measure, MeasureType } from './types';

/**
 * cube.js-style YAML for user-defined semantic models (v3.1).
 *
 * The YAML is an **isomorphic serialization of a `Cube`** — top-level keys map
 * straight to the `Cube` interface (name / sql / measures / dimensions). This
 * keeps round-tripping trivial and lets the existing `validateModel` do the
 * structural checks. `parseCubeYaml` collects errors (with line/col where the
 * YAML library provides them) instead of throwing, so callers can surface them
 * (HTTP 400 → Monaco markers). User cubes are standalone: `joins` are rejected,
 * `endorsed` is forced false.
 */

const MEASURE_TYPES: MeasureType[] = [
  'count',
  'sum',
  'avg',
  'count_distinct',
  'min',
  'max',
  'ratio',
];
const DIMENSION_TYPES: DimensionType[] = ['categorical', 'temporal', 'numeric'];
const FORMATS: Format[] = ['number', 'integer', 'currency', 'percent'];

export interface CubeYamlError {
  message: string;
  line?: number;
  col?: number;
}

export interface ParseCubeResult {
  cube?: Cube;
  errors: CubeYamlError[];
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Drop keys whose value is `undefined` so serialized YAML / built cubes stay tidy. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

function defaultFormat(type: MeasureType): Format {
  return type === 'count' || type === 'count_distinct' ? 'integer' : 'number';
}

/** Serialize a cube to clean YAML (the editor's YAML tab seeds from this). */
export function cubeToYaml(cube: Cube): string {
  const doc = clean({
    name: cube.name,
    title: cube.title,
    description: cube.description,
    sql: cube.sql,
    measures: cube.measures.map((m) =>
      clean({
        name: m.name,
        title: m.title,
        description: m.description,
        type: m.type,
        sql: m.sql,
        format: m.format,
      }),
    ),
    dimensions: cube.dimensions.map((d) =>
      clean({
        name: d.name,
        title: d.title,
        description: d.description,
        type: d.type,
        sql: d.sql,
      }),
    ),
  });
  return stringify(doc);
}

/** Parse + sanitize cube YAML into a validated `Cube`. Never throws — problems
 *  come back in `errors`. */
export function parseCubeYaml(text: string): ParseCubeResult {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    if (e instanceof YAMLParseError) {
      const pos = e.linePos?.[0];
      return { errors: [{ message: e.message, line: pos?.line, col: pos?.col }] };
    }
    return { errors: [{ message: e instanceof Error ? e.message : String(e) }] };
  }
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      errors: [{ message: 'The model must be a YAML mapping with `name`, `sql` and `measures`.' }],
    };
  }
  const raw = doc as Record<string, unknown>;
  const errors: CubeYamlError[] = [];

  const name = str(raw.name).trim();
  if (!IDENTIFIER.test(name)) {
    errors.push({ message: 'name must be an identifier (letters, digits, underscore).' });
  }
  const sql = str(raw.sql).trim();
  if (!IDENTIFIER.test(sql)) {
    errors.push({
      message: 'sql must be a base table name (identifier); subqueries are not allowed.',
    });
  }
  if (Array.isArray(raw.joins) && raw.joins.length > 0) {
    errors.push({ message: 'User models cannot define joins.' });
  }

  const measures: Measure[] = [];
  const rawMeasures = Array.isArray(raw.measures) ? raw.measures : [];
  if (rawMeasures.length === 0) errors.push({ message: 'Add at least one measure.' });
  rawMeasures.forEach((rm, i) => {
    if (rm == null || typeof rm !== 'object' || Array.isArray(rm)) {
      errors.push({ message: `measures[${i}] must be a mapping.` });
      return;
    }
    const m = rm as Record<string, unknown>;
    const mName = str(m.name).trim();
    const label = mName || `measures[${i}]`;
    if (!IDENTIFIER.test(mName)) {
      errors.push({ message: `${label}: name must be an identifier.` });
      return;
    }
    const type = str(m.type).trim() as MeasureType;
    if (!MEASURE_TYPES.includes(type)) {
      errors.push({ message: `${label}: type must be one of ${MEASURE_TYPES.join(', ')}.` });
      return;
    }
    const format = m.format != null ? (str(m.format).trim() as Format) : undefined;
    if (format && !FORMATS.includes(format)) {
      errors.push({ message: `${label}: format must be one of ${FORMATS.join(', ')}.` });
      return;
    }
    measures.push(
      clean({
        name: mName,
        title: m.title != null ? str(m.title) : mName,
        description: m.description != null ? str(m.description) : undefined,
        type,
        sql: m.sql != null ? str(m.sql).trim() : undefined,
        format: format ?? defaultFormat(type),
        endorsed: false,
      }) as Measure,
    );
  });

  const dimensions: Dimension[] = [];
  const rawDims = Array.isArray(raw.dimensions) ? raw.dimensions : [];
  rawDims.forEach((rd, i) => {
    if (rd == null || typeof rd !== 'object' || Array.isArray(rd)) {
      errors.push({ message: `dimensions[${i}] must be a mapping.` });
      return;
    }
    const d = rd as Record<string, unknown>;
    const dName = str(d.name).trim();
    const label = dName || `dimensions[${i}]`;
    if (!IDENTIFIER.test(dName)) {
      errors.push({ message: `${label}: name must be an identifier.` });
      return;
    }
    const type = str(d.type).trim() as DimensionType;
    if (!DIMENSION_TYPES.includes(type)) {
      errors.push({ message: `${label}: type must be one of ${DIMENSION_TYPES.join(', ')}.` });
      return;
    }
    const dSql = str(d.sql).trim();
    if (!dSql) {
      errors.push({ message: `${label}: sql is required.` });
      return;
    }
    dimensions.push(
      clean({
        name: dName,
        title: d.title != null ? str(d.title) : dName,
        description: d.description != null ? str(d.description) : undefined,
        type,
        sql: dSql,
      }) as Dimension,
    );
  });

  if (errors.length > 0) return { errors };

  const cube: Cube = clean({
    name,
    title: raw.title != null ? str(raw.title) : name,
    description: raw.description != null ? str(raw.description) : undefined,
    sql,
    endorsed: false,
    measures,
    dimensions,
    joins: [],
  }) as Cube;

  // Final structural pass (e.g. a non-count measure missing its `sql`, duplicate
  // member names) reuses the same validator the built-in model is checked with.
  const structural = validateModel({ cubes: [cube], metrics: [] });
  if (structural.length > 0) return { errors: structural.map((message) => ({ message })) };

  return { cube, errors: [] };
}

/**
 * Best-effort check that single-column references in a cube's measures/dimensions
 * exist in the base table. Only simple `<cubeName>.<column>` refs are checked;
 * ratios / multi-column / function expressions are skipped (they can't be parsed
 * statically — `assertReadOnly` + runtime errors are the backstop).
 */
export function assertColumnsExist(cube: Cube, columnNames: Set<string>): void {
  const single = new RegExp(`^${cube.name}\\.([A-Za-z_][A-Za-z0-9_]*)$`);
  const check = (sql: string | undefined, where: string) => {
    if (!sql) return;
    const m = single.exec(sql.trim());
    if (m && !columnNames.has(m[1])) {
      throw new Error(`Column "${m[1]}" referenced by ${where} does not exist in ${cube.sql}.`);
    }
  };
  for (const m of cube.measures) check(m.sql, `measure "${m.name}"`);
  for (const d of cube.dimensions) check(d.sql, `dimension "${d.name}"`);
}
