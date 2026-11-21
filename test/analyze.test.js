import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codes, issueOf, run } from './helpers.js';

const finals = (report) =>
  report.output
    .filter((item) => item.kind === 'exact')
    .map((item) => [item.from.path, item.to?.path ?? null, item.status]);

test('a clean map has no errors or warnings', () => {
  const report = run(['/a,/b', '/c,/d']);
  assert.deepEqual(codes(report), []);
  assert.equal(report.stats.output, 2);
});

test('chains are flattened to the final destination', () => {
  const report = run(['/a,/b', '/b,/c', '/c,/d']);
  assert.deepEqual(finals(report), [
    ['/a', '/d', 301],
    ['/b', '/d', 301],
    ['/c', '/d', 301],
  ]);
  assert.equal(report.stats.chains, 2);
  assert.equal(issueOf(report, 'CHAIN').params.steps, 3);
});

test('a chain longer than five hops is an error', () => {
  const rows = Array.from({ length: 7 }, (_, i) => `/p${i},/p${i + 1}`);
  const chain = run(rows).issues.find((issue) => issue.code === 'CHAIN' && issue.line === 1);
  assert.equal(chain.severity, 'error');
});

test('the first hop decides the status of a flattened rule', () => {
  const report = run(['/a,/b,301', '/b,/c,302']);
  assert.deepEqual(finals(report)[0], ['/a', '/c', 301]);
});

test('a loop is reported once and removed from the output', () => {
  const report = run(['/a,/b', '/b,/a']);
  assert.equal(report.issues.filter((issue) => issue.code === 'LOOP').length, 1);
  assert.equal(report.stats.loops, 1);
  assert.equal(report.output.length, 0);
});

test('rows that lead into a loop are removed as well', () => {
  const report = run(['/x,/a', '/a,/b', '/b,/a']);
  assert.equal(report.output.length, 0);
  assert.equal(issueOf(report, 'LOOP_FEEDER').params.count, 1);
});

test('chains beyond the hop limit are rejected', () => {
  const rows = Array.from({ length: 6 }, (_, i) => `/p${i},/p${i + 1}`);
  const report = run(rows, { maxHops: 3 });
  assert.ok(codes(report).includes('TOO_MANY_HOPS'));
});

test('a redirect to itself is invalid, also through the trailing slash', () => {
  assert.ok(codes(run(['/a,/a/'])).includes('SELF_REDIRECT'));
  assert.ok(!codes(run(['/a,/a/'], { ignoreTrailingSlash: false })).includes('SELF_REDIRECT'));
});

test('repeated rows are duplicates, contradicting rows are conflicts', () => {
  const duplicate = run(['/a,/b', '/a,/b']);
  assert.equal(duplicate.stats.duplicates, 1);
  assert.equal(duplicate.stats.conflicts, 0);

  const conflict = run(['/a,/b', '/a,/c']);
  assert.equal(conflict.stats.conflicts, 1);
  assert.deepEqual(finals(conflict), [['/a', '/b', 301]]);
});

test('status 410 answers directly and ends chains', () => {
  const report = run(['/gone,410', '/a,/gone']);
  assert.deepEqual(finals(report), [
    ['/gone', null, 410],
    ['/a', null, 410],
  ]);
});

test('unsupported status codes fall back to the default', () => {
  const report = run(['/a,/b,999'], { defaultStatus: 308 });
  assert.equal(report.output[0].status, 308);
  assert.ok(codes(report).includes('BAD_STATUS'));
});

test('a missing target is an error unless the status is 410', () => {
  assert.ok(codes(run(['/a,301'])).includes('MISSING_TARGET'));
  assert.deepEqual(codes(run(['/a,410'])), []);
});

test('invalid URLs name the offending side', () => {
  const issue = issueOf(run(['mailto:x@y.co,/b']), 'INVALID_URL');
  assert.equal(issue.params.side, 'source');
});

test('the site is inferred from an absolute source and makes absolute targets relative', () => {
  const report = run(['https://example.com/a,https://example.com/b']);
  assert.equal(report.base.host, 'example.com');
  assert.ok(codes(report).includes('BASE_INFERRED'));
});

test('absolute and relative spellings of one page are the same page', () => {
  const report = run(['/a,/b', 'https://example.com/b,/c'], { base: 'example.com' });
  assert.equal(report.stats.chains, 1);
});

