import { parseUrl, urlKey } from './url.js';
import { GONE } from './status.js';

export const DEFAULT_MAX_HOPS = 10;

/**
 * @typedef {{
 *   from: import('./url.js').ParsedUrl,
 *   rule: import('./compile.js').Rule,
 *   status: number,
 *   to: import('./url.js').ParsedUrl | null,
 * }} Step
 *
 * `nodes[0]` is the starting URL and `nodes[i]` the target of `steps[i - 1]`.
 * `loopAt` is the index in `nodes` that the chain returns to, if it does.
 * @typedef {{
 *   nodes: import('./url.js').ParsedUrl[],
 *   steps: Step[],
 *   final: import('./url.js').ParsedUrl,
 *   gone: boolean,
 *   loopAt: number | null,
 *   truncated: boolean,
 *   broken: boolean,
 * }} Trace
 */

/**
 * Follows redirects from `start` until a URL no rule applies to.
 * @param {import('./ruleset.js').RuleSet} ruleSet
 * @param {import('./url.js').ParsedUrl} start
 * @param {{ maxHops?: number }} [options]
 * @returns {Trace}
 */
export function trace(ruleSet, start, { maxHops = DEFAULT_MAX_HOPS } = {}) {
  const key = (url) => urlKey(url, ruleSet.ignoreTrailingSlash);
  const visited = new Map([[key(start), 0]]);
  const nodes = [start];
  const steps = [];
  const result = {
    nodes,
    steps,
    final: start,
    gone: false,
    loopAt: null,
    truncated: false,
    broken: false,
  };

  let current = start;
  while (steps.length < maxHops) {
    const match = ruleSet.match(current);
    if (!match) return result;

    steps.push({ from: current, rule: match.rule, status: match.status, to: match.to });
    if (match.status === GONE) {
      result.gone = true;
      return result;
    }
    if (match.broken || !match.to) {
      result.broken = true;
      return result;
    }

    current = match.to;
    nodes.push(current);
    result.final = current;
    const seenAt = visited.get(key(current));
    if (seenAt !== undefined) {
      result.loopAt = seenAt;
      return result;
    }
    visited.set(key(current), nodes.length - 1);
  }

  result.truncated = ruleSet.match(current) !== null;
  return result;
}

/**
 * Convenience wrapper for user supplied text.
 * @param {{ ruleSet: import('./ruleset.js').RuleSet, base: import('./url.js').Base }} report
 * @param {string} input
 * @param {{ maxHops?: number }} [options]
 * @returns {Trace | { error: string }}
 */
export function simulate(report, input, options) {
  const parsed = parseUrl(input, report.base);
  if (parsed.error) return { error: parsed.error };
  return trace(report.ruleSet, parsed.url, options);
}
