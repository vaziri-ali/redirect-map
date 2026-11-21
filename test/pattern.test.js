import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileRegex,
  compileWildcard,
  expandTemplate,
  groupIndexForName,
  isWildcard,
  samplePath,
  templateReferences,
} from '../src/pattern.js';

const options = { ignoreTrailingSlash: true };

test('isWildcard recognises stars and named parameters', () => {
  assert.equal(isWildcard('/blog/*'), true);
  assert.equal(isWildcard('/blog/:slug'), true);
  assert.equal(isWildcard('/blog/post'), false);
  assert.equal(isWildcard('/a:b'), false);
});

test('named parameters match a single segment', () => {
  const { regex, names } = compileWildcard('/blog/:slug', options);
  assert.deepEqual(names, ['slug']);
  assert.ok(regex.test('/blog/hello'));
  assert.ok(regex.test('/blog/hello/'));
  assert.ok(!regex.test('/blog/hello/world'));
  assert.ok(!regex.test('/blog/'));
});

test('a star matches across segments', () => {
  const { regex } = compileWildcard('/docs/*', options);
  assert.deepEqual(regex.exec('/docs/a/b/c').slice(1), ['a/b/c']);
  assert.ok(regex.test('/docs/'));
  assert.ok(!regex.test('/docs'));
});

test('trailing slash handling follows the option', () => {
  assert.ok(compileWildcard('/a/:id/', options).regex.test('/a/1'));
  assert.ok(!compileWildcard('/a/:id', { ignoreTrailingSlash: false }).regex.test('/a/1/'));
});

test('literal characters are escaped', () => {
  const { regex } = compileWildcard('/a.b/(x)/*', options);
  assert.ok(regex.test('/a.b/(x)/z'));
  assert.ok(!regex.test('/aXb/(x)/z'));
});

test('duplicate parameter names are rejected', () => {
  assert.deepEqual(compileWildcard('/:a/:a', options), { error: 'DUPLICATE_PARAM', name: 'a' });
});

test('the decoded option keeps non-Latin text readable', () => {
  const { source } = compileWildcard('/خدمات/*', { ...options, decoded: true });
  assert.equal(source, '^/خدمات/(.*)$');
});

test('compileRegex counts groups and reports syntax errors', () => {
  assert.equal(compileRegex('^/p/(\\d+)/(\\w+)$').groupCount, 2);
  assert.equal(compileRegex('(').error, 'REGEX');
});

test('templateReferences lists numbered, named and group references', () => {
  const refs = templateReferences('/n/$1/:slug/$<year>/https://x.org:8080/a');
  assert.deepEqual(
    refs.map((ref) => ref.token),
    ['$1', ':slug', '$<year>'],
  );
});

test('expandTemplate substitutes captures', () => {
  const rule = { kind: 'wildcard', names: ['id', null], template: '/p/:id/rest/$2' };
  const match = compileWildcard('/old/:id/*', options).regex.exec('/old/7/a/b');
  assert.equal(expandTemplate(rule, match), '/p/7/rest/a/b');
});

test('expandTemplate supports :splat as the first star', () => {
  const rule = { kind: 'wildcard', names: [null], template: '/new/:splat' };
  const match = compileWildcard('/old/*', options).regex.exec('/old/x/y');
  assert.equal(expandTemplate(rule, match), '/new/x/y');
});

test('expandTemplate supports named groups in regex rules', () => {
  const { regex } = compileRegex('^/(?<year>\\d{4})/(\\w+)$');
  const rule = { kind: 'regex', template: '/archive/$<year>/$2' };
  assert.equal(expandTemplate(rule, regex.exec('/2020/post')), '/archive/2020/post');
});

test('groupIndexForName resolves names and the splat alias', () => {
  assert.equal(groupIndexForName(['a', null], 'a'), 1);
  assert.equal(groupIndexForName(['a', null], 'splat'), 2);
  assert.equal(groupIndexForName(['a'], 'missing'), -1);
});

test('samplePath produces a path the pattern matches', () => {
  const pattern = '/shop/:category/*';
  assert.ok(compileWildcard(pattern, options).regex.test(samplePath(pattern)));
});
