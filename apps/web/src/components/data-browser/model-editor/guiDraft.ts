import type { DimensionKind, MeasureKind } from '@/lib/dataSources';

/** Measure kinds the GUI form supports (ratio is YAML-only). */
export const MEASURE_KINDS: MeasureKind[] = ['count', 'sum', 'avg', 'count_distinct', 'min', 'max'];

export interface GuiMeasureDraft {
  name: string;
  type: MeasureKind;
  column: string;
}

export interface GuiModelDraft {
  name: string;
  title: string;
  description: string;
  table: string;
  measures: GuiMeasureDraft[];
  dims: Record<string, DimensionKind>;
}

/** A blank GUI draft (used for the "new model" editor). */
export function emptyGuiDraft(): GuiModelDraft {
  return {
    name: '',
    title: '',
    description: '',
    table: '',
    measures: [{ name: 'count', type: 'count', column: '' }],
    dims: {},
  };
}

/** Infer a dimension kind from a SQL column type (overridable in the form). */
export function inferDimKind(type: string): DimensionKind {
  const t = type.toLowerCase();
  if (/(date|time|timestamp)/.test(t)) return 'temporal';
  if (/(int|real|numeric|decimal|double|float|serial|money)/.test(t)) return 'numeric';
  return 'categorical';
}
