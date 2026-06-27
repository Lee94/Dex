import { dslToSnapshot } from '@/vinci/dsl';
import { starterSurfaceDoc } from '@/vinci/starterDsl';
import { createVinciApiService } from '@/vinci/vinciCompute';
import { buildVinciTableSnapshot } from '@/vinci/vinciTable';

/** The snapshot/table/api trio the vinci `VinciViewer` / `VinciDesigner` consume. */
export type CompiledSurface = {
  /** The compiled vinci model snapshot, or null when it couldn't be built. */
  snapshot: unknown | null;
  /** The in-memory table snapshot (also needed to decompile edits back to DSL). */
  table: unknown;
  /** The in-browser compute service over the rows (aggregation happens here). */
  api: ReturnType<typeof createVinciApiService>;
  /** Set when `dslToSnapshot` threw (a malformed/incompatible DSL). */
  error?: unknown;
};

/**
 * Compile a vinci surface DSL + the upstream SQL rows into the trio both the
 * read-only `VinciViewer` and the editable `VinciDesigner` render from. Data is
 * aggregated in-browser per the DSL — nothing is queried here. With no DSL we fall
 * back to a starter chart inferred from the columns.
 *
 * Pure (no React) so the viewer and the edit modal share one code path.
 */
export function compileSurface(
  columns: string[],
  rows: Record<string, unknown>[],
  dsl: Record<string, unknown> | undefined,
  tableName: string,
): CompiledSurface {
  const table = buildVinciTableSnapshot(columns, rows, tableName || 'data');
  const api = createVinciApiService(rows);
  const surface = dsl ?? starterSurfaceDoc(columns, rows);
  if (!surface) return { snapshot: null, table, api };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = dslToSnapshot({ ...(surface as any), table } as any);
    return { snapshot, table, api };
  } catch (e) {
    return { snapshot: null, table, api, error: e };
  }
}
