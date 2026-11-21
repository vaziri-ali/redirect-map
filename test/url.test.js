import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBase, formatUrl, parseUrl, targetString, urlKey } from '../src/url.js';

const base = createBase('https://example.com');

test('createBase prefers the explicit address', () => {
  assert.equal(createBase('example.com/blog').origin, 'https://example.com');
  assert.equal(createBase('example.com').source, 'user');
});

test('createBase infers the site from the first absolute source', () => {
  const inferred = createBase('', ['/relative', 'https://shop.example.org/a']);
  assert.equal(inferred.host, 'shop.example.org');
  assert.equal(inferred.source, 'inferred');
});

test('createBase falls back to a placeholder and remembers a bad input', () => {
  const fallback = createBase('http://', ['/a']);
  assert.equal(fallback.source, 'none');
  assert.equal(fallback.invalidInput, true);
});

test('parseUrl resolves relative paths against the base', () => {
  const { url } = parseUrl('/blog/post?x=1', base);
  assert.equal(url.host, 'example.com');
  assert.equal(url.path, '/blog/post');
  assert.equal(url.search, '?x=1');
});

test('parseUrl accepts paths without a leading slash', () => {
  assert.equal(parseUrl('contact.html', base).url.path, '/contact.html');
});

test('parseUrl treats a bare domain as a host but not a file name', () => {
  const domain = parseUrl('example.org/page', base);
  assert.equal(domain.url.host, 'example.org');
  assert.deepEqual(domain.notes, ['BARE_DOMAIN']);
  assert.equal(parseUrl('index.html', base).url.host, 'example.com');
});

test('parseUrl encodes non-Latin paths consistently', () => {
  const encoded = parseUrl('/خدمات', base).url.path;
  assert.equal(encoded, '/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA');
  assert.equal(parseUrl(encoded, base).url.path, encoded);
});

test('parseUrl replaces spaces and reports it', () => {
  const result = parseUrl('/a b', base);
  assert.equal(result.url.path, '/a%20b');
  assert.deepEqual(result.notes, ['SPACES']);
});

test('parseUrl reports fragments', () => {
  assert.deepEqual(parseUrl('/a#top', base).notes, ['HASH']);
});

test('parseUrl rejects unusable input', () => {
  assert.equal(parseUrl('', base).error, 'EMPTY');
  assert.equal(parseUrl('mailto:a@b.co', base).error, 'UNSUPPORTED_SCHEME');
  assert.equal(parseUrl('?x=1', base).error, 'NO_PATH');
  assert.equal(parseUrl('https://user:pw@example.com/', base).error, 'INVALID');
});

test('parseUrl understands protocol-relative URLs', () => {
  assert.equal(parseUrl('//cdn.example.net/x', base).url.origin, 'https://cdn.example.net');
});

test('urlKey ignores a trailing slash only when asked', () => {
  const { url } = parseUrl('/page/', base);
  assert.equal(urlKey(url, true), 'example.com/page');
  assert.equal(urlKey(url, false), 'example.com/page/');
  assert.equal(urlKey(parseUrl('/', base).url, true), 'example.com/');
});

test('formatUrl hides the base host and decodes the path', () => {
  assert.equal(formatUrl(parseUrl('/%D8%AE', base).url, base), '/خ');
  assert.equal(formatUrl(parseUrl('https://other.org/a', base).url, base), 'https://other.org/a');
});

test('targetString is relative only when the host is unchanged', () => {
  const source = parseUrl('/a', base).url;
  assert.equal(targetString(parseUrl('/b?x=1', base).url, source), '/b?x=1');
  assert.equal(targetString(parseUrl('https://new.org/b', base).url, source), 'https://new.org/b');
});
