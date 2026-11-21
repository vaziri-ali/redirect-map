import { safeDecode, targetString } from '../url.js';
import { compileWildcard, groupIndexForName, mapTemplate } from '../pattern.js';
import { GONE } from '../status.js';

/**
 * @typedef {{ code: string, line: number | null, params: Record<string, unknown> }} FormatNote
 * @typedef {{ text: string, notes: FormatNote[], filename: string, mime: string }} GeneratedFile
 */

/** Maximum number of capture groups Apache and Nginx can reference (`$1` to `$9`). */
export const MAX_BACKREFERENCES = 9;

/**
 * Splits the report output into the two shapes generators care about.
 * @param {import('../analyze.js').Report} report
 */
export function prepare(report) {
  const exact = [];
  const patterns = [];
  for (const item of report.output) {
    if (item.kind !== 'exact') {
      patterns.push(item);
      continue;
    }
    exact.push({
      line: item.line,
      status: item.status,
      path: item.from.path,
      decoded: safeDecode(item.from.path),
      search: item.from.search,
      to: item.to ? targetString(item.to, item.from) : null,
    });
  }
  return {
    exact,
    patterns,
    ignoreTrailingSlash: report.options.ignoreTrailingSlash,
    base: report.base,
  };
}

/**
 * Regular expression source matched against the decoded path, which is what Apache and
 * Nginx do.
 * @param {import('../compile.js').PatternRule} rule
 * @param {boolean} ignoreTrailingSlash
 */
export function decodedSource(rule, ignoreTrailingSlash) {
  if (rule.kind === 'regex') return rule.source;
  return compileWildcard(safeDecode(rule.path), { ignoreTrailingSlash, decoded: true }).source;
}

/**
 * Target template using only numbered references (`$1`). Returns null when the template
 * relies on something the server cannot express, such as a named group.
 * @param {import('../compile.js').PatternRule} rule
 */
export function numberedTemplate(rule) {
  let supported = true;
  const text = mapTemplate(rule.template, (token, { index, group, name }) => {
    if (index !== undefined) return token;
    if (group !== undefined) {
      supported = false;
      return token;
    }
    if (rule.kind !== 'wildcard') return token;
    const position = groupIndexForName(rule.names, name);
    return position === -1 ? token : `$${position}`;
  });
  return supported ? text : null;
}

/** Servers append the incoming query string unless the target ends in `?`. */
export const dropQuery = (target) => (target.includes('?') ? target : `${target}?`);

/**
 * @param {string} text
 * @param {string} quote
 */
export const quoteIf = (text, quote = '"') =>
  /[\s"]/.test(text) ? `${quote}${text.replaceAll('"', '\\"')}${quote}` : text;

export const isGone = (rule) => rule.status === GONE;

/** @returns {FormatNote} */
export const skipped = (rule, reason) => ({
  code: 'RULE_SKIPPED',
  line: rule.line,
  params: { reason },
});
