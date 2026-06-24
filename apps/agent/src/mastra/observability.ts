import {
  Observability,
  ConsoleExporter,
  MastraStorageExporter,
  type BaseExporter,
} from '@mastra/observability';

/**
 * AI tracing for the analyst agent.
 *
 * Once this is wired into the `Mastra` instance (see `index.ts`), every agent
 * run, tool call, and model interaction automatically produces a span. Spans
 * nest into a per-request trace — `agent:analyst run → llm (model/tokens/latency)
 * → tool:* (inputs/outputs/timing)` — with **no** instrumentation needed in the
 * tools or the data layer.
 *
 * Exporters (both zero-dependency, no external backend required):
 *   - `MastraStorageExporter` — always on. Persists spans to Mastra's LibSQL
 *     store (`mastra.db`), so traces are browsable in Mastra Studio at
 *     http://localhost:4111 (`npm run dev`).
 *   - `ConsoleExporter` — prints spans to the terminal. Handy while developing,
 *     but noisy; turn it off with `DEX_TRACE_CONSOLE=false`.
 *
 * Env knobs:
 *   - `DEX_OBSERVABILITY=off` — master switch; disables tracing entirely
 *     (returns `undefined`, so Mastra falls back to its no-op observability).
 *   - `DEX_TRACE_CONSOLE=false` — drop the terminal exporter, keep Studio.
 *   - `OTEL_SERVICE_NAME` — service name shown in traces (default `dex-analyst`).
 *
 * Sensitive-data redaction is on by default: Mastra auto-applies a
 * `SensitiveDataFilter` span processor, so secrets in span payloads (API keys,
 * tokens, passwords) are scrubbed before they reach any exporter.
 */

const env = (key: string) => process.env[key]?.trim() || undefined;

/** Read a boolean-ish env flag; treats `0|false|off|no` (case-insensitive) as false. */
const flag = (key: string, fallback: boolean): boolean => {
  const v = env(key)?.toLowerCase();
  if (v === undefined) return fallback;
  return !['0', 'false', 'off', 'no'].includes(v);
};

/**
 * Build the configured `Observability` registry, or `undefined` when tracing is
 * switched off (`DEX_OBSERVABILITY=off`). Hand the result straight to the
 * `Mastra` constructor's `observability` field.
 */
export function buildObservability(): Observability | undefined {
  if (!flag('DEX_OBSERVABILITY', true)) return undefined;

  // MastraStorageExporter is the primary, low-noise path → Mastra Studio.
  const exporters: BaseExporter[] = [new MastraStorageExporter()];
  if (flag('DEX_TRACE_CONSOLE', true)) {
    exporters.push(new ConsoleExporter());
  }

  return new Observability({
    configs: {
      default: {
        serviceName: env('OTEL_SERVICE_NAME') || 'dex-analyst',
        exporters,
      },
    },
  });
}
