const lineList = (lines, f) => f.list(lines.map((line) => `line ${f.n(line)}`));

const INVALID_ROW = {
  MISSING_TARGET: 'The row has no target. Expected "source, target".',
  MULTIPLE_ARROWS: 'The row contains more than one arrow.',
  TOO_MANY_COLUMNS:
    'More than three columns. Separate with commas or tabs, or write spaces inside URLs as %20.',
};

const INVALID_URL = {
  EMPTY: 'is empty',
  UNSUPPORTED_SCHEME: 'uses a scheme other than http or https',
  NO_PATH: 'has no path',
  INVALID: 'is not a valid URL',
};

const PATTERN_INVALID = {
  REGEX: (p) => `The regular expression is invalid: ${p.message}`,
  DUPLICATE_PARAM: (p) => `The parameter :${p.name} is used twice in the source.`,
  QUERY_IN_PATTERN: 'Wildcard sources match the path only and cannot contain a query string.',
  UNKNOWN_REFERENCE: (p) => `The target refers to ${p.token}, which the source does not capture.`,
  INVALID_HOST: 'The host in the source is not valid.',
};

const SKIPPED = {
  TOO_MANY_GROUPS: 'it captures more than nine groups, the most this format can reference',
  REGEX_NOT_ANCHORED: 'its regular expression does not start with ^/',
  NAMED_GROUP: 'its target uses a named group this format cannot express',
  UNSAFE_CHARACTERS: 'it contains characters that cannot be quoted safely in this format',
  QUERY_NOT_SUPPORTED: 'this format cannot match on a query string',
  GONE_NOT_SUPPORTED: 'this format has no way to answer with 410 Gone',
  REGEX_NOT_SUPPORTED: 'this format does not support regular expressions',
  WILDCARD_POSITION: 'this format only allows one wildcard, at the end of the path',
};

