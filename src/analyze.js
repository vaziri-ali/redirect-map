import { IssueCollector } from './issues.js';
import { parseRules, DEFAULT_MAX_ROWS } from './parse.js';
import { createBase, formatUrl, parseUrl, safeDecode } from './url.js';
import { compileRules } from './compile.js';
import { RuleSet } from './ruleset.js';
import { trace, DEFAULT_MAX_HOPS } from './simulate.js';
import { samplePath } from './pattern.js';
import { GONE, REDIRECT_STATUSES, TEMPORARY_STATUSES } from './status.js';

const ROOT_BULK_THRESHOLD = 5;
const LONG_CHAIN_STEPS = 5;
const MAX_REPORTED_ISSUES = 500;

/**
 * @typedef {{
 *   base?: string,
 *   defaultStatus?: number,
 *   ignoreTrailingSlash?: boolean,
 *   maxHops?: number,
 *   maxRows?: number,
 * }} AnalyzeOptions
 *
 * An exact rule after its chain has been followed to the end.
 * @typedef {{
 *   kind: 'exact', line: number, from: import('./url.js').ParsedUrl,
 *   to: import('./url.js').ParsedUrl | null, status: number, steps: number, gone: boolean,
 * }} FlatRule
 *
 * @typedef {{
 *   options: Required<AnalyzeOptions>,
 *   base: import('./url.js').Base,
 *   ruleSet: RuleSet,
 *   output: (FlatRule | import('./compile.js').PatternRule)[],
 *   problems: Problem[],
 *   issues: import('./issues.js').Issue[],
 *   hiddenIssues: number,
 *   stats: Record<string, number>,
 * }} Report
 *
 * A chain or loop worth drawing.
 * @typedef {{
 *   line: number, nodes: import('./url.js').ParsedUrl[], steps: import('./simulate.js').Step[],
 *   loopAt: number | null, gone: boolean,
 * }} Problem
 */

function normaliseOptions(options) {
  return {
    base: options.base ?? '',
    defaultStatus: REDIRECT_STATUSES.includes(options.defaultStatus) ? options.defaultStatus : 301,
    ignoreTrailingSlash: options.ignoreTrailingSlash ?? true,
    maxHops: options.maxHops ?? DEFAULT_MAX_HOPS,
    maxRows: options.maxRows ?? DEFAULT_MAX_ROWS,
  };
}

/**
 * Duplicated sources are either harmless repeats or real contradictions.
 * @returns {{ duplicates: number, conflicts: number }}
 */
function reportDuplicates(ruleSet, issues) {
  let conflicts = 0;
  for (const { rule, first } of ruleSet.duplicates) {
    const sameTarget =
      rule.status === first.status &&
      (rule.kind === 'exact'
        ? rule.to?.host === first.to?.host &&
          rule.to?.path === first.to?.path &&
          rule.to?.search === first.to?.search
        : rule.template === first.template);

    if (sameTarget) {
      issues.add('DUPLICATE', 'warning', { first: first.line, raw: rule.text.from }, rule.line);
      continue;
    }
    conflicts += 1;
    issues.add(
      'CONFLICT',
      'error',
      {
        first: first.line,
        source: first.text.from,
        targets: [first.text.to || String(first.status), rule.text.to || String(rule.status)],
      },
      rule.line,
    );
  }
  return { duplicates: ruleSet.duplicates.length - conflicts, conflicts };
}

const pick = ({ nodes, steps, loopAt }) => ({ nodes, steps, loopAt });

/** Follows every exact rule to its final destination and flags chains and loops. */
function resolveExactRules(ruleSet, settings, issues) {
  const { base } = ruleSet;
  const show = (url) => formatUrl(url, base);
  const output = [];
  const problems = [];
  const cycles = new Map();
  const feeders = [];
  let chains = 0;

  for (const rule of ruleSet.rules) {
    if (rule.kind !== 'exact') continue;
    const result = trace(ruleSet, rule.from, { maxHops: settings.maxHops });
    const path = result.nodes.map(show);

    if (result.loopAt !== null) {
      const members = result.nodes.slice(result.loopAt, -1);
      const signature = members.map(show).sort().join('|');
      const isNewCycle = !cycles.has(signature);
      if (isNewCycle) cycles.set(signature, { line: rule.line, urls: path.slice(result.loopAt) });
      if (result.loopAt > 0) feeders.push(rule.line);
      // Every member of a cycle draws the same picture, so it is kept once.
      if (isNewCycle || result.loopAt > 0) {
        problems.push({ line: rule.line, ...pick(result), gone: false });
      }
      continue;
    }
    if (result.truncated) {
      issues.add('TOO_MANY_HOPS', 'error', { limit: settings.maxHops, path }, rule.line);
      continue;
    }
    if (result.broken) {
      issues.add('BROKEN_TARGET', 'error', { path }, rule.line);
      continue;
    }

    const steps = result.steps.length;
    const gone = result.gone;
    if (steps > 1) {
      chains += 1;
      issues.add(
        'CHAIN',
        steps > LONG_CHAIN_STEPS ? 'error' : 'warning',
        { steps, path, final: gone ? null : show(result.final) },
        rule.line,
      );
      problems.push({ line: rule.line, ...pick(result), gone });
    }
    output.push({
      kind: 'exact',
      line: rule.line,
      from: rule.from,
      to: gone ? null : result.final,
      status: gone ? GONE : rule.status,
      steps,
      gone,
    });
  }

  for (const { line, urls } of cycles.values()) issues.add('LOOP', 'error', { urls }, line);
  for (const line of feeders) issues.group('LOOP_FEEDER', 'warning', line);
  return { output, problems, chains, loops: cycles.size };
}

