import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { run } from '../src/cli.js';

function capture() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    io: { stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => err.push(t) } },
    text: () => out.join(''),
    errors: () => err.join(''),
  };
}

async function fixture(contents) {
  const dir = await mkdtemp(join(tmpdir(), 'redirect-map-'));
  const path = join(dir, 'rules.csv');
  await writeFile(path, contents);
  return { dir, path };
}

test('prints help and exits 0 with --help, 2 without a command', async () => {
  const help = capture();
  assert.equal(await run(['--help'], help.io), 0);
  assert.match(help.text(), /Usage:/);

  const none = capture();
  assert.equal(await run([], none.io), 2);
});

test('analyze exits 1 when errors are found and 0 otherwise', async () => {
  const bad = await fixture('/a,/b\n/b,/a\n');
  const good = await fixture('/a,/b\n');
  const first = capture();
  assert.equal(await run(['analyze', bad.path], first.io), 1);
  assert.match(first.text(), /Redirect loop/);
  const second = capture();
  assert.equal(await run(['analyze', good.path], second.io), 0);
});

test('analyze --strict also fails on warnings', async () => {
  const { path } = await fixture('/a,/b\n/b,/c\n');
  assert.equal(await run(['analyze', path], capture().io), 0);
  assert.equal(await run(['analyze', path, '--strict'], capture().io), 1);
});

test('analyze --json prints machine readable output', async () => {
  const { path } = await fixture('/a,/b\n');
  const c = capture();
  await run(['analyze', path, '--json'], c.io);
  assert.equal(JSON.parse(c.text()).stats.output, 1);
});

test('analyze --lang fa prints Persian messages', async () => {
  const { path } = await fixture('/a,/a\n');
  const c = capture();
  await run(['analyze', path, '--lang', 'fa'], c.io);
  assert.match(c.text(), /ریدایرکت به خودش/);
});

test('generate writes to stdout or a file', async () => {
  const { dir, path } = await fixture('/a,/b\n');
  const c = capture();
  assert.equal(await run(['generate', path, '--format', 'nginx'], c.io), 0);
  assert.match(c.text(), /map \$uri \$rm_path/);

  const target = join(dir, 'out.conf');
  assert.equal(
    await run(['generate', path, '--format', 'apache', '--out', target], capture().io),
    0,
  );
  assert.match(await readFile(target, 'utf8'), /RewriteEngine On/);
});

test('generate reports skipped rules on stderr', async () => {
  const { path } = await fixture('/gone,410\n');
  const c = capture();
  await run(['generate', path, '--format', 'vercel'], c.io);
  assert.match(c.errors(), /Rule skipped/);
});

test('rejects unknown commands, formats and files', async () => {
  const { path } = await fixture('/a,/b\n');
  const unknown = capture();
  assert.equal(await run(['frobnicate', path], unknown.io), 2);
  assert.equal(await run(['generate', path, '--format', 'iis'], capture().io), 2);
  const missing = capture();
  assert.equal(await run(['analyze', join(tmpdir(), 'does-not-exist.csv')], missing.io), 1);
  assert.match(missing.errors(), /cannot read/);
});

test('rejects bad option values', async () => {
  const { path } = await fixture('/a,/b\n');
  assert.equal(await run(['analyze', path, '--max-hops', '0'], capture().io), 2);
  assert.equal(await run(['analyze', path, '--nope'], capture().io), 2);
});

test('trace prints each hop and the result', async () => {
  const { path } = await fixture('/a,/b\n/b,/c,302\n');
  const c = capture();
  assert.equal(await run(['trace', path, '/a'], c.io), 0);
  assert.match(c.text(), /301 {2}\/a -> \/b/);
  assert.match(c.text(), /Ends at \/c after 2 hop/);

  const loop = await fixture('/a,/b\n/b,/a\n');
  assert.equal(await run(['trace', loop.path, '/a'], capture().io), 1);
  const none = capture();
  await run(['trace', path, '/zzz'], none.io);
  assert.match(none.text(), /No rule applies/);
});

test('coverage lists uncovered URLs', async () => {
  const rules = await fixture('/a,/b\n');
  const urls = join(rules.dir, 'urls.csv');
  await writeFile(urls, 'url,clicks\n/a,10\n/missing,90\n');
  const c = capture();
  assert.equal(await run(['coverage', rules.path, urls], c.io), 1);
  assert.match(c.text(), /1 uncovered/);
  assert.match(c.text(), /90 of 100 clicks/);
});

test('graph prints mermaid or dot', async () => {
  const { path } = await fixture('/a,/b\n/b,/c\n');
  const mermaid = capture();
  await run(['graph', path], mermaid.io);
  assert.match(mermaid.text(), /^flowchart LR/);
  const dot = capture();
  await run(['graph', path, '--format', 'dot'], dot.io);
  assert.match(dot.text(), /^digraph/);
});

test('reads rules from standard input with -', async () => {
  const c = capture();
  const stdin = Readable.from(['/a,/b\n']);
  assert.equal(await run(['analyze', '-', '--json'], { ...c.io, stdin }), 0);
  assert.equal(JSON.parse(c.text()).stats.rows, 1);
});
