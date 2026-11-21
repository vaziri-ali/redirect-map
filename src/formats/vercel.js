import { safeDecode } from '../url.js';
import { mapTemplate } from '../pattern.js';
import { isGone, prepare, skipped } from './shared.js';

const PATH_TO_REGEXP_SPECIAL = /[\\+*?{}():]/g;

/** Characters path-to-regexp treats as syntax must be escaped in literal paths. */
const escapeLiteral = (path) => path.replace(PATH_TO_REGEXP_SPECIAL, '\\$&');

/** Translates a wildcard path segment by segment; returns null for shapes Vercel cannot spell. */
function vercelSource(path) {
  const segments = path.split('/');
  const out = [];
  for (const [position, segment] of segments.entries()) {
    if (/^:[A-Za-z_][\w-]*$/.test(segment)) out.push(segment);
    else if (segment === '*' && position === segments.length - 1) out.push(':path*');
    else if (/[*:]/.test(segment)) return null;
    else out.push(escapeLiteral(segment));
  }
  return out.join('/');
}

function vercelDestination(rule) {
  let supported = true;
  const text = mapTemplate(rule.template, (token, { index, name }) => {
    if (index !== undefined) {
      const label = rule.names[index - 1];
      if (label === undefined) {
        supported = false;
        return token;
      }
      return label === null ? ':path*' : `:${label}`;
    }
    return name === 'splat' ? ':path*' : token;
  });
  return supported ? text : null;
}

function exactEntry(rule) {
  const entry = {
    source: escapeLiteral(safeDecode(rule.path)),
    destination: rule.to,
    statusCode: rule.status,
  };
  if (rule.search) {
    entry.has = [...new URLSearchParams(rule.search)].map(([key, value]) => ({
      type: 'query',
      key,
      value,
    }));
  }
  return entry;
}

/**
 * `vercel.json` redirects. Exact paths are decoded because Vercel matches the readable
 * path; wildcard rules use `:name` and `:path*`.
 *
 * @param {import('../analyze.js').Report} report
 * @returns {import('./shared.js').GeneratedFile}
 */
export function generateVercel(report) {
  const { exact, patterns } = prepare(report);
  const notes = [];
  const redirects = [];

  for (const rule of exact) {
    if (rule.to === null) notes.push(skipped(rule, 'GONE_NOT_SUPPORTED'));
    else redirects.push(exactEntry(rule));
  }

  for (const rule of patterns) {
    if (rule.kind === 'regex') {
      notes.push(skipped(rule, 'REGEX_NOT_SUPPORTED'));
    } else if (isGone(rule)) {
      notes.push(skipped(rule, 'GONE_NOT_SUPPORTED'));
    } else {
      const source = vercelSource(safeDecode(rule.path));
      const destination = vercelDestination(rule);
      if (source === null) notes.push(skipped(rule, 'WILDCARD_POSITION'));
      else if (destination === null) notes.push(skipped(rule, 'NAMED_GROUP'));
      else redirects.push({ source, destination, statusCode: rule.status });
    }
  }

  return {
    text: JSON.stringify({ redirects }, null, 2),
    notes,
    filename: 'vercel.json',
    mime: 'application/json',
  };
}
