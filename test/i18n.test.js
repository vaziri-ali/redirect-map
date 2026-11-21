import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, describeIssue, directionOf } from '../src/index.js';
import { MESSAGE_CODES } from '../src/i18n/index.js';

const SAMPLE_PARAMS = {
  count: 3,
  lines: [1, 2, 3],
  max: 10,
  host: 'example.com',
  raw: '/a',
  reason: 'INVALID',
  side: 'source',
  first: 1,
  source: '/a',
  targets: ['/b', '/c'],
  urls: ['/a', '/b'],
  path: ['/a', '/b'],
  final: '/b',
  steps: 2,
  limit: 5,
  fallback: 301,
  sample: '/x',
  by: 2,
  kind: 'static',
  token: '$2',
  message: 'oops',
  name: 'id',
  url: '/a',
};

test('every issue code has a message in every locale', () => {
  for (const locale of LOCALES) {
    for (const code of MESSAGE_CODES) {
      const reasons = ['INVALID', 'MISSING_TARGET', 'REGEX', 'TOO_MANY_GROUPS'];
      for (const reason of reasons) {
        const text = describeIssue({ code, params: { ...SAMPLE_PARAMS, reason } }, locale);
        assert.ok(text.title, `${locale}:${code}:${reason}`);
      }
    }
  }
});

test('unknown codes fall back to the code itself', () => {
  assert.equal(describeIssue({ code: 'NOPE' }).title, 'NOPE');
});

test('Persian output uses Persian digits and the right direction', () => {
  const text = describeIssue({ code: 'TEMP_STATUS', params: { count: 12, lines: [3, 4] } }, 'fa');
  assert.match(text.title, /۱۲/);
  assert.equal(directionOf('fa'), 'rtl');
  assert.equal(directionOf('en'), 'ltr');
});

test('long line lists are shortened', () => {
  const lines = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.match(describeIssue({ code: 'TEMP_STATUS', params: { count: 20, lines } }).evidence, /…$/);
});
