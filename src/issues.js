/**
 * @typedef {'error' | 'warning' | 'info'} Severity
 * @typedef {{ code: string, severity: Severity, line: number | null, params: Record<string, unknown> }} Issue
 */

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };

/**
 * Collects findings while a map is analysed. Repetitive findings (for example
 * "12 rows redirect with 302") are grouped into a single issue per code.
 */
export class IssueCollector {
  #single = [];
  #grouped = new Map();

  /**
   * @param {string} code
   * @param {Severity} severity
   * @param {Record<string, unknown>} [params]
   * @param {number | null} [line]
   */
  add(code, severity, params = {}, line = null) {
    this.#single.push({ code, severity, line, params });
  }

  /**
   * @param {string} code
   * @param {Severity} severity
   * @param {number} line
   * @param {Record<string, unknown>} [params]
   */
  group(code, severity, line, params = {}) {
    const entry = this.#grouped.get(code) ?? { severity, params, lines: [] };
    entry.lines.push(line);
    this.#grouped.set(code, entry);
  }

  /** @returns {Issue[]} errors first, then warnings, then notes; insertion order inside each rank */
  toArray() {
    const grouped = [...this.#grouped].map(([code, { severity, params, lines }]) => ({
      code,
      severity,
      line: lines[0],
      params: { ...params, lines, count: lines.length },
    }));
    return [...this.#single, ...grouped]
      .map((issue, index) => ({ issue, index }))
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity] || a.index - b.index,
      )
      .map(({ issue }) => issue);
  }
}
