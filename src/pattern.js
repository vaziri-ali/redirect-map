import { canonicalPath } from './url.js';

const PARAM_NAME = /^[A-Za-z_][\w-]*/;
const TEMPLATE_TOKEN = /\$(\d+)|\$<(\w+)>|(?<![^/]):([A-Za-z_][\w-]*)/g;

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A wildcard source is any path containing `*` or a `:name` segment.
 * @param {string} text
 */
export function isWildcard(text) {
  return text.includes('*') || /(?<![^/]):[A-Za-z_]/.test(text);
}

/**
 * Translates `/blog/:slug/*` into an anchored regular expression. `:name` matches one
 * path segment, `*` matches anything (including slashes). Capture groups are numbered in
 * the order they appear; `names[i]` holds the name of group `i + 1`, or null for `*`.
 *
 * Servers such as Apache and Nginx match against the decoded path, so `decoded` keeps the
 * text as written instead of normalising it to its percent-encoded form.
 *
 * @param {string} text path starting with a slash
 * @param {{ ignoreTrailingSlash: boolean, decoded?: boolean }} options
 * @returns {{ regex: RegExp, source: string, names: (string | null)[] } | { error: string, name?: string }}
 */
export function compileWildcard(text, { ignoreTrailingSlash, decoded = false }) {
  let path = decoded ? text : canonicalPath(text);
  const endsWithWildcard = path.endsWith('*');
  if (ignoreTrailingSlash && path.length > 1 && !endsWithWildcard) {
    path = path.replace(/\/+$/, '') || '/';
  }

  const names = [];
  let source = '';
  for (let index = 0; index < path.length;) {
    const char = path[index];
    if (char === '*') {
      names.push(null);
      source += '(.*)';
      index += 1;
    } else if (char === ':' && (index === 0 || path[index - 1] === '/')) {
      const name = PARAM_NAME.exec(path.slice(index + 1))?.[0];
      if (!name) {
        source += escapeRegex(char);
        index += 1;
        continue;
      }
      if (names.includes(name)) return { error: 'DUPLICATE_PARAM', name };
      names.push(name);
      source += '([^/]+)';
      index += name.length + 1;
    } else {
      source += escapeRegex(char);
      index += 1;
    }
  }

  const slash = ignoreTrailingSlash && path !== '/' && !endsWithWildcard ? '/?' : '';
  const anchored = `^${source}${slash}$`;
  return { regex: new RegExp(anchored), source: anchored, names };
}

/**
 * @param {string} text regular expression source (without the leading `~`)
 * @returns {{ regex: RegExp, source: string, groupCount: number } | { error: string, message: string }}
 */
export function compileRegex(text) {
  try {
    const regex = new RegExp(text);
    return { regex, source: text, groupCount: new RegExp(`${text}|`).exec('').length - 1 };
  } catch (error) {
    return { error: 'REGEX', message: error.message };
  }
}

/**
 * Lists the references a target template makes to captured values.
 * @param {string} template
 * @returns {{ token: string, index?: number, name?: string, group?: string }[]}
 */
export function templateReferences(template) {
  return [...template.matchAll(TEMPLATE_TOKEN)].map(([token, index, group, name]) => ({
    token,
    ...(index !== undefined && { index: Number(index) }),
    ...(group !== undefined && { group }),
    ...(name !== undefined && { name }),
  }));
}

/**
 * Index (1-based) of the capture group a `:name` reference points to. `:splat` is accepted
 * as an alias of the first unnamed wildcard, which is how Netlify spells it.
 * @param {(string | null)[]} names
 * @param {string} name
 */
export function groupIndexForName(names, name) {
  const position = names.indexOf(name);
  if (position !== -1) return position + 1;
  return name === 'splat' ? names.indexOf(null) + 1 || -1 : -1;
}

/**
 * Rewrites every reference in a template. The replacer receives the matched token and
 * a description of it, and returns the replacement text.
 * @param {string} template
 * @param {(token: string, ref: { index?: number, group?: string, name?: string }) => string} replacer
 */
export function mapTemplate(template, replacer) {
  return template.replace(TEMPLATE_TOKEN, (token, index, group, name) =>
    replacer(token, {
      ...(index !== undefined && { index: Number(index) }),
      ...(group !== undefined && { group }),
      ...(name !== undefined && { name }),
    }),
  );
}

/**
 * Fills a target template with the values captured by a match.
 * @param {{ kind: string, names?: (string | null)[], template: string }} rule
 * @param {RegExpExecArray} match
 */
export function expandTemplate(rule, match) {
  return mapTemplate(rule.template, (token, { index, group, name }) => {
    if (index !== undefined) return match[index] ?? '';
    if (group !== undefined) return match.groups?.[group] ?? '';
    if (rule.kind !== 'wildcard') return token;
    const position = groupIndexForName(rule.names, name);
    return position === -1 ? token : match[position];
  });
}

/**
 * A concrete path that the wildcard source matches, used to probe a rule for loops
 * and chains without enumerating real URLs.
 * @param {string} text
 */
export function samplePath(text) {
  return canonicalPath(
    text.replace(/(?<![^/]):[A-Za-z_][\w-]*/g, 'sample').replace(/\*/g, 'sample/path'),
  );
}
