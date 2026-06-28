import { isSeq, parseDocument } from 'yaml';
import type { CubeJoinDef } from './dataSources';

/**
 * Merge a cube.js-style join into a cube's YAML text (the Model Studio's editor
 * content). Used by the visual "Add relation" dialog so the join flows back
 * through the normal YAML save + validation path rather than a second submit
 * route.
 *
 * Uses the `yaml` document API (not parse→object→stringify) so existing
 * comments / key order / formatting in the editor survive the edit. If a `joins`
 * sequence already exists the relation is appended; otherwise the key is created.
 */
export function addJoinToYaml(text: string, join: CubeJoinDef): string {
  const doc = parseDocument(text || '');
  const item = { to: join.to, relationship: join.relationship, sql: join.sql };
  const existing = doc.get('joins');
  if (isSeq(existing)) {
    existing.add(doc.createNode(item));
  } else {
    doc.set('joins', doc.createNode([item]));
  }
  return doc.toString();
}
