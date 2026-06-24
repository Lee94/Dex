/**
 * Data context a user attaches to a question via the composer's "+" menu — a
 * database, a table, or a semantic model. Kept separate from the picker
 * component so both it and the composer can import the type + the prompt helper
 * without tripping React Fast Refresh's component-only-export rule.
 *
 * For a non-builtin source/table the attachment carries the `sourceId` + dialect
 * so `contextPrefix` can tell the agent which `datasourceId` to pass to its SQL
 * tools (see the agent instructions); a builtin attachment needs none of that
 * (the agent's default warehouse already covers it).
 */
export type Attachment =
  | {
      key: string;
      kind: 'datasource';
      label: string;
      ref: string;
      sourceId: string;
      dialect: string;
      builtin: boolean;
    }
  | {
      key: string;
      kind: 'table';
      label: string;
      ref: string;
      source: string;
      sourceId: string;
      dialect: string;
      builtin: boolean;
    }
  | { key: string; kind: 'model'; label: string; ref: string };

/** Fold the attached context into a short preamble prepended to the question. */
export function contextPrefix(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';
  const lines = attachments.map((a) => {
    if (a.kind === 'model') {
      return `- Semantic model: "${a.ref}" — prefer answering via query_semantic on this model.`;
    }
    if (a.kind === 'table') {
      return a.builtin
        ? `- Table: "${a.ref}" (in the primary warehouse).`
        : `- Table: "${a.ref}" in data source "${a.source}" — query it by passing datasourceId "${a.sourceId}" (a ${a.dialect} database) to list_tables / describe_table / run_sql.`;
    }
    return a.builtin
      ? `- Data source: "${a.label}" (the primary warehouse).`
      : `- Data source: "${a.label}" — query it by passing datasourceId "${a.sourceId}" (a ${a.dialect} database) to the SQL tools.`;
  });
  return `Focus on the following data the user selected:\n${lines.join('\n')}\n\n`;
}