test('http targets on an https site are flagged', () => {
  const report = run(['/a,http://example.com/b'], { base: 'https://example.com' });
  assert.ok(codes(report).includes('HTTP_TARGET'));
});

test('five or more redirects to the home page are flagged, four are not', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => `/p${i},/`);
  assert.ok(codes(run(rows(5))).includes('ROOT_BULK'));
  assert.ok(!codes(run(rows(4))).includes('ROOT_BULK'));
});

test('temporary statuses are noted', () => {
  assert.equal(issueOf(run(['/a,/b,302', '/c,/d,307']), 'TEMP_STATUS').params.count, 2);
});

test('sources on another host are reported when the site is known', () => {
  const report = run(['https://other.org/a,/b'], { base: 'example.com' });
  assert.ok(codes(report).includes('FOREIGN_HOST'));
});

test('a rule matching a query string wins over the same path without one', () => {
  const report = run(['/sale?id=12,/offers/12', '/sale,/offers']);
  assert.equal(report.output.length, 2);
  assert.equal(report.ruleSet.match(report.output[0].from).to.path, '/offers/12');
});

test('wildcard rules are kept, in order, after the exact rules', () => {
  const report = run(['/blog/*,/articles/:splat', '/about-us,/about']);
  assert.deepEqual(
    report.output.map((item) => item.kind),
    ['exact', 'wildcard'],
  );
});

test('an exact rule redirecting into a wildcard rule is flattened through it', () => {
  const report = run(['/old,/blog/hello', '/blog/*,/articles/:splat']);
  assert.deepEqual(finals(report), [['/old', '/articles/hello', 301]]);
  assert.equal(report.stats.chains, 1);
});

test('a wildcard rule that redirects into itself is an error', () => {
  const report = run(['/a/*,/a/b/:splat']);
  assert.ok(codes(report).includes('PATTERN_LOOP'));
});

test('a wildcard rule redirecting into another redirect is a chain', () => {
  const report = run(['/a/*,/b/:splat', '/b/*,/c/:splat']);
  assert.ok(codes(report).includes('PATTERN_CHAIN'));
});

test('a later wildcard rule that an earlier one swallows is reported as shadowed', () => {
  const report = run(['/blog/*,/news/:splat', '/blog/2020/*,/archive/:splat']);
  assert.equal(issueOf(report, 'PATTERN_SHADOWED').line, 2);
});

test('catch-all rules are warned about', () => {
  assert.ok(codes(run(['/*,/home'])).includes('PATTERN_CATCHALL'));
});

test('regular expression rules are accepted but not probed', () => {
  const report = run(['~^/product/(\\d+)$,/p/$1']);
  assert.equal(report.output[0].kind, 'regex');
  assert.ok(codes(report).includes('REGEX_UNCHECKED'));
});

test('invalid pattern rules are rejected with a reason', () => {
  const reasons = (rows) =>
    run(rows)
      .issues.filter((i) => i.code === 'PATTERN_INVALID')
      .map((i) => i.params.reason);
  assert.deepEqual(reasons(['~(,/x']), ['REGEX']);
  assert.deepEqual(reasons(['/a/:id/:id,/b']), ['DUPLICATE_PARAM']);
  assert.deepEqual(reasons(['/a/*?x=1,/b']), ['QUERY_IN_PATTERN']);
  assert.deepEqual(reasons(['/a/:id,/b/:other']), ['UNKNOWN_REFERENCE']);
  assert.deepEqual(reasons(['~^/a/(\\d+)$,/b/$2']), ['UNKNOWN_REFERENCE']);
});

test('duplicate wildcard sources are detected', () => {
  assert.equal(run(['/a/*,/b/$1', '/a/*,/c/$1']).stats.conflicts, 1);
});

test('the issue list is ordered by severity', () => {
  const severities = run(['/a,/b,302', '/c,/c', '/d,/e,/f,g'].slice(0, 2)).issues.map(
    (i) => i.severity,
  );
  assert.deepEqual(
    severities,
    [...severities].sort(
      (a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b),
    ),
  );
});

test('stats add up for a mixed input', () => {
  const report = run(['/a,/b', '/c', '/d,/d', '/e,/f', '/e,/g']);
  assert.equal(report.stats.rows, 5);
  assert.equal(report.stats.invalid, 2);
  assert.equal(report.stats.conflicts, 1);
});
