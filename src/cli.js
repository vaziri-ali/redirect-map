import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  FORMATS,
  analyze,
  buildGraph,
  coverage,
  describeIssue,
  formatUrl,
  generate,
  parseUrlList,
  simulate,
  toDot,
  toMermaid,
} from './index.js';

const HELP = `redirect-map - analyse, simplify and export redirect maps

Usage:
  redirect-map analyze  <rules> [options]
  redirect-map generate <rules> --format <name> [--out <file>]
  redirect-map trace    <rules> <url>
  redirect-map coverage <rules> <urls>
  redirect-map graph    <rules> [--format mermaid|dot]

<rules> and <urls> are file paths; use - to read standard input.

Options:
  --base <url>            site the rules belong to (default: detected from the data)
  --status <code>         status for rows without one: 301, 302, 307 or 308 (default 301)
  --keep-trailing-slash   treat /page and /page/ as different URLs
  --max-hops <n>          longest chain to follow (default 10)
  --format <name>         output format: ${Object.keys(FORMATS).join(', ')}
  --out <file>            write generated output to a file instead of stdout
  --lang <en|fa>          language of messages (default en)
  --json                  machine readable output (analyze, coverage)
  --strict                exit with status 1 on warnings too (analyze)
  -h, --help              show this help

Exit status: 0 success, 1 problems found, 2 usage error.
`;

