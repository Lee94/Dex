/**
 * Agent-side **pre-flight validator** for the vinci surface DSL the visualization
 * specialist authors. It mirrors the structural checks the web's vendored compiler
 * (`apps/web/src/vinci/dsl/surface/{geomOptions,fieldRef}.ts`) performs at render
 * time, so a malformed DSL is caught **here** — before it's persisted into a
 * notebook cell — and the error is fed back to the agent to repair (instead of the
 * web silently showing "Couldn't build this chart from the DSL").
 *
 * It is deliberately **conservative**: it only hard-fails on shapes the real
 * compiler is certain to reject (unknown geom type / geom-attribute / geom-option
 * key, bad option value type, field refs to undeclared aliases, unknown
 * summary/group/calc tokens). Anything it can't be sure about passes, so a valid
 * DSL is never bounced into a retry loop.
 *
 * The enum/schema tables below are copied from `@vinci/core` + the surface
 * compiler. Keep them in sync if the vendored vinci is upgraded; the unit test
 * (`test/viz-dsl.test.ts`) guards the geom-options check against drift.
 */

// @vinci/core GEOM_TYPES — the only valid geom `type` values. NB: there is no
// "pie" geom; part-of-whole isn't expressible in this DSL subset.
const GEOM_TYPES = ['interval', 'point', 'line', 'area', 'rect', 'text', 'areaMap'] as const;

// @vinci/core GeomAttributeKeysMap — allowed attribute keys per geom type.
const GEOM_ATTRIBUTE_KEYS: Record<string, readonly string[]> = {
  interval: ['options', 'color', 'size', 'label', 'tooltip', 'granularity', 'borderColor'],
  point: ['options', 'color', 'size', 'label', 'tooltip', 'granularity', 'borderColor'],
  line: ['options', 'color', 'size', 'path', 'label', 'tooltip', 'granularity', 'borderColor'],
  area: ['options', 'color', 'path', 'label', 'tooltip', 'granularity', 'borderColor'],
  rect: ['options', 'color', 'size', 'label', 'tooltip', 'granularity', 'borderColor'],
  text: ['options', 'color', 'size', 'text', 'tooltip', 'granularity', 'borderColor'],
  areaMap: ['options', 'color', 'label', 'tooltip', 'granularity', 'borderColor'],
};

type FieldSpec =
  | { kind: 'bool' }
  | { kind: 'number' }
  | { kind: 'ratio' }
  | { kind: 'string' }
  | { kind: 'enum'; values: readonly string[] };

// surface/geomOptions.ts GEOM_OPTION_SCHEMA — allowed `options` sub-keys per geom.
const GEOM_OPTION_SCHEMA: Record<string, Record<string, FieldSpec>> = {
  interval: {
    stack: { kind: 'bool' },
    labelPosition: { kind: 'enum', values: ['inside', 'outside', 'center'] },
    roundRadius: { kind: 'number' },
  },
  line: {
    stack: { kind: 'bool' },
    labelPosition: { kind: 'enum', values: ['top', 'bottom'] },
    lineType: { kind: 'enum', values: ['normal', 'curve', 'step'] },
    marker: { kind: 'bool' },
  },
  area: {
    stack: { kind: 'bool' },
    labelPosition: { kind: 'enum', values: ['top', 'bottom'] },
    lineType: { kind: 'enum', values: ['normal', 'curve', 'step'] },
  },
  rect: {
    stack: { kind: 'bool' },
    labelPosition: { kind: 'enum', values: ['center', 'inside'] },
  },
  point: {
    labelPosition: { kind: 'enum', values: ['top', 'bottom', 'center'] },
  },
  text: {
    fit: { kind: 'bool' },
  },
};

