import { SUPPORTED_STATUSES, GONE } from './status.js';
import { parseUrl, urlKey, canonicalPath } from './url.js';
import {
  compileRegex,
  compileWildcard,
  isWildcard,
  templateReferences,
  groupIndexForName,
} from './pattern.js';

/**
 * A rule whose source is a single URL.
 * @typedef {{
 *   kind: 'exact', line: number, status: number, text: { from: string, to: string },
 *   from: import('./url.js').ParsedUrl, to: import('./url.js').ParsedUrl | null, key: string,
 * }} ExactRule
 *
 * A rule whose source is a wildcard path or a regular expression.
 * @typedef {{
 *   kind: 'wildcard' | 'regex', line: number, status: number, text: { from: string, to: string },
 *   host: string, path: string, regex: RegExp, source: string, names: (string | null)[],
 *   groupCount: number,
 *   template: string | null, key: string,
 * }} PatternRule
 *
 * @typedef {ExactRule | PatternRule} Rule
 */

/**
 * @param {string | undefined} text
 * @param {number} fallback
 * @param {import('./issues.js').IssueCollector} issues
 * @param {number} line
 */
function resolveStatus(text, fallback, issues, line) {
  if (text === undefined || text === '') return fallback;
  const status = Number(text);
  if (SUPPORTED_STATUSES.includes(status)) return status;
  issues.group('BAD_STATUS', 'warning', line, { fallback });
  return fallback;
}

/** @param {string} from */
function detectKind(from) {
  if (from.startsWith('~')) return 'regex';
  return isWildcard(from) ? 'wildcard' : 'exact';
}

function noteSourceIssues(notes, issues, line) {
  if (notes.includes('SPACES')) issues.group('SPACES', 'warning', line);
  if (notes.includes('BARE_DOMAIN')) issues.group('BARE_DOMAIN', 'info', line);
  if (notes.includes('HASH')) issues.group('HASH_IN_SOURCE', 'info', line);
}

function compileExact(raw, status, base, options, issues) {
  const fail = (code, params) => {
    issues.add(code, 'error', params, raw.line);
    return null;
  };

  const source = parseUrl(raw.from, base);
  if (source.error) {
    return fail('INVALID_URL', { side: 'source', reason: source.error, raw: raw.from });
  }
  noteSourceIssues(source.notes, issues, raw.line);
  const from = { ...source.url, hash: '' };

  let to = null;
  if (status === GONE) {
    if (raw.to) issues.group('GONE_WITH_TARGET', 'info', raw.line);
  } else {
    if (!raw.to) return fail('MISSING_TARGET', { raw: raw.from });
    const target = parseUrl(raw.to, base);
    if (target.error) {
      return fail('INVALID_URL', { side: 'target', reason: target.error, raw: raw.to });
    }
    if (target.notes.includes('SPACES')) issues.group('SPACES', 'warning', raw.line);
    if (target.notes.includes('BARE_DOMAIN')) issues.group('BARE_DOMAIN', 'info', raw.line);
    to = target.url;
  }

  const key = urlKey(from, options.ignoreTrailingSlash);
  if (to && urlKey(to, options.ignoreTrailingSlash) === key) {
    return fail('SELF_REDIRECT', { url: raw.from });
  }
  return {
    kind: 'exact',
    line: raw.line,
    status,
    text: { from: raw.from, to: raw.to },
    from,
    to,
    key,
  };
}

function splitHost(text, base) {
  const absolute = /^(https?:\/\/[^/?#]+)(\/.*)?$/i.exec(text);
  if (!absolute) return { host: base.host, path: text.startsWith('/') ? text : `/${text}` };
  try {
    return { host: new URL(absolute[1]).host, path: absolute[2] ?? '/' };
  } catch {
    return null;
  }
}

function compilePattern(raw, kind, status, base, options, issues) {
  const fail = (reason, extra = {}) => {
    issues.add('PATTERN_INVALID', 'error', { reason, raw: raw.from, ...extra }, raw.line);
    return null;
  };

  let host = base.host;
  let path;
  let regex;
  let source;
  let names = [];
  let groupCount;

  if (kind === 'regex') {
    path = raw.from.slice(1);
    const compiled = compileRegex(path);
    if (compiled.error) return fail(compiled.error, { message: compiled.message });
    ({ regex, source, groupCount } = compiled);
  } else {
    const parts = splitHost(raw.from, base);
    if (!parts) return fail('INVALID_HOST');
    if (parts.path.includes('?')) return fail('QUERY_IN_PATTERN');
    host = parts.host;
    path = canonicalPath(parts.path);
    const compiled = compileWildcard(path, options);
    if (compiled.error) return fail(compiled.error, { name: compiled.name });
    ({ regex, source, names } = compiled);
    groupCount = names.length;
  }

  let template = null;
  if (status === GONE) {
    if (raw.to) issues.group('GONE_WITH_TARGET', 'info', raw.line);
  } else {
    if (!raw.to) {
      issues.add('MISSING_TARGET', 'error', { raw: raw.from }, raw.line);
      return null;
    }
    template = raw.to;
    for (const reference of templateReferences(template)) {
      const unknownIndex = reference.index !== undefined && reference.index > groupCount;
      const unknownGroup =
        reference.group !== undefined && !new RegExp(`\\(\\?<${reference.group}>`).test(path);
      const unknownName =
        kind === 'wildcard' &&
        reference.name !== undefined &&
        groupIndexForName(names, reference.name) === -1;
      if (unknownIndex || unknownGroup || unknownName) {
        return fail('UNKNOWN_REFERENCE', { token: reference.token });
      }
    }
  }

  return {
    kind,
    line: raw.line,
    status,
    text: { from: raw.from, to: raw.to },
    host,
    path,
    regex,
    source,
    names,
    groupCount,
    template,
    key: `${kind}:${host}${path}`,
  };
}

/**
 * Turns the raw rows into validated rules. Rows that cannot be used are reported to
 * `issues` and left out of the result.
 *
 * @param {import('./parse.js').RawRule[]} rawRules
 * @param {import('./url.js').Base} base
 * @param {{ defaultStatus: number, ignoreTrailingSlash: boolean }} options
 * @param {import('./issues.js').IssueCollector} issues
 * @returns {Rule[]}
 */
export function compileRules(rawRules, base, options, issues) {
  const rules = [];
  for (const raw of rawRules) {
    const status = resolveStatus(raw.statusText, options.defaultStatus, issues, raw.line);
    const kind = detectKind(raw.from);
    const rule =
      kind === 'exact'
        ? compileExact(raw, status, base, options, issues)
        : compilePattern(raw, kind, status, base, options, issues);
    if (rule) rules.push(rule);
  }
  return rules;
}
