import { analyze } from '../src/index.js';

/** Analyse rows given as an array of lines. */
export const run = (lines, options) => analyze(lines.join('\n'), options);

/** Codes of every issue in a report. */
export const codes = (report) => report.issues.map((issue) => issue.code);

export const issueOf = (report, code) => report.issues.find((issue) => issue.code === code);
