import { type ReactNode } from 'react';
import styles from './Markdown.module.css';

/**
 * Lightweight, dependency-free Markdown renderer for assistant answers.
 *
 * The analyst agent answers in Markdown (bold key numbers, bullet lists, inline
 * `code` for column/metric names, the occasional table). This renders a focused
 * GFM subset as real React elements — no `dangerouslySetInnerHTML`, so it's
 * XSS-safe, and any half-written markup mid-stream just shows as literal text
 * until it's closed.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className={className ? `${styles.md} ${className}` : styles.md}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

// ---- block model -------------------------------------------------------------

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; start: number; items: string[] }
  | { type: 'code'; lang: string; lines: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'table'; header: string[]; align: Align[]; rows: string[][] }
  | { type: 'hr' };

type Align = 'left' | 'right' | 'center' | '';

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const UL_ITEM = /^(\s*)[-*+]\s+(.*)$/;
const OL_ITEM = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?/;
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    UL_ITEM.test(line) ||
    OL_ITEM.test(line)
  );
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1][0];
      const close = new RegExp('^\\s*' + marker + '{3,}\\s*$');
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++; // skip the closing fence (no-op if the stream ended unclosed)
      blocks.push({ type: 'code', lang: fence[2] || '', lines: body });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // table: a row with a pipe followed by a `---|---` separator row
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const header = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]).map((cell) => {
        const l = cell.startsWith(':');
        const r = cell.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
      });
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i]))
        rows.push(splitRow(lines[i++]));
      blocks.push({ type: 'table', header, align, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ''));
      blocks.push({ type: 'quote', lines: body });
      continue;
    }

    if (UL_ITEM.test(line)) {
      const list = collectListItems(lines, i, UL_ITEM, (m) => m[2]);
      blocks.push({ type: 'ul', items: list.items });
      i = list.end;
      continue;
    }

    const ol = line.match(OL_ITEM);
    if (ol) {
      const list = collectListItems(lines, i, OL_ITEM, (m) => m[3]);
      blocks.push({ type: 'ol', start: parseInt(ol[2], 10), items: list.items });
      i = list.end;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i]))
      para.push(lines[i++]);
    blocks.push({ type: 'para', lines: para });
  }

  return blocks;
}

function collectListItems(
  lines: string[],
  start: number,
  item: RegExp,
  body: (m: RegExpMatchArray) => string,
): { items: string[]; end: number } {
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(item);
    if (!m) break;
    let text = body(m);
    i++;
    // continuation: indented lines that aren't a new list item or blank
    while (i < lines.length && /^\s+\S/.test(lines[i]) && !isBlockStart(lines[i])) {
      text += '\n' + lines[i].trim();
      i++;
    }
    items.push(text);
  }
  return { items, end: i };
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

// ---- block rendering ---------------------------------------------------------

function renderBlock(b: Block, idx: number): ReactNode {
  const key = `b${idx}`;
  switch (b.type) {
    case 'heading':
      return <Heading key={key} level={b.level} text={b.text} />;
    case 'para':
      return <p key={key}>{parseInline(b.lines.join('\n'), key)}</p>;
    case 'ul':
      return (
        <ul key={key}>
          {b.items.map((it, j) => (
            <li key={j}>{parseInline(it, `${key}-${j}`)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} start={b.start !== 1 ? b.start : undefined}>
          {b.items.map((it, j) => (
            <li key={j}>{parseInline(it, `${key}-${j}`)}</li>
          ))}
        </ol>
      );
    case 'code':
      return (
        <pre key={key} className={styles.pre}>
          <code>{b.lines.join('\n')}</code>
        </pre>
      );
    case 'quote':
      return <blockquote key={key}>{parseInline(b.lines.join('\n'), key)}</blockquote>;
    case 'hr':
      return <hr key={key} />;
    case 'table':
      return (
        <table key={key}>
          <thead>
            <tr>
              {b.header.map((h, j) => (
                <th key={j} style={b.align[j] ? { textAlign: b.align[j] } : undefined}>
                  {parseInline(h, `${key}-h${j}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {b.header.map((_, j) => (
                  <td key={j} style={b.align[j] ? { textAlign: b.align[j] } : undefined}>
                    {parseInline(row[j] ?? '', `${key}-${r}-${j}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

function Heading({ level, text }: { level: number; text: string }) {
  const children = parseInline(text, `h${level}`);
  switch (level) {
    case 1:
      return <h1>{children}</h1>;
    case 2:
      return <h2>{children}</h2>;
    case 3:
      return <h3>{children}</h3>;
    case 4:
      return <h4>{children}</h4>;
    case 5:
      return <h5>{children}</h5>;
    default:
      return <h6>{children}</h6>;
  }
}

// ---- inline rendering --------------------------------------------------------

// Ordered longest-delimiter-first. Emphasis spans require non-space edges so a
// stray `*` doesn't open an empty span; underscore emphasis needs word
// boundaries so identifiers like `completed_revenue` are left untouched.
const INLINE_SRC = [
  '`[^`\\n]+`', // inline code
  '\\[[^\\]\\n]+\\]\\([^)\\s]+\\)', // [text](url)
  '\\*\\*\\*(?=\\S)[^*\\n]*?(?<=\\S)\\*\\*\\*', // ***bold italic***
  '\\*\\*(?=\\S)[^*\\n]*?(?<=\\S)\\*\\*', // **bold**
  '(?<![\\w])__(?=\\S)[^_\\n]*?(?<=\\S)__(?![\\w])', // __bold__
  '~~(?=\\S)[^~\\n]*?(?<=\\S)~~', // ~~strike~~
  '\\*(?![*\\s])(?:[^*\\n]*?[^*\\s])?\\*', // *italic*
  '(?<![\\w])_(?![_\\s])(?:[^_\\n]*?[^_\\s])?_(?![\\w])', // _italic_
].join('|');

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  // Fresh regex per call so recursion (for nested emphasis) can't clobber lastIndex.
  const re = new RegExp(INLINE_SRC, 'g');
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(renderToken(m[0], `${keyPrefix}-i${k++}`));
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderToken(tok: string, key: string): ReactNode {
  if (tok.startsWith('`')) {
    return (
      <code key={key} className={styles.code}>
        {tok.slice(1, -1)}
      </code>
    );
  }
  if (tok.startsWith('[')) {
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
    if (m) {
      return (
        <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer">
          {parseInline(m[1], key)}
        </a>
      );
    }
  }
  if (tok.startsWith('***') && tok.endsWith('***')) {
    return (
      <strong key={key}>
        <em>{parseInline(tok.slice(3, -3), key)}</em>
      </strong>
    );
  }
  if (
    (tok.startsWith('**') && tok.endsWith('**')) ||
    (tok.startsWith('__') && tok.endsWith('__'))
  ) {
    return <strong key={key}>{parseInline(tok.slice(2, -2), key)}</strong>;
  }
  if (tok.startsWith('~~') && tok.endsWith('~~')) {
    return <del key={key}>{parseInline(tok.slice(2, -2), key)}</del>;
  }
  if ((tok.startsWith('*') && tok.endsWith('*')) || (tok.startsWith('_') && tok.endsWith('_'))) {
    return <em key={key}>{parseInline(tok.slice(1, -1), key)}</em>;
  }
  return tok;
}
