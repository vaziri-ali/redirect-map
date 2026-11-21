import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, toDot, toMermaid } from '../src/index.js';
import { run } from './helpers.js';

test('the graph contains chains and loops only', () => {
  const report = run(['/a,/b', '/b,/c', '/x,/y', '/p,/q', '/q,/p']);
  const { nodes, edges } = buildGraph(report);
  assert.deepEqual(
    nodes.map((node) => node.label),
    ['/a', '/b', '/c', '/p', '/q'],
  );
  assert.equal(edges.length, 4);
});

test('the final URL of a chain is marked terminal', () => {
  const { nodes } = buildGraph(run(['/a,/b', '/b,/c']));
  assert.deepEqual(
    nodes.map((node) => node.terminal),
    [false, false, true],
  );
});

test('a chain ending in 410 gets a gone node', () => {
  const { nodes } = buildGraph(run(['/a,/b', '/b,410']));
  assert.equal(nodes.at(-1).label, '410 Gone');
});

test('Mermaid output', () => {
  const text = toMermaid(buildGraph(run(['/a,/b', '/b,/c'])));
  assert.equal(
    text,
    ['flowchart LR', '  n1["/a"] -->|301| n2["/b"]', '  n2["/b"] -->|301| n3["/c"]'].join('\n'),
  );
});

test('Graphviz output escapes quotes', () => {
  const text = toDot(buildGraph(run(['/a%22b,/c', '/c,/d'])));
  assert.match(text, /^digraph redirects \{/);
  assert.match(text, /n1 -> n2 \[label="301"\];/);
});

test('an empty graph renders', () => {
  assert.equal(toMermaid(buildGraph(run(['/a,/b']))), 'flowchart LR');
});
