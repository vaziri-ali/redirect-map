import en from './en.js';
import fa from './fa.js';

const CATALOGS = { en, fa };

/** @typedef {'en' | 'fa'} Locale */

const LOCALE_TAGS = { en: 'en-US', fa: 'fa-IR' };

function formatter(locale) {
  const numbers = new Intl.NumberFormat(LOCALE_TAGS[locale]);
  const separator = locale === 'fa' ? '، ' : ', ';
  return {
    n: (value) => numbers.format(value),
    list: (items, limit = 6) =>
      items.slice(0, limit).join(separator) + (items.length > limit ? ' …' : ''),
  };
}

/**
 * Turns an issue or a format note into display text.
 *
 * @param {{ code: string, params?: Record<string, unknown> }} issue
 * @param {Locale} [locale]
 * @returns {{ title: string, detail?: string, fix?: string, evidence?: string }}
 */
export function describeIssue(issue, locale = 'en') {
  const catalog = CATALOGS[locale] ?? en;
  const build = catalog.issues[issue.code];
  if (!build) return { title: issue.code };
  return build(issue.params ?? {}, formatter(catalog.locale));
}

export const LOCALES = Object.keys(CATALOGS);

/** @param {Locale} locale */
export const directionOf = (locale) => (CATALOGS[locale] ?? en).direction;

/** Every issue code that has a message, for completeness checks. */
export const MESSAGE_CODES = Object.keys(en.issues);
