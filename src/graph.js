import { formatUrl, urlKey } from './url.js';

/**
 * @typedef {{ id: string, label: string, terminal: boolean }} GraphNode
 * @typedef {{ from: string, to: string, status: number }} GraphEdge
 */

/**
 * Builds the graph of every chain and loop found in a report. Nodes are URLs, edges are
 * redirects labelled with their status code.
 *
 * @param {import('./analyze.js').Report} report
 * @returns {{ nodes: GraphNode[], edges: GraphEdge[] }}
 */
export function buildGraph(report) {
  const { base, options } = report;
  const ids = new Map();
  const nodes = new Map();
  const edges = new Map();

  const nodeFor = (url, label = formatUrl(url, base)) => {
    const key = url ? urlKey(url, options.ignoreTrailingSlash) : `gone:${label}`;
    if (!ids.has(key)) {
      ids.set(key, `n${ids.size + 1}`);
      nodes.set(ids.get(key), { id: ids.get(key), label, terminal: true });
    }
    return ids.get(key);
  };

  for (const problem of report.problems) {
    for (const step of problem.steps) {
      const from = nodeFor(step.from);
      const to = step.to ? nodeFor(step.to) : nodeFor(null, `${step.status} Gone`);
      nodes.get(from).terminal = false;
      edges.set(`${from}>${to}`, { from, to, status: step.status });
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

const mermaidLabel = (text) => text.replaceAll('"', '#quot;');

/** @param {{ nodes: GraphNode[], edges: GraphEdge[] }} graph */
export function toMermaid({ nodes, edges }) {
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  const lines = ['flowchart LR'];
  for (const { from, to, status } of edges) {
    lines.push(
      `  ${from}["${mermaidLabel(labels.get(from))}"] -->|${status}| ${to}["${mermaidLabel(labels.get(to))}"]`,
    );
  }
  return lines.join('\n');
}

const dotLabel = (text) => text.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

/** @param {{ nodes: GraphNode[], edges: GraphEdge[] }} graph */
export function toDot({ nodes, edges }) {
  return [
    'digraph redirects {',
    '  rankdir=LR;',
    ...nodes.map((node) => `  ${node.id} [label="${dotLabel(node.label)}"];`),
    ...edges.map((edge) => `  ${edge.from} -> ${edge.to} [label="${edge.status}"];`),
    '}',
  ].join('\n');
}