/**
 * Wildcard rules cannot be enumerated, so each one is probed with a concrete URL it
 * matches. That is enough to catch rules that redirect into themselves or into other
 * redirects, and rules an earlier rule makes unreachable.
 */
function checkPatterns(ruleSet, settings, issues) {
  const { base } = ruleSet;
  for (const rule of ruleSet.patterns) {
    if (rule.kind === 'regex') {
      issues.group('REGEX_UNCHECKED', 'info', rule.line);
      continue;
    }
    if (rule.path === '/*' && rule.status !== GONE) {
      issues.add('PATTERN_CATCHALL', 'warning', { source: rule.text.from }, rule.line);
    }

    const sample = parseUrl(
      rule.host === base.host
        ? samplePath(rule.path)
        : `${base.protocol}//${rule.host}${samplePath(rule.path)}`,
      base,
    );
    if (sample.error) continue;
    const result = trace(ruleSet, sample.url, { maxHops: settings.maxHops });
    const first = result.steps[0];
    const sampleText = formatUrl(sample.url, base);

    if (first && first.rule !== rule) {
      issues.add(
        'PATTERN_SHADOWED',
        'info',
        { by: first.rule.line, sample: sampleText },
        rule.line,
      );
      continue;
    }
    if (result.loopAt !== null || result.truncated) {
      const path = result.nodes.map((url) => formatUrl(url, base));
      issues.add('PATTERN_LOOP', 'error', { sample: sampleText, path }, rule.line);
    } else if (result.steps.length > 1) {
      issues.add(
        'PATTERN_CHAIN',
        'warning',
        {
          sample: sampleText,
          steps: result.steps.length,
          final: result.gone ? null : formatUrl(result.final, base),
        },
        rule.line,
      );
    }
  }
}

/** Findings that describe the map as a whole rather than one rule. */
function auditRules(ruleSet, output, issues) {
  const { base } = ruleSet;
  const rootTargets = [];

  for (const rule of ruleSet.rules) {
    if (TEMPORARY_STATUSES.includes(rule.status)) issues.group('TEMP_STATUS', 'info', rule.line);
    if (rule.kind !== 'exact') continue;

    if (base.source !== 'none' && rule.from.host !== base.host) {
      issues.group('FOREIGN_HOST', 'warning', rule.line, { host: base.host });
    }
    if (/[\u0080-\uffff]/.test(safeDecode(rule.from.path + rule.from.search))) {
      issues.group('NON_ASCII', 'info', rule.line);
    }
    if (rule.to?.protocol === 'http:' && base.protocol === 'https:' && rule.to.host === base.host) {
      issues.group('HTTP_TARGET', 'warning', rule.line);
    }
  }

  for (const item of output) {
    if (item.kind === 'exact' && item.to?.path === '/' && !item.to.search) {
      rootTargets.push(item.line);
    }
  }
  if (rootTargets.length >= ROOT_BULK_THRESHOLD) {
    for (const line of rootTargets) issues.group('ROOT_BULK', 'warning', line);
  }
}

/**
 * Analyses a redirect map written as text.
 *
 * @param {string} input
 * @param {AnalyzeOptions} [options]
 * @returns {Report}
 */
export function analyze(input, options = {}) {
  const settings = normaliseOptions(options);
  const issues = new IssueCollector();

  const parsed = parseRules(input, issues, { maxRows: settings.maxRows });
  const base = createBase(
    settings.base,
    parsed.rules.map((rule) => rule.from),
  );
  if (base.invalidInput) issues.add('BASE_INVALID', 'warning');
  if (base.source === 'inferred') issues.add('BASE_INFERRED', 'info', { host: base.host });

  const compiled = compileRules(parsed.rules, base, settings, issues);
  const ruleSet = new RuleSet(compiled, base, settings);
  const duplicates = reportDuplicates(ruleSet, issues);

  const exact = resolveExactRules(ruleSet, settings, issues);
  checkPatterns(ruleSet, settings, issues);
  auditRules(ruleSet, exact.output, issues);

  const patterns = ruleSet.patterns;
  const all = issues.toArray();
  const hiddenIssues = Math.max(0, all.length - MAX_REPORTED_ISSUES);
  const stats = {
    rows: parsed.rowCount,
    rules: ruleSet.rules.length,
    output: exact.output.length + patterns.length,
    patterns: patterns.length,
    chains: exact.chains,
    loops: exact.loops,
    duplicates: duplicates.duplicates,
    conflicts: duplicates.conflicts,
    invalid: parsed.rowCount - parsed.ignored - compiled.length,
  };

  return {
    options: settings,
    base,
    ruleSet,
    output: [...exact.output, ...patterns],
    problems: exact.problems,
    issues: all.slice(0, MAX_REPORTED_ISSUES),
    hiddenIssues,
    stats,
  };
}
