import { generateApache } from './apache.js';
import { generateNginx } from './nginx.js';
import { generateRedirectsFile } from './redirects-file.js';
import { generateVercel } from './vercel.js';
import { generateCsv, generateJson } from './data.js';

/** @type {Record<string, { label: string, generate: (report: import('../analyze.js').Report) => import('./shared.js').GeneratedFile }>} */
export const FORMATS = {
  apache: { label: 'Apache (.htaccess)', generate: generateApache },
  nginx: { label: 'Nginx', generate: generateNginx },
  netlify: {
    label: 'Netlify (_redirects)',
    generate: (report) => generateRedirectsFile(report, 'netlify'),
  },
  cloudflare: {
    label: 'Cloudflare Pages (_redirects)',
    generate: (report) => generateRedirectsFile(report, 'cloudflare'),
  },
  vercel: { label: 'Vercel (vercel.json)', generate: generateVercel },
  csv: { label: 'CSV', generate: generateCsv },
  json: { label: 'JSON', generate: generateJson },
};

/**
 * Renders the analysed map for a target platform.
 * @param {import('../analyze.js').Report} report
 * @param {keyof typeof FORMATS} format
 */
export function generate(report, format) {
  const entry = FORMATS[format];
  if (!entry) {
    throw new RangeError(
      `Unknown format "${format}". Expected one of: ${Object.keys(FORMATS).join(', ')}`,
    );
  }
  return entry.generate(report);
}
