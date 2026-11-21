import { prepare } from './shared.js';

/** @param {string | number} value */
function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * @param {import('../analyze.js').Report} report
 * @returns {import('./shared.js').GeneratedFile}
 */
export function generateCsv(report) {
  const { exact, patterns } = prepare(report);
  const rows = [
    ['source', 'destination', 'status'],
    ...exact.map((rule) => [`${rule.path}${rule.search}`, rule.to ?? '', rule.status]),
    ...patterns.map((rule) => [rule.text.from, rule.text.to, rule.status]),
  ];
  const text = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return { text, notes: [], filename: 'redirect-map.csv', mime: 'text/csv' };
}

/**
 * @param {import('../analyze.js').Report} report
 * @returns {import('./shared.js').GeneratedFile}
 */
export function generateJson(report) {
  const { exact, patterns } = prepare(report);
  const entries = [
    ...exact.map((rule) => ({
      type: 'exact',
      source: `${rule.path}${rule.search}`,
      destination: rule.to,
      status: rule.status,
    })),
    ...patterns.map((rule) => ({
      type: rule.kind,
      source: rule.text.from,
      destination: rule.text.to || null,
      status: rule.status,
    })),
  ];
  return {
    text: JSON.stringify(entries, null, 2),
    notes: [],
    filename: 'redirect-map.json',
    mime: 'application/json',
  };
}
