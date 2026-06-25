import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnly } from '../src/mastra/db/guard';

// The read-only guard is the universal gate every SQL path must pass — it must
// fail loudly on a regression, so it gets its own focused suite.

test('assertReadOnly accepts SELECT and WITH (any case / leading space)', () => {
  assert.doesNotThrow(() => assertReadOnly('SELECT 1'));
  assert.doesNotThrow(() => assertReadOnly('  select * from products'));
  assert.doesNotThrow(() => assertReadOnly('WITH x AS (SELECT 1) SELECT * FROM x'));
  // A trailing semicolon is tolerated and stripped.
  assert.equal(assertReadOnly('SELECT 1;'), 'SELECT 1');
});

test('assertReadOnly rejects DML / DDL', () => {
  for (const bad of [
    'DELETE FROM orders',
    'UPDATE orders SET status = 1',
    'INSERT INTO orders VALUES (1)',
    'DROP TABLE products',
    'ALTER TABLE products ADD c INT',
    'CREATE TABLE t (x INT)',
    'TRUNCATE orders',
  ]) {
    assert.throws(() => assertReadOnly(bad), new RegExp('.'), bad);
  }
});

test('assertReadOnly rejects multiple statements', () => {
  assert.throws(() => assertReadOnly('SELECT 1; DROP TABLE products'));
  assert.throws(() => assertReadOnly('SELECT 1; SELECT 2'));
});

test('assertReadOnly rejects empty and comments-only input', () => {
  assert.throws(() => assertReadOnly(''));
  assert.throws(() => assertReadOnly('    '));
  assert.throws(() => assertReadOnly('-- just a comment'));
  assert.throws(() => assertReadOnly('/* only a block comment */'));
});

test('assertReadOnly accepts SQL that starts with a comment', () => {
  // Regression: a leading `-- …` line used to be rejected ("must start with SELECT").
  assert.doesNotThrow(() =>
    assertReadOnly('-- 计算收盘价趋势\nSELECT trade_date, close_price FROM q'),
  );
  assert.doesNotThrow(() => assertReadOnly('/* header */ WITH x AS (SELECT 1) SELECT * FROM x'));
});

test('assertReadOnly ignores keywords/semicolons inside comments', () => {
  // "update"/";" living in a comment must not trip the guard.
  assert.doesNotThrow(() => assertReadOnly('SELECT 1 -- todo: update this later; soon'));
  // A `--` that lives inside a string literal is not treated as a comment.
  assert.doesNotThrow(() => assertReadOnly("SELECT '--' AS dashes"));
  // (Note: a DDL keyword inside a string literal is still conservatively rejected.)
  assert.throws(() => assertReadOnly("SELECT 'drop' AS word"));
});
