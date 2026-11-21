import { parseUrl } from './url.js';
import { trace } from './simulate.js';
import { splitDelimited } from './parse.js';

const URL_HEADERS = [
  'top pages',
  'page',
  'pages',
  'url',
  'urls',
  'address',
  'landing page',
  'صفحه',
  'صفحات برتر',
];
const CLICK_HEADERS = ['clicks', 'کلیک', 'کلیک ها'];
const IMPRESSION_HEADERS = ['impressions', 'نمایش', 'نمایش ها'];

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * @typedef {{ url: string, clicks: number | null, impressions: number | null }} UrlEntry
 */

/** Reads `1,234`, `1٬234` and Persian digits. Returns null for anything that is not a number. */
function toNumber(cell) {
  if (cell === undefined) return null;
  const text = cell
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[,٬\s]/g, '');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

const normalise = (cell) => cell.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/^"|"$/g, '');

/**
 * Parses a list of known URLs: one per line, or a Search Console / analytics export with
 * a header row naming a URL column and, optionally, clicks and impressions.
 *
 * @param {string} text
 * @returns {UrlEntry[]}
 */
export function parseUrlList(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (!lines.length) return [];

  const delimiter = [',', ';', '\t'].sort(
    (a, b) => lines[0].split(b).length - lines[0].split(a).length,
  )[0];
  const header = splitDelimited(lines[0], delimiter).map(normalise);
  const column = (names) => header.findIndex((cell) => names.includes(cell));
  const urlColumn = column(URL_HEADERS);

  if (urlColumn === -1) {
    return lines.map((line) => ({
      url: splitDelimited(line, delimiter)[0].trim(),
      clicks: null,
      impressions: null,
    }));
  }

  const clickColumn = column(CLICK_HEADERS);
  const impressionColumn = column(IMPRESSION_HEADERS);
  return lines.slice(1).map((line) => {
    const cells = splitDelimited(line, delimiter);
    return {
      url: (cells[urlColumn] ?? '').trim(),
      clicks: clickColumn === -1 ? null : toNumber(cells[clickColumn]),
      impressions: impressionColumn === -1 ? null : toNumber(cells[impressionColumn]),
    };
  });
}

/**
 * Checks which of the given URLs the redirect map handles.
 *
 * - `covered`: a single redirect to a final URL
 * - `chain`: redirected, but through more than one hop
 * - `loop` / `gone`: the redirect never resolves, or ends at a 410
 * - `uncovered`: no rule applies
 * - `invalid`: the URL could not be parsed
 *
 * @param {import('./analyze.js').Report} report
 * @param {UrlEntry[]} entries
 */
export function coverage(report, entries) {
  const results = entries.map((entry) => {
    const parsed = parseUrl(entry.url, report.base);
    if (parsed.error) return { ...entry, status: 'invalid', final: null };

    const result = trace(report.ruleSet, parsed.url, { maxHops: report.options.maxHops });
    let status = 'covered';
    if (!result.steps.length) status = 'uncovered';
    else if (result.loopAt !== null || result.truncated || result.broken) status = 'loop';
    else if (result.gone) status = 'gone';
    else if (result.steps.length > 1) status = 'chain';
    return { ...entry, status, final: result.steps.length ? result.final : null };
  });

  const count = (status) => results.filter((result) => result.status === status).length;
  const withClicks = results.filter((result) => result.clicks !== null);
  const totalClicks = withClicks.reduce((sum, result) => sum + result.clicks, 0);
  const uncoveredClicks = withClicks
    .filter((result) => result.status === 'uncovered')
    .reduce((sum, result) => sum + result.clicks, 0);

  const uncovered = results
    .filter((result) => result.status === 'uncovered')
    .sort(
      (a, b) =>
        (b.clicks ?? -1) - (a.clicks ?? -1) || (b.impressions ?? -1) - (a.impressions ?? -1),
    );

  return {
    summary: {
      total: results.length,
      covered: count('covered'),
      chain: count('chain'),
      loop: count('loop'),
      gone: count('gone'),
      uncovered: count('uncovered'),
      invalid: count('invalid'),
      totalClicks,
      uncoveredClicks,
    },
    results,
    uncovered,
  };
}