// registry/{summary,group,calculation}.ts — valid field-ref op tokens.
const SUMMARY_ALIASES = new Set([
  'agg',
  'none',
  'sum',
  'avg',
  'max',
  'min',
  'median',
  'distinct',
  'count',
  'stddev',
  'variance',
  'first',
  'last',
  'p5',
  'p10',
  'p25',
  'p50',
  'p75',
  'p90',
  'p95',
]);
const GROUP_ALIASES = new Set([
  'none',
  'same',
  'y_m_d',
  'y_m',
  'y_w',
  'y_q',
  'y_cycle',
  'y',
  'q',
  'm',
  'm_d',
  'w',
  'wd',
  'd',
  'h',
  'min',
  's',
  'y_m_d_h_min_s',
]);
const CALC_ALIASES = new Set(['none', 'percent', 'rank_asc', 'rank_desc', 'accumulate']);
const SORT_TYPES = new Set(['none', 'asc', 'desc', 'custom']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkOptionValue(spec: FieldSpec, v: unknown, path: string): string | null {
  switch (spec.kind) {
    case 'bool':
      return typeof v === 'boolean' ? null : `${path} expects a boolean, got ${JSON.stringify(v)}`;
    case 'number':
      return typeof v === 'number' && !Number.isNaN(v)
        ? null
        : `${path} expects a number, got ${JSON.stringify(v)}`;
    case 'ratio':
      return typeof v === 'number' && !Number.isNaN(v) && v >= 0 && v <= 1
        ? null
        : `${path} expects a number in [0,1], got ${JSON.stringify(v)}`;
    case 'string':
      return typeof v === 'string' ? null : `${path} expects a string, got ${JSON.stringify(v)}`;
    case 'enum':
      return typeof v === 'string' && spec.values.includes(v)
        ? null
        : `${path} expects one of ${spec.values.map((s) => `"${s}"`).join(' | ')}, got ${JSON.stringify(v)}`;
  }
}

/** Validate one encoding field ref (compact string or object) against declared aliases. */
function validateFieldRef(ref: unknown, aliases: Set<string>, where: string, errs: string[]): void {
  if (typeof ref === 'string') {
    const main = ref.split('@')[0];
    const parts = main.split(':').map((p) => p.trim());
    if (parts.length < 1 || parts.length > 3 || parts.some((p) => p === '')) {
      errs.push(`${where}: invalid compact field string "${ref}".`);
      return;
    }
    const [alias, t1, t2] = parts;
    if (!aliases.has(alias)) {
      errs.push(`${where}: field alias "${alias}" is not declared in \`fields\`.`);
    }
    if (
      t1 !== undefined &&
      !(SUMMARY_ALIASES.has(t1) || GROUP_ALIASES.has(t1) || CALC_ALIASES.has(t1))
    ) {
      errs.push(`${where}: unknown op "${t1}" in "${ref}" (expected a summary/group/calc).`);
    }
    if (t2 !== undefined && !CALC_ALIASES.has(t2)) {
      errs.push(
        `${where}: second op "${t2}" in "${ref}" must be a calc (${[...CALC_ALIASES].join(' | ')}).`,
      );
    }
    return;
  }
  if (isPlainObject(ref)) {
    const alias = ref.field;
    if (typeof alias !== 'string' || !aliases.has(alias)) {
      errs.push(`${where}: object ref \`field\` "${String(alias)}" is not declared in \`fields\`.`);
    }
    if (ref.summary !== undefined && !SUMMARY_ALIASES.has(String(ref.summary))) {
      errs.push(`${where}: unknown summary "${String(ref.summary)}".`);
    }
    if (ref.group !== undefined && !GROUP_ALIASES.has(String(ref.group))) {
      errs.push(`${where}: unknown group "${String(ref.group)}".`);
    }
    if (ref.calc !== undefined && !CALC_ALIASES.has(String(ref.calc))) {
      errs.push(`${where}: unknown calc "${String(ref.calc)}".`);
    }
    return;
  }
  errs.push(`${where}: a field ref must be a string or an object, got ${JSON.stringify(ref)}.`);
}

/** Validate one geom entry (the value under `geoms.<alias>`). */
function validateGeom(alias: string, geom: unknown, errs: string[]): void {
  if (!isPlainObject(geom)) {
    errs.push(`Geom "${alias}" must be an object with a \`type\`.`);
    return;
  }
  const type = geom.type;
  if (typeof type !== 'string' || !(GEOM_TYPES as readonly string[]).includes(type)) {
    errs.push(
      `Geom "${alias}" has type ${JSON.stringify(type)}; valid types: ${GEOM_TYPES.join(' / ')}. (There is no "pie" geom — use "interval" for bars.)`,
    );
    return; // can't check attributes/options without a known type
  }
  const allowedAttrs = new Set(GEOM_ATTRIBUTE_KEYS[type] ?? []);
  for (const [key, value] of Object.entries(geom)) {
    if (key === 'type') continue;
    if (!allowedAttrs.has(key)) {
      errs.push(
        `Geom "${alias}" (type ${type}) doesn't support attribute "${key}"; allowed: ${[...allowedAttrs].join(' / ')}.`,
      );
      continue;
    }
    if (key === 'options' && isPlainObject(value)) {
      const optKeys = Object.keys(value);
      // Nested form ({ [geomType]: {...} }) is passed through untouched by the compiler.
      const isNested =
        optKeys.length > 0 &&
        optKeys.every((k) => k === 'fields' || (GEOM_TYPES as readonly string[]).includes(k));
      if (!isNested) {
        const schema = GEOM_OPTION_SCHEMA[type];
        if (schema) {
          for (const [k, v] of Object.entries(value)) {
            const spec = schema[k];
            if (!spec) {
              errs.push(
                `Geom "${alias}" (type ${type}) options doesn't support key "${k}"; allowed: ${Object.keys(schema).join(' / ') || '(none)'}. To sort, use top-level \`sort\`; to keep only top-N rows, LIMIT in the SQL cell.`,
              );
            } else {
              const msg = checkOptionValue(spec, v, `geoms.${alias}.options.${k}`);
              if (msg) errs.push(msg);
            }
          }
        }
      }
    }
  }
}

/**
 * Validate a surface DSL object. Returns a list of human-readable problems
 * (empty = the DSL passes the pre-flight checks).
 */
export function validateVizDsl(dsl: unknown): string[] {
  const errs: string[] = [];
  if (!isPlainObject(dsl)) return ['The DSL must be a JSON object (a SurfaceDoc).'];

  // fields: object of { from, type }, keyed by alias.
  const fields = dsl.fields;
  const aliases = new Set<string>();
  if (!isPlainObject(fields) || Object.keys(fields).length === 0) {
    errs.push('`fields` must be a non-empty object mapping each alias to { from, type }.');
  } else {
    for (const [alias, def] of Object.entries(fields)) {
      aliases.add(alias);
      if (!isPlainObject(def) || typeof def.from !== 'string' || def.from.trim() === '') {
        errs.push(
          `fields.${alias} must be an object with a non-empty \`from\` (the upstream column name).`,
        );
      }
    }
  }

  // encoding: { x?: ref[], y?: ref[] }.
  const encoding = dsl.encoding;
  if (!isPlainObject(encoding)) {
    errs.push('`encoding` must be an object with `x` and/or `y` arrays of field refs.');
  } else {
    for (const axis of ['x', 'y'] as const) {
      const refs = encoding[axis];
      if (refs === undefined) continue;
      if (!Array.isArray(refs)) {
        errs.push(`encoding.${axis} must be an array of field refs.`);
        continue;
      }
      refs.forEach((ref, i) => validateFieldRef(ref, aliases, `encoding.${axis}[${i}]`, errs));
    }
  }

  // geoms: object keyed by measure alias.
  const geoms = dsl.geoms;
  if (!isPlainObject(geoms)) {
    errs.push('`geoms` must be an object keyed by the measure alias.');
  } else {
    for (const [alias, geom] of Object.entries(geoms)) validateGeom(alias, geom, errs);
  }

  // sort: top-level array of { id?, sortType, dependField? }.
  if (dsl.sort !== undefined) {
    if (!Array.isArray(dsl.sort)) {
      errs.push('`sort` must be an array of { id, sortType, dependField } entries.');
    } else {
      dsl.sort.forEach((s, i) => {
        if (!isPlainObject(s) || !SORT_TYPES.has(String(s.sortType))) {
          errs.push(`sort[${i}].sortType must be one of ${[...SORT_TYPES].join(' | ')}.`);
        }
      });
    }
  }

  // Common hallucinations: sort/limit do NOT live under `settings`.
  if (isPlainObject(dsl.settings)) {
    if ('sort' in dsl.settings) {
      errs.push(
        '`settings.sort` is not supported. Sort with a top-level `sort` array, e.g. sort:[{ "id": "<dimension alias>:same", "sortType": "desc", "dependField": "<measure alias>:sum" }].',
      );
    }
    if ('limit' in dsl.settings) {
      errs.push(
        '`settings.limit` is not supported. To show only the top-N rows, add a LIMIT to the upstream SQL cell — the chart has no row cap.',
      );
    }
  }

  return errs;
}