export default {
  locale: 'en',
  direction: 'ltr',
  issues: {
    ROW_LIMIT: (p, f) => ({
      title: `Only the first ${f.n(p.max)} rows were read`,
      detail: 'Split the file into smaller parts.',
    }),
    BASE_INVALID: () => ({
      title: 'The site address is not valid',
      detail: 'It was ignored; the site was detected from the data instead.',
    }),
    BASE_INFERRED: (p) => ({ title: `Site detected from the first absolute source: ${p.host}` }),
    INVALID_ROW: (p) => ({
      title: 'Row could not be read',
      detail: INVALID_ROW[p.reason],
      evidence: p.raw,
    }),
    INVALID_URL: (p) => ({
      title: `The ${p.side} ${INVALID_URL[p.reason]}`,
      evidence: p.raw,
    }),
    MISSING_TARGET: (p) => ({
      title: 'Missing target',
      detail: 'Use status 410 for pages that are gone for good.',
      evidence: p.raw,
    }),
    SELF_REDIRECT: (p) => ({
      title: 'Redirects to itself',
      evidence: p.url,
      fix: 'Remove the row or correct the target.',
    }),
    DUPLICATE: (p) => ({
      title: `Duplicate of line ${p.first}`,
      evidence: p.raw,
      fix: 'The repeated row is ignored.',
    }),
    CONFLICT: (p) => ({
      title: `Same source as line ${p.first} with a different target`,
      detail: 'Only the first row is used.',
      evidence: `${p.source} → ${p.targets.join('  |  ')}`,
      fix: 'Delete or correct one of the two rows.',
    }),
    LOOP: (p) => ({
      title: 'Redirect loop',
      detail: 'These URLs never reach a destination. The rows are left out of the output.',
      evidence: p.urls.join(' → '),
      fix: 'Break the cycle by removing one of its rows.',
    }),
    LOOP_FEEDER: (p, f) => ({
      title: `Rows leading into a loop: ${f.n(p.count)}`,
      detail: 'They are left out of the output as well.',
      evidence: lineList(p.lines, f),
    }),
    CHAIN: (p, f) => ({
      title: `Redirect chain of ${f.n(p.steps)} hops`,
      detail: p.final
        ? 'Every extra hop costs time and link equity.'
        : 'The chain ends on a page that is gone (410); the source is answered with 410 directly.',
      evidence: p.path.join(' → '),
      fix: p.final
        ? `Send the source straight to ${p.final}. The output already does.`
        : 'Remove the source or give it a live replacement.',
    }),
    TOO_MANY_HOPS: (p, f) => ({
      title: `More than ${f.n(p.limit)} hops`,
      evidence: p.path.join(' → '),
    }),
    BROKEN_TARGET: (p) => ({
      title: 'A rule in the chain produces an invalid target',
      evidence: p.path.join(' → '),
    }),
    BAD_STATUS: (p, f) => ({
      title: `Unsupported status codes: ${f.n(p.count)}`,
      detail: `Supported: 301, 302, 303, 307, 308 and 410. ${p.fallback} was used instead.`,
      evidence: lineList(p.lines, f),
    }),
    TEMP_STATUS: (p, f) => ({
      title: `Temporary redirects (302, 303, 307): ${f.n(p.count)}`,
      detail: 'For a page that moved for good, 301 or 308 is the better signal.',
      evidence: lineList(p.lines, f),
    }),
    HTTP_TARGET: (p, f) => ({
      title: `Targets using http:// on an https site: ${f.n(p.count)}`,
      detail: 'Each one adds a second redirect to https.',
      fix: 'Write the target with https://.',
      evidence: lineList(p.lines, f),
    }),
    ROOT_BULK: (p, f) => ({
      title: `Bulk redirects to the home page: ${f.n(p.count)}`,
      detail: 'Search engines can treat bulk redirects to the home page as soft 404 errors.',
      fix: 'Point each page at the closest relevant page, or answer 410 when there is none.',
      evidence: lineList(p.lines, f),
    }),
    FOREIGN_HOST: (p, f) => ({
      title: `Sources on a host other than ${p.host}: ${f.n(p.count)}`,
      detail: 'Only the path is used in the output. Deploy these rules on the other host.',
      evidence: lineList(p.lines, f),
    }),
    SPACES: (p, f) => ({
      title: `URLs containing spaces: ${f.n(p.count)}`,
      detail: 'Spaces were written as %20.',
      evidence: lineList(p.lines, f),
    }),
    HASH_IN_SOURCE: (p, f) => ({
      title: `Sources containing a #fragment: ${f.n(p.count)}`,
      detail: 'Servers never see the fragment, so it was removed from the source.',
      evidence: lineList(p.lines, f),
    }),
    BARE_DOMAIN: (p, f) => ({
      title: `Addresses without a scheme: ${f.n(p.count)}`,
      detail: 'They were read as domains and given https://. Start paths with a slash.',
      evidence: lineList(p.lines, f),
    }),
    NON_ASCII: (p, f) => ({
      title: `Sources with non-Latin characters: ${f.n(p.count)}`,
      detail: 'The output uses the form each platform expects (decoded or percent-encoded).',
      evidence: lineList(p.lines, f),
    }),
    EXTRA_COLUMNS: (p, f) => ({
      title: `Rows with extra columns: ${f.n(p.count)}`,
      detail: 'Only source, target and status were read.',
      evidence: lineList(p.lines, f),
    }),
    IGNORED_ROWS: (p, f) => ({
      title: `Skipped rows without a redirect target: ${f.n(p.count)}`,
    }),
    GONE_WITH_TARGET: (p, f) => ({
      title: `410 rows that also name a target: ${f.n(p.count)}`,
      detail: 'A 410 response has no target, so it was ignored.',
      evidence: lineList(p.lines, f),
    }),
    PATTERN_INVALID: (p) => {
      const reason = PATTERN_INVALID[p.reason];
      return {
        title: 'Invalid pattern rule',
        detail: typeof reason === 'function' ? reason(p) : reason,
        evidence: p.raw,
      };
    },
    PATTERN_LOOP: (p) => ({
      title: 'Pattern rule can loop',
      detail: `Tested with ${p.sample}; the redirects never settle.`,
      evidence: p.path.join(' → '),
    }),
    PATTERN_CHAIN: (p, f) => ({
      title: 'Pattern rule redirects into another redirect',
      detail: `Tested with ${p.sample}: ${f.n(p.steps)} hops.`,
      fix: p.final
        ? `Point the target at ${p.final} directly.`
        : 'Point the target at a live page.',
    }),
    PATTERN_SHADOWED: (p) => ({
      title: `Probably never applied: line ${p.by} matches first`,
      detail: `A URL such as ${p.sample} is handled by the earlier rule. Exact sources win over patterns, and patterns run in order.`,
    }),
    PATTERN_CATCHALL: (p) => ({
      title: 'Catch-all rule',
      detail: 'This rule matches every URL that no earlier rule handled.',
      evidence: p.source,
    }),
    REGEX_UNCHECKED: (p, f) => ({
      title: `Regular expression rules not tested for loops: ${f.n(p.count)}`,
      detail:
        'Only wildcard rules can be probed automatically. Use the tracer to check regex rules.',
      evidence: lineList(p.lines, f),
    }),
    RULE_SKIPPED: (p) => ({
      title: 'Rule skipped',
      detail: `Not emitted because ${SKIPPED[p.reason]}.`,
    }),
    LIMIT_EXCEEDED: (p, f) => ({
      title: `Too many ${p.kind} rules`,
      detail: `${f.n(p.count)} rules, but the platform allows ${f.n(p.limit)}.`,
    }),
  },
};
