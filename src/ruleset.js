import { urlKey, parseUrl } from './url.js';
import { expandTemplate } from './pattern.js';
import { GONE } from './status.js';

/**
 * Result of looking a URL up in a rule set.
 * @typedef {{
 *   rule: import('./compile.js').Rule,
 *   status: number,
 *   to: import('./url.js').ParsedUrl | null,
 *   broken: boolean,
 * }} Match
 */

/**
 * Compiled rules with the lookup semantics servers use: exact sources win, then wildcard
 * and regex rules are tried in the order they were written. An exact source without a
 * query string matches the URL whatever query it carries.
 */
export class RuleSet {
  /**
   * @param {import('./compile.js').Rule[]} rules
   * @param {import('./url.js').Base} base
   * @param {{ ignoreTrailingSlash: boolean }} options
   */
  constructor(rules, base, { ignoreTrailingSlash }) {
    this.base = base;
    this.ignoreTrailingSlash = ignoreTrailingSlash;
    /** @type {Map<string, import('./compile.js').ExactRule>} */
    this.exact = new Map();
    /** @type {import('./compile.js').PatternRule[]} */
    this.patterns = [];
    /** @type {{ rule: import('./compile.js').Rule, first: import('./compile.js').Rule }[]} */
    this.duplicates = [];
    /** @type {import('./compile.js').Rule[]} rules that take part in matching, in source order */
    this.rules = [];

    const seen = new Map();
    for (const rule of rules) {
      const first = seen.get(rule.key);
      if (first) {
        this.duplicates.push({ rule, first });
        continue;
      }
      seen.set(rule.key, rule);
      this.rules.push(rule);
      if (rule.kind === 'exact') this.exact.set(rule.key, rule);
      else this.patterns.push(rule);
    }
  }

  /**
   * @param {import('./url.js').ParsedUrl} url
   * @returns {Match | null}
   */
  match(url) {
    const exact = this.#matchExact(url);
    if (exact) {
      return {
        rule: exact,
        status: exact.status,
        to: exact.status === GONE ? null : exact.to,
        broken: false,
      };
    }
    return this.#matchPattern(url);
  }

  #matchExact(url) {
    const direct = this.exact.get(urlKey(url, this.ignoreTrailingSlash));
    if (direct || !url.search) return direct;
    return this.exact.get(urlKey({ ...url, search: '' }, this.ignoreTrailingSlash));
  }

  #matchPattern(url) {
    for (const rule of this.patterns) {
      if (rule.host !== url.host) continue;
      const match = rule.regex.exec(url.path);
      if (!match) continue;
      if (rule.status === GONE) return { rule, status: GONE, to: null, broken: false };

      const parsed = parseUrl(expandTemplate(rule, match), this.base);
      return { rule, status: rule.status, to: parsed.url ?? null, broken: Boolean(parsed.error) };
    }
    return null;
  }
}
