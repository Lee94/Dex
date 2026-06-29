import { apiFetch } from '@/lib/apiClient';
import type { SqlResult } from '@/types';

/**
 * Pins & reports client (v3.4). Talks to the agent's root `/reports/:threadId/pins`
 * REST routes (see apps/agent/src/mastra/server/report-routes.ts) via the shared
 * `apiFetch`, mirroring lib/dataSources.ts / lib/projects.ts: stateless helpers
 * that return data or throw. A "report" is just the ordered set of a thread's pins.
 */

export type PinKind = 'table' | 'chart';

/** Render snapshot for a table pin (a SqlResult plus its provenance). */
export interface TablePinPayload extends SqlResult {
  sql?: string;
  endorsed?: boolean;
}

/** Render snapshot for a chart pin (the vinci DSL over a captured source). */
export interface ChartPinPayload {
  dsl?: unknown;
  source?: SqlResult;
  label?: string;
}

export interface Pin {
  id: string;
  threadId: string;
  kind: PinKind;
  title: string;
  payload: Record<string, unknown>;
  position: number;
  createdAt: number;
}

/** What the thread surfaces when pinning a result/chart. */
export interface PinInput {
  kind: PinKind;
  title?: string;
  payload: Record<string, unknown>;
}

const base = (threadId: string) => `/reports/${encodeURIComponent(threadId)}/pins`;

export async function listPins(threadId: string): Promise<Pin[]> {
  const { pins } = await apiFetch<{ pins: Pin[] }>(base(threadId));
  return pins;
}

export async function createPin(threadId: string, input: PinInput): Promise<Pin> {
  const { pin } = await apiFetch<{ pin: Pin }>(base(threadId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return pin;
}

export async function deletePin(threadId: string, pinId: string): Promise<void> {
  await apiFetch(`${base(threadId)}/${encodeURIComponent(pinId)}`, { method: 'DELETE' });
}

export async function reorderPins(threadId: string, ids: string[]): Promise<Pin[]> {
  const { pins } = await apiFetch<{ pins: Pin[] }>(`${base(threadId)}/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ ids }),
  });
  return pins;
}

/** Serialize a report's pins to a Markdown document for export. */
export function reportToMarkdown(title: string, pins: Pin[]): string {
  const lines: string[] = [`# ${title}`, ''];
  for (const pin of pins) {
    lines.push(`## ${pin.title}`, '');
    if (pin.kind === 'table') {
      const p = pin.payload as Partial<TablePinPayload>;
      const cols = Array.isArray(p.columns) ? p.columns : [];
      const rows = Array.isArray(p.rows) ? p.rows : [];
      if (cols.length) {
        lines.push(`| ${cols.join(' | ')} |`);
        lines.push(`| ${cols.map(() => '---').join(' | ')} |`);
        for (const r of rows.slice(0, 100)) {
          lines.push(
            `| ${cols.map((c) => mdCell((r as Record<string, unknown>)[c])).join(' | ')} |`,
          );
        }
        if (rows.length > 100) lines.push('', `_…and ${rows.length - 100} more rows._`);
      }
      if (typeof p.sql === 'string' && p.sql.trim()) {
        lines.push('', '```sql', p.sql.trim(), '```');
      }
    } else {
      const p = pin.payload as ChartPinPayload;
      lines.push(`_Chart${p.label ? `: ${p.label}` : ''} (open the report to view)._`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function mdCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
