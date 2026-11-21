/**
 * A row as written by the user, before any URL is interpreted.
 * @typedef {{ line: number, from: string, to: string, statusText: string | undefined }} RawRule
 */

export const DEFAULT_MAX_ROWS = 50_000;

const FROM_HEADERS = [
  'old',
  'from',
  'source',
  'src',
  'old url',
  'source url',
  'address',
  'url',
  'مبدأ',
  'مبدا',
  'قدیم',
  'قدیمی',
];
const TO_HEADERS = [
  'new',
  'to',
  'target',
  'dest',
  'destination',
  'new url',
  'target url',
  'redirect url',
  'مقصد',
  'جدید',
];
const STATUS_HEADERS = ['status', 'status code', 'code', 'http status'];
const ARROW = /\s*(?:->|=>|→)\s*/;

/**
 * Splits one delimited line, honouring double quotes.
 * @param {string} line
 * @param {string} delimiter
 * @returns {string[]}
 */
export function splitDelimited(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"' && cell.trim() === '') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

/** Occurrences of `char` that are not inside double quotes. */
function countOutsideQuotes(line, char) {
  let count = 0;
  let quoted = false;
  for (const current of line) {
    if (current === '"') quoted = !quoted;
    else if (current === char && !quoted) count += 1;
  }
  return count;
}

const clean = (cell) =>
  cell
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();

/** @param {string} line */
function pickDelimiter(line) {
  const counts = [',', ';', '\t'].map((delimiter) => [delimiter, line.split(delimiter).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

const normaliseHeader = (cell) => clean(cell).toLowerCase().replace(/[_-]+/g, ' ');

/**
 * Recognises a header row of a spreadsheet export (Screaming Frog, Search Console,
 * hand-made sheets) and returns the column positions.
 * @param {string} line
 */
function detectHeader(line) {
  const delimiter = pickDelimiter(line);
  const cells = splitDelimited(line, delimiter).map(normaliseHeader);
  const find = (aliases) => cells.findIndex((cell) => aliases.includes(cell));

  const from = find(FROM_HEADERS);
  const to = find(TO_HEADERS);
  if (from === -1 || to === -1 || from === to) return null;
  return { delimiter, from, to, status: find(STATUS_HEADERS) };
}

/**
 * Free-form row: `a, b`, `a; b`, `a<TAB>b`, `a -> b 301`, `a b 301`, `a, 410`.
 * @param {string} line
 */
function readFreeRow(line) {
  let cells;
  let whitespaceSeparated = false;
  const arrow = line.split(ARROW);

  if (arrow.length > 2) return { error: 'MULTIPLE_ARROWS' };
  if (arrow.length === 2) {
    const tail = arrow[1].split(/\s+/);
    const hasStatus = tail.length > 1 && /^\d{3}$/.test(tail.at(-1));
    cells = hasStatus ? [arrow[0], tail.slice(0, -1).join(' '), tail.at(-1)] : arrow;
  } else {
    const delimiter = ['\t', ';', ','].find((char) => countOutsideQuotes(line, char) > 0);
    whitespaceSeparated = delimiter === undefined;
    cells = whitespaceSeparated ? line.split(/\s+/) : splitDelimited(line, delimiter);
  }
  cells = cells.map(clean);

  if (cells.length < 2) return { error: 'MISSING_TARGET' };
  if (whitespaceSeparated && cells.length > 3) return { error: 'TOO_MANY_COLUMNS' };

  const statusOnly = cells.length === 2 && /^\d{3}$/.test(cells[1]);
  return {
    from: cells[0],
    to: statusOnly ? '' : cells[1],
    statusText: statusOnly ? cells[1] : cells[2],
    extraColumns: !whitespaceSeparated && cells.length > 3,
  };
}

/**
 * Parses the textual rule list.
 *
 * @param {string} text
 * @param {import('./issues.js').IssueCollector} issues
 * @param {{ maxRows?: number }} [options]
 * @returns {{ rules: RawRule[], rowCount: number, ignored: number }}
 */
export function parseRules(text, issues, { maxRows = DEFAULT_MAX_ROWS } = {}) {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/);
  const rules = [];
  let header = null;
  let headerChecked = false;
  let rowCount = 0;
  let ignored = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith('#')) continue;

    if (!headerChecked) {
      headerChecked = true;
      header = detectHeader(raw);
      if (header) continue;
    }
    if (rowCount >= maxRows) {
      issues.add('ROW_LIMIT', 'error', { max: maxRows });
      break;
    }
    rowCount += 1;
    const line = index + 1;

    if (header) {
      const cells = splitDelimited(raw, header.delimiter).map(clean);
      const to = cells[header.to] ?? '';
      const statusText = header.status === -1 ? undefined : cells[header.status];
      if (!to && statusText !== '410') {
        ignored += 1;
        continue;
      }
      rules.push({ line, from: cells[header.from] ?? '', to, statusText });
      continue;
    }

    const row = readFreeRow(raw);
    if (row.error) {
      issues.add('INVALID_ROW', 'error', { reason: row.error, raw }, line);
      continue;
    }
    if (row.extraColumns) issues.group('EXTRA_COLUMNS', 'info', line);
    rules.push({ line, from: row.from, to: row.to, statusText: row.statusText });
  }

  if (ignored) issues.add('IGNORED_ROWS', 'info', { count: ignored });
  return { rules, rowCount, ignored };
}
