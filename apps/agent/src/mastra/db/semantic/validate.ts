import type { Relationship, SemanticModel } from './types';

const RELATIONSHIPS: Relationship[] = ['many_to_one', 'one_to_many', 'one_to_one'];

/**
 * Structural validation of a semantic model: duplicate names, dangling joins,
 * and measure/metric references that don't resolve. (Column existence is checked
 * implicitly when the compiler's SQL runs against the warehouse.)
 */
export function validateModel(model: SemanticModel): string[] {
  const errors: string[] = [];

  const cubeNames = new Set<string>();
  for (const cube of model.cubes) {
    if (cubeNames.has(cube.name)) errors.push(`Duplicate cube: "${cube.name}".`);
    cubeNames.add(cube.name);
  }

  for (const cube of model.cubes) {
    const measureNames = new Set<string>();
    for (const m of cube.measures) {
      if (measureNames.has(m.name)) {
        errors.push(`Duplicate measure: "${cube.name}.${m.name}".`);
      }
      measureNames.add(m.name);
      if (m.type !== 'count' && !m.sql) {
        errors.push(`Measure "${cube.name}.${m.name}" (${m.type}) needs a sql expression.`);
      }
      for (const r of m.requires ?? []) {
        if (!cubeNames.has(r)) {
          errors.push(`Measure "${cube.name}.${m.name}" requires unknown cube "${r}".`);
        }
      }
    }

    const dimNames = new Set<string>();
    for (const d of cube.dimensions) {
      if (dimNames.has(d.name)) errors.push(`Duplicate dimension: "${cube.name}.${d.name}".`);
      dimNames.add(d.name);
    }

    for (const j of cube.joins ?? []) {
      if (!cubeNames.has(j.to)) {
        errors.push(`Join "${cube.name}" → "${j.to}" targets an unknown cube.`);
      }
      if (!RELATIONSHIPS.includes(j.relationship)) {
        errors.push(`Join "${cube.name}" → "${j.to}" has an invalid relationship.`);
      }
      if (!j.sql || !j.sql.trim()) {
        errors.push(`Join "${cube.name}" → "${j.to}" needs an ON condition (sql).`);
      }
    }
  }

  const metricNames = new Set<string>();
  for (const metric of model.metrics) {
    if (metricNames.has(metric.name)) errors.push(`Duplicate metric: "${metric.name}".`);
    metricNames.add(metric.name);

    const [c, m] = metric.measure.split('.');
    const cube = model.cubes.find((x) => x.name === c);
    if (!cube) {
      errors.push(`Metric "${metric.name}" references unknown cube "${c}".`);
    } else if (!cube.measures.find((x) => x.name === m)) {
      errors.push(`Metric "${metric.name}" references unknown measure "${metric.measure}".`);
    }

    for (const f of metric.filters ?? []) {
      const [fc, fd] = f.member.split('.');
      const fcube = model.cubes.find((x) => x.name === fc);
      if (!fcube) {
        errors.push(`Metric "${metric.name}" filter references unknown cube "${fc}".`);
      } else if (!fcube.dimensions.find((x) => x.name === fd)) {
        errors.push(`Metric "${metric.name}" filter references unknown dimension "${f.member}".`);
      }
    }
  }

  return errors;
}

export function assertValidModel(model: SemanticModel): void {
  const errors = validateModel(model);
  if (errors.length) {
    throw new Error(`Invalid semantic model:\n - ${errors.join('\n - ')}`);
  }
}
