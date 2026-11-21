import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IssueCollector } from '../src/issues.js';
import { parseRules, splitDelimited } from '../src/parse.js';

const parse = (text, options) => {
  const issues = new IssueCollector();
  return { ...parseRules(text, issues, options), issues: issues.toArray() };
};

test('splitDelimited honours quotes', () => {
  assert.deepEqual(splitDelimited('a,"b,c","d ""e"""', ','), ['a', 'b,c', 'd "e"']);
});

test('reads the common separators', () => {
  const { rules } = parse(
    ['/a, /b', '/c; /d', '/e\t/f', '/g /h', '/i -> /j', '/k => /l', '/m → /n'].join('\n'),
  );
  assert.deepEqual(
    rules.map((rule) => [rule.from, rule.to]),
    [
      ['/a', '/b'],
      ['/c', '/d'],
      ['/e', '/f'],
      ['/g', '/h'],
      ['/i', '/j'],
      ['/k', '/l'],
      ['/m', '/n'],
    ],
  );
});

test('quotes protect a separator that appears inside a URL', () => {
  const [rule] = parse('/a,"/b;c"').rules;
  assert.equal(rule.to, '/b;c');
});

test('reads an optional status in every layout', () => {
  const { rules } = parse(['/a,/b,302', '/c /d 307', '/e -> /f 308'].join('\n'));
  assert.deepEqual(
    rules.map((rule) => rule.statusText),
    ['302', '307', '308'],
  );
});

test('a bare status after the source means 410', () => {
  const [rule] = parse('/gone, 410').rules;
  assert.equal(rule.to, '');
  assert.equal(rule.statusText, '410');
});

test('skips blank lines, comments and a byte order mark', () => {
  const { rules } = parse('\uFEFF# comment\n\n/a,/b');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].line, 3);
});

test('skips a header row', () => {
  assert.equal(parse('old,new\n/a,/b').rules.length, 1);
  assert.equal(parse('مبدأ,مقصد\n/a,/b').rules.length, 1);
});

test('reads a Screaming Frog style export by header names', () => {
  const csv = [
    'Address,Status Code,Status,Redirect URL',
    'https://example.com/a,301,Moved Permanently,https://example.com/b',
    'https://example.com/c,200,OK,',
    'https://example.com/d,302,Found,https://example.com/e',
  ].join('\n');
  const { rules, ignored } = parse(csv);
  assert.deepEqual(
    rules.map((rule) => [rule.from, rule.to, rule.statusText]),
    [
      ['https://example.com/a', 'https://example.com/b', '301'],
      ['https://example.com/d', 'https://example.com/e', '302'],
    ],
  );
  assert.equal(ignored, 1);
});

test('reports malformed rows with their line numbers', () => {
  const { issues } = parse('/a\n/a -> /b -> /c\n/a /b c d');
  assert.deepEqual(
    issues.map((issue) => [issue.code, issue.params.reason, issue.line]),
    [
      ['INVALID_ROW', 'MISSING_TARGET', 1],
      ['INVALID_ROW', 'MULTIPLE_ARROWS', 2],
      ['INVALID_ROW', 'TOO_MANY_COLUMNS', 3],
    ],
  );
});

test('stops at the row limit', () => {
  const { rules, issues } = parse('/a,/b\n/c,/d\n/e,/f', { maxRows: 2 });
  assert.equal(rules.length, 2);
  assert.equal(issues[0].code, 'ROW_LIMIT');
});

test('extra columns are noted once', () => {
  const { issues } = parse('/a,/b,301,x\n/c,/d,301,y');
  assert.equal(issues[0].code, 'EXTRA_COLUMNS');
  assert.equal(issues[0].params.count, 2);
});
