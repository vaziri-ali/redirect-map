const PLACEHOLDER_ORIGIN = 'https://redirect-map.invalid';

const FILE_EXTENSION =
  /\.(?:html?|php\d?|aspx?|jsp|cgi|xml|json|txt|css|js|pdf|png|jpe?g|gif|webp|svg|zip|csv|xlsx?|docx?)$/i;

/**
 * The site the rules are deployed on. Relative paths are resolved against it.
 * @typedef {{
 *   origin: string,
 *   host: string,
 *   protocol: string,
 *   source: 'user' | 'inferred' | 'none',
 *   invalidInput: boolean,
 * }} Base
 *
 * A normalised URL. `path` is always percent-encoded in its canonical form.
 * @typedef {{
 *   origin: string,
 *   host: string,
 *   protocol: string,
 *   path: string,
 *   search: string,
 *   hash: string,
 * }} ParsedUrl
 */

/**
 * Picks the site the rules belong to: the explicit option, else the first absolute
 * source URL, else a placeholder host so that relative paths still resolve.
 * @param {string | undefined} input
 * @param {string[]} [sourceCandidates] source columns of the parsed rules
 * @returns {Base}
 */
export function createBase(input, sourceCandidates = []) {
  const describe = (url, source, invalidInput = false) => ({
    origin: url.origin,
    host: url.host,
    protocol: url.protocol,
    source,
    invalidInput,
  });

  const text = String(input ?? '').trim();
  let invalidInput = false;
  if (text) {
    try {
      return describe(new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`), 'user');
    } catch {
      invalidInput = true;
    }
  }

  for (const candidate of sourceCandidates) {
    if (!/^https?:\/\//i.test(candidate)) continue;
    try {
      return describe(new URL(candidate), 'inferred', invalidInput);
    } catch {
      // Not a usable URL; try the next candidate.
    }
  }
  return describe(new URL(PLACEHOLDER_ORIGIN), 'none', invalidInput);
}

/** @param {string} pathname */
export function canonicalPath(pathname) {
  try {
    return encodeURI(decodeURI(pathname));
  } catch {
    return pathname;
  }
}

/** @param {string} value */
export function safeDecode(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

/** @param {string} segment */
function looksLikeHost(segment) {
  return (
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(segment) &&
    /\.[a-z]{2,}$/i.test(segment) &&
    !FILE_EXTENSION.test(segment)
  );
}

/**
 * @param {URL} url
 * @returns {ParsedUrl}
 */
function toParsed(url) {
  return {
    origin: url.origin,
    host: url.host,
    protocol: url.protocol,
    path: canonicalPath(url.pathname),
    search: url.search,
    hash: url.hash,
  };
}

/**
 * Parses an absolute URL, a protocol-relative URL or a site-relative path.
 * @param {string} text
 * @param {Base} base
 * @returns {{ url: ParsedUrl, notes: string[] } | { error: string }}
 */
export function parseUrl(text, base) {
  let value = String(text).trim();
  if (!value) return { error: 'EMPTY' };

  const notes = [];
  if (/\s/.test(value)) {
    notes.push('SPACES');
    value = value.replace(/\s+/g, '%20');
  }

  let url;
  try {
    if (/^https?:\/\//i.test(value)) {
      url = new URL(value);
    } else if (value.startsWith('//')) {
      url = new URL(`${base.protocol}${value}`);
    } else if (/^[a-z][a-z\d+.-]*:(?!\d+(?:[/?#]|$))/i.test(value)) {
      return { error: 'UNSUPPORTED_SCHEME' };
    } else if (/^[?#]/.test(value)) {
      return { error: 'NO_PATH' };
    } else if (value[0] !== '/' && looksLikeHost(value.split(/[/?#]/)[0])) {
      url = new URL(`https://${value}`);
      notes.push('BARE_DOMAIN');
    } else {
      url = new URL(value[0] === '/' ? value : `/${value}`, base.origin);
    }
  } catch {
    return { error: 'INVALID' };
  }

  if (url.username || url.password) return { error: 'INVALID' };
  if (url.hash) notes.push('HASH');
  return { url: toParsed(url), notes };
}

/**
 * Lookup key for a URL: host, canonical path and query.
 * @param {Pick<ParsedUrl, 'host' | 'path' | 'search'>} url
 * @param {boolean} ignoreTrailingSlash
 */
export function urlKey(url, ignoreTrailingSlash) {
  let { path } = url;
  if (ignoreTrailingSlash && path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return `${url.host}${path}${url.search}`;
}

/**
 * Human readable form. The host is omitted when it matches the base host.
 * @param {ParsedUrl} url
 * @param {Base} base
 */
export function formatUrl(url, base) {
  const origin = url.host === base.host ? '' : url.origin;
  return safeDecode(`${origin}${url.path}${url.search}${url.hash}`);
}

/**
 * Form used inside generated configuration: relative when the target lives on the
 * same host as the source, absolute otherwise. Keeps the encoded path.
 * @param {ParsedUrl} target
 * @param {ParsedUrl} source
 */
export function targetString(target, source) {
  const origin = target.host === source.host ? '' : target.origin;
  return `${origin}${target.path}${target.search}${target.hash}`;
}
