import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { addJoinToYaml } from './cubeYaml';

const J = { to: 'orders', relationship: 'many_to_one', sql: 'c.order_id = orders.id' };

describe('addJoinToYaml', () => {
  it('creates a joins key on a cube that has none', () => {
    const text = 'name: c\nsql: order_items\nmeasures:\n  - name: n\n    type: count\n';
    const doc = parse(addJoinToYaml(text, J));
    expect(doc.name).toBe('c');
    expect(doc.sql).toBe('order_items');
    expect(doc.joins).toEqual([J]);
  });

  it('appends to an existing joins sequence', () => {
    const text =
      'name: c\nsql: order_items\njoins:\n  - to: products\n    relationship: many_to_one\n    sql: c.product_id = products.id\n';
    const doc = parse(addJoinToYaml(text, J));
    expect(doc.joins).toHaveLength(2);
    expect(doc.joins[1]).toEqual(J);
  });

  it('preserves the rest of the cube (measures untouched)', () => {
    const text = 'name: c\nsql: order_items\nmeasures:\n  - name: n\n    type: count\n';
    const doc = parse(addJoinToYaml(text, J));
    expect(doc.measures).toEqual([{ name: 'n', type: 'count' }]);
  });
});
