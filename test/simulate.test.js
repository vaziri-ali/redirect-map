import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/index.js';
import { run } from './helpers.js';

test('follows every hop and reports where it ends', () => {
  const report = run(['/a,/b', '/b,/c']);
  const result = simulate(report, '/a');
  assert.deepEqual(
    result.steps.map((step) => [step.from.path, step.to.path, step.status, step.rule.line]),
    [
      ['/a', '/b', 301, 1],
      ['/b', '/c', 301, 2],
    ],
  );
  assert.equal(result.final.path, '/c');
});

test('an URL no rule applies to has no steps', () => {
  assert.equal(simulate(run(['/a,/b']), '/other').steps.length, 0);
});

test('detects a loop and where it returns to', () => {
  const result = simulate(run(['/a,/b', '/b,/a']), '/a');
  assert.equal(result.loopAt, 0);
});

test('a chain leading into a loop reports the point of return', () => {
  const result = simulate(run(['/x,/a', '/a,/b', '/b,/a']), '/x');
  assert.equal(result.loopAt, 1);
});

test('stops at the hop limit', () => {
  const report = run(['/a,/b', '/b,/c', '/c,/d', '/d,/e']);
  const result = simulate(report, '/a', { maxHops: 2 });
  assert.equal(result.truncated, true);
  assert.equal(result.steps.length, 2);
});

test('ends at 410', () => {
  const result = simulate(run(['/a,/b', '/b,410']), '/a');
  assert.equal(result.gone, true);
});

test('matches wildcard rules and expands the target', () => {
  const report = run(['/old/:id/*,/new/:id/files/$2']);
  const result = simulate(report, '/old/7/a/b');
  assert.equal(result.final.path, '/new/7/files/a/b');
});

test('regex rules run in order after exact rules', () => {
  const report = run(['~^/p/(\\d+)$,/product/$1', '/p/5,/special']);
  assert.equal(simulate(report, '/p/5').final.path, '/special');
  assert.equal(simulate(report, '/p/9').final.path, '/product/9');
});

test('the query string does not stop a path rule from matching', () => {
  assert.equal(simulate(run(['/a,/b']), '/a?utm=1').final.path, '/b');
});

test('rejects text that is not a URL', () => {
  assert.equal(simulate(run(['/a,/b']), 'mailto:x@y.co').error, 'UNSUPPORTED_SCHEME');
});

test('rules for another host do not match', () => {
  const report = run(['https://old.org/a,https://new.org/a'], { base: 'old.org' });
  assert.equal(simulate(report, 'https://new.org/a').steps.length, 0);
});
