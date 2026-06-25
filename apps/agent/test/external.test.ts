import test from 'node:test';
import assert from 'node:assert/strict';
import { setWebProvider, webExtract, webSearch, type WebProvider } from '../src/mastra/web';
import { deleteUpload, parseCsv, readFileContents, saveUpload } from '../src/mastra/db/uploads';

// External context (v1.1): web search/extract via a MOCK provider (no network),
// and reading uploaded text / CSV / image files.

const mockProvider: WebProvider = {
  name: 'mock',
  configured: true,
  async search(query, limit) {
    return Array.from({ length: limit }, (_, i) => ({
      title: `Result ${i + 1} for ${query}`,
      url: `https://example.com/${i + 1}`,
      snippet: `Snippet ${i + 1}`,
    }));
  },
  async extract(url) {
    return { url, title: 'Example', content: 'Extracted body text.' };
  },
};

test('webSearch returns marked, untrusted results from the provider', async () => {
  setWebProvider(mockProvider);
  try {
    const out = await webSearch('revenue benchmarks', 3);
    assert.equal(out.configured, true);
    if (!out.configured) return; // narrow
    assert.equal(out.untrusted, true);
    assert.equal(out.results.length, 3);
    assert.equal(out.results[0].url, 'https://example.com/1');
    assert.match(out.note, /[Uu]ntrusted/);
  } finally {
    setWebProvider(null);
  }
});

test('webExtract returns marked, untrusted page content', async () => {
  setWebProvider(mockProvider);
  try {
    const out = await webExtract('https://example.com/1');
    assert.equal(out.configured, true);
    if (!out.configured) return;
    assert.equal(out.untrusted, true);
    assert.equal(out.content, 'Extracted body text.');
  } finally {
    setWebProvider(null);
  }
});

test('web tools report cleanly when no provider is configured', async () => {
  setWebProvider({
    name: 'disabled',
    configured: false,
    async search() {
      throw new Error('nope');
    },
    async extract() {
      throw new Error('nope');
    },
  });
  try {
    const out = await webSearch('x');
    assert.equal(out.configured, false);
    assert.ok('message' in out);
  } finally {
    setWebProvider(null);
  }
});

test('parseCsv handles quotes and embedded commas', () => {
  const { columns, rows } = parseCsv('a,b\n1,"x,y"\n2,"he said ""hi"""');
  assert.deepEqual(columns, ['a', 'b']);
  assert.deepEqual(rows, [
    ['1', 'x,y'],
    ['2', 'he said "hi"'],
  ]);
});

test('readFileContents reads text, parses CSV, and notes binaries', async () => {
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

  const txt = await saveUpload({
    filename: 'notes.txt',
    mimetype: 'text/plain',
    contentBase64: b64('hello world'),
  });
  const csv = await saveUpload({
    filename: 'data.csv',
    mimetype: 'text/csv',
    contentBase64: b64('country,revenue\nUS,100\nUK,50'),
  });
  const img = await saveUpload({
    filename: 'pic.png',
    mimetype: 'image/png',
    contentBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
  });
  try {
    const text = await readFileContents(txt.id);
    assert.equal(text?.kind, 'text');
    assert.ok(text && text.kind === 'text' && text.content.includes('hello world'));
    assert.equal(text?.untrusted, true);

    const parsed = await readFileContents(csv.id);
    assert.equal(parsed?.kind, 'csv');
    if (parsed?.kind === 'csv') {
      assert.deepEqual(parsed.columns, ['country', 'revenue']);
      assert.equal(parsed.rowCount, 2);
      assert.equal(parsed.sampleRows[0].country, 'US');
    }

    const image = await readFileContents(img.id);
    assert.equal(image?.kind, 'binary');
    if (image?.kind === 'binary') assert.match(image.note, /[Ii]mage/);
  } finally {
    await deleteUpload(txt.id);
    await deleteUpload(csv.id);
    await deleteUpload(img.id);
  }
});
