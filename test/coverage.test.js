import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverage, parseUrlList } from '../src/index.js';
import { run } from './helpers.js';

test('parseUrlList reads one URL per line', () => {
  assert.deepEqual(parseUrlList('# list\n/a\n/b\n'), [
    { url: '/a', clicks: null, impressions: null },
    { url: '/b', clicks: null, impressions: null },
  ]);
});

test('parseUrlList reads a Search Console performance export', () => {
  const csv = [
    'Top pages,Clicks,Impressions,CTR,Position',
    'https://example.com/a,"1,200",30000,4%,5.1',
    'https://example.com/b,15,900,1.6%,9.9',
  ].join('\n');
  assert.deepEqual(parseUrlList(csv), [
    { url: 'https://example.com/a', clicks: 1200, impressions: 30000 },
    { url: 'https://example.com/b', clicks: 15, impressions: 900 },
  ]);
});

test('parseUrlList understands Persian digits and tab separators', () => {
  const [entry] = parseUrlList('Page\tClicks\n/a\t۱٬۲۰۰');
  assert.equal(entry.clicks, 1200);
});

test('parseUrlList returns nothing for empty input', () => {
  assert.deepEqual(parseUrlList('  \n'), []);
});

test('coverage classifies every URL', () => {
  const report = run(['/a,/b', '/b,/c', '/x,/y', '/y,/x', '/gone,410']);
  const { summary, results } = coverage(
    report,
    ['/a', '/y', '/x', '/gone', '/missing', 'mailto:a@b.co', '/c'].map((url) => ({
      url,
      clicks: null,
      impressions: null,
    })),
  );
  assert.deepEqual(
    results.map((result) => result.status),
    ['chain', 'loop', 'loop', 'gone', 'uncovered', 'invalid', 'uncovered'],
  );
  assert.equal(summary.uncovered, 2);
  assert.equal(summary.invalid, 1);
});

test('a single hop counts as covered', () => {
  const report = run(['/a,/b']);
  assert.equal(
    coverage(report, [{ url: '/a', clicks: 1, impressions: 1 }]).results[0].status,
    'covered',
  );
});

test('uncovered URLs are sorted by clicks and the traffic share is reported', () => {
  const report = run(['/a,/b']);
  const result = coverage(report, [
    { url: '/a', clicks: 100, impressions: 1 },
    { url: '/low', clicks: 5, impressions: 1 },
    { url: '/high', clicks: 50, impressions: 1 },
  ]);
  assert.deepEqual(
    result.uncovered.map((entry) => entry.url),
    ['/high', '/low'],
  );
  assert.equal(result.summary.totalClicks, 155);
  assert.equal(result.summary.uncoveredClicks, 55);
});

test('wildcard rules cover the URLs they match', () => {
  const report = run(['/blog/*,/news/:splat']);
  const { results } = coverage(report, [{ url: '/blog/post', clicks: null, impressions: null }]);
  assert.equal(results[0].status, 'covered');
  assert.equal(results[0].final.path, '/news/post');
});
