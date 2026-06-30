import { dslToSnapshot } from '@/vinci/dsl';
import { starterSurfaceDoc } from '@/vinci/starterDsl';
import { createVinciApiService } from '@/vinci/vinciCompute';
import { buildVinciTableSnapshot } from '@/vinci/vinciTable';

/** The compiled vinci model snapshot + table snapshot a viewer/designer renders. */
export type CompiledSnapshot = {
  /** The compiled vinci model snapshot, or null when it couldn't be built. */
  snapshot: unknown | null;
  /** The in-memory table snapshot (field schema; also needed to decompile edits). */
  table: unknown;
  /** Set when `dslToSnapshot` threw (a malformed/incompatible DSL). */
  error?: unknown;
};

/** The snapshot/table/api trio the vinci `VinciViewer` / `VinciDesigner` consume. */
export type CompiledSurface = CompiledSnapshot & {
  /** The in-browser compute service over the rows (aggregation happens here). */
  api: ReturnType<typeof createVinciApiService>;
};

/**
 * Build the vinci model + table snapshot from a surface DSL and a sample of the
 * data's rows (used only to infer the column schema / field types — the actual
 * aggregation runs through whatever `apiService` the caller supplies). With no DSL
 * we fall back to a starter chart inferred from the columns.
 *
 * Pure (no React, no IO) so the read-only viewer, the editable designer, and the
 * live-data path share one code path.
 */
export function buildSnapshot(
  columns: string[],
  sampleRows: Record<string, unknown>[],
  dsl: Record<string, unknown> | undefined,
  tableName: string,
): CompiledSnapshot {
  const table = buildVinciTableSnapshot(columns, sampleRows, tableName || 'data');
  const surface = dsl ?? starterSurfaceDoc(columns, sampleRows);
  if (!surface) return { snapshot: null, table };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = dslToSnapshot({ ...(surface as any), table } as any);
    return { snapshot, table };
  } catch (e) {
    return { snapshot: null, table, error: e };
  }
}

/**
 * Compile a vinci surface DSL + the upstream SQL rows into the trio both the
 * read-only `VinciViewer` and the editable `VinciDesigner` render from, with an
 * **in-browser** compute service over `rows`. Used by the legacy inline-data path
 * (older threads / pins that captured their rows); the live-data path uses
 * `buildSnapshot` + a server-backed `apiService` instead.
 */
export function compileSurface(
  columns: string[],
  rows: Record<string, unknown>[],
  dsl: Record<string, unknown> | undefined,
  tableName: string,
): CompiledSurface {
  const { snapshot, table, error } = buildSnapshot(columns, rows, dsl, tableName);
  return { snapshot, table, error, api: createVinciApiService(rows) };
}