const OPTIONS = {
  base: { type: 'string' },
  status: { type: 'string' },
  'keep-trailing-slash': { type: 'boolean' },
  'max-hops': { type: 'string' },
  format: { type: 'string' },
  out: { type: 'string' },
  lang: { type: 'string', default: 'en' },
  json: { type: 'boolean' },
  strict: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

class UsageError extends Error {}

async function readInput(path, stdin) {
  if (path !== '-') return readFile(path, 'utf8');
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function toAnalyzeOptions(values) {
  const options = { ignoreTrailingSlash: !values['keep-trailing-slash'] };
  if (values.base) options.base = values.base;
  if (values.status) options.defaultStatus = Number(values.status);
  if (values['max-hops']) {
    options.maxHops = Number(values['max-hops']);
    if (!Number.isInteger(options.maxHops) || options.maxHops < 1) {
      throw new UsageError('--max-hops must be a positive integer');
    }
  }
  return options;
}

function printIssues(report, lang, write) {
  const label = { error: 'error', warning: 'warn ', info: 'note ' };
  for (const issue of report.issues) {
    const { title, detail, evidence, fix } = describeIssue(issue, lang);
    const where = issue.line ? `line ${issue.line}`.padEnd(9) : ' '.repeat(9);
    write(`${label[issue.severity]} ${where} ${title}\n`);
    for (const extra of [detail, evidence, fix]) if (extra) write(`${' '.repeat(16)}${extra}\n`);
  }
  if (report.hiddenIssues) write(`... and ${report.hiddenIssues} more\n`);
}

function commandAnalyze(report, values, write) {
  if (values.json) {
    const { stats, issues } = report;
    write(`${JSON.stringify({ stats, issues }, null, 2)}\n`);
  } else {
    const { stats } = report;
    write(
      `${stats.rows} rows, ${stats.output} rules in the output (${stats.patterns} patterns), ` +
        `${stats.chains} chains, ${stats.loops} loops, ${stats.conflicts} conflicts\n\n`,
    );
    printIssues(report, values.lang, write);
  }
  const failing = report.issues.some(
    (issue) => issue.severity === 'error' || (values.strict && issue.severity === 'warning'),
  );
  return failing ? 1 : 0;
}

async function commandGenerate(report, values, io) {
  const file = generate(report, values.format ?? 'apache');
  for (const note of file.notes) {
    const { title, detail } = describeIssue(note, values.lang);
    const line = note.line ? ` (line ${note.line})` : '';
    io.stderr.write(`note: ${title}${line}${detail ? `: ${detail}` : ''}\n`);
  }
  if (values.out) await writeFile(values.out, `${file.text}\n`);
  else io.stdout.write(`${file.text}\n`);
  return 0;
}

function commandTrace(report, url, values, write) {
  const result = simulate(report, url, { maxHops: report.options.maxHops });
  if (result.error) throw new UsageError(`Cannot read "${url}" as a URL (${result.error})`);
  const show = (target) => formatUrl(target, report.base);

  for (const step of result.steps) {
    const to = step.to ? show(step.to) : '(gone)';
    write(`${step.status}  ${show(step.from)} -> ${to}   [line ${step.rule.line}]\n`);
  }
  if (!result.steps.length) write('No rule applies to this URL.\n');
  else if (result.loopAt !== null) write('Loop: the redirects never settle.\n');
  else if (result.truncated) write(`Stopped after ${report.options.maxHops} hops.\n`);
  else if (result.broken) write('A rule in the chain produced an invalid target.\n');
  else if (result.gone) write('Ends at 410 Gone.\n');
  else write(`Ends at ${show(result.final)} after ${result.steps.length} hop(s).\n`);
  return result.loopAt !== null || result.truncated ? 1 : 0;
}

function commandCoverage(report, entries, values, write) {
  const result = coverage(report, entries);
  if (values.json) {
    write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  const { summary } = result;
  write(
    `${summary.total} URLs: ${summary.covered} covered, ${summary.chain} via chains, ` +
      `${summary.loop} loops, ${summary.gone} gone, ${summary.uncovered} uncovered, ` +
      `${summary.invalid} unreadable\n`,
  );
  if (summary.totalClicks) {
    const share = ((summary.uncoveredClicks / summary.totalClicks) * 100).toFixed(1);
    write(
      `Uncovered URLs carry ${summary.uncoveredClicks} of ${summary.totalClicks} clicks (${share}%)\n`,
    );
  }
  for (const entry of result.uncovered.slice(0, 20)) {
    write(`  ${entry.clicks ?? '-'}\t${entry.url}\n`);
  }
  if (result.uncovered.length > 20) write(`  ... and ${result.uncovered.length - 20} more\n`);
  return summary.uncovered ? 1 : 0;
}

/**
 * Runs the command line interface.
 * @param {string[]} argv arguments after the executable name
 * @param {{ stdin?: NodeJS.ReadableStream, stdout?: { write(text: string): void }, stderr?: { write(text: string): void } }} [io]
 * @returns {Promise<number>} the process exit code
 */
export async function run(argv, io = {}) {
  const streams = {
    stdin: io.stdin ?? process.stdin,
    stdout: io.stdout ?? process.stdout,
    stderr: io.stderr ?? process.stderr,
  };
  const write = (text) => streams.stdout.write(text);

  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
    });
    const [command, rulesPath, extra] = positionals;
    if (values.help || !command || command === 'help') {
      write(HELP);
      return command || values.help ? 0 : 2;
    }
    if (!['analyze', 'generate', 'trace', 'coverage', 'graph'].includes(command)) {
      throw new UsageError(`Unknown command "${command}"`);
    }
    if (!rulesPath) throw new UsageError('Missing <rules> argument');
    if (values.format && !FORMATS[values.format] && command === 'generate') {
      throw new UsageError(`Unknown format "${values.format}"`);
    }

    const report = analyze(await readInput(rulesPath, streams.stdin), toAnalyzeOptions(values));
    switch (command) {
      case 'analyze':
        return commandAnalyze(report, values, write);
      case 'generate':
        return await commandGenerate(report, values, streams);
      case 'trace':
        if (!extra) throw new UsageError('Missing <url> argument');
        return commandTrace(report, extra, values, write);
      case 'coverage':
        if (!extra) throw new UsageError('Missing <urls> argument');
        return commandCoverage(
          report,
          parseUrlList(await readInput(extra, streams.stdin)),
          values,
          write,
        );
      default: {
        const graph = buildGraph(report);
        write(`${values.format === 'dot' ? toDot(graph) : toMermaid(graph)}\n`);
        return 0;
      }
    }
  } catch (error) {
    const usage = error instanceof UsageError || error.code?.startsWith('ERR_PARSE_ARGS');
    streams.stderr.write(
      `redirect-map: ${error.code === 'ENOENT' ? `cannot read ${error.path}` : error.message}\n`,
    );
    if (usage) streams.stderr.write('Run "redirect-map --help" for usage.\n');
    return usage ? 2 : 1;
  }
}
