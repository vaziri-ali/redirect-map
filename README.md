# redirect-map

Analyse, simplify and export HTTP redirect maps.

Moving a site means writing hundreds of redirects, and the classic mistakes (chains, loops, two rows
for the same URL, a bulk redirect to the home page) are easy to make and hard to see in a
spreadsheet. `redirect-map` reads the list, follows every redirect the way a server would, reports
what is wrong, and writes the corrected rules for Apache, Nginx, Netlify, Cloudflare Pages or
Vercel.

It runs on Node.js 20+ and in the browser, has no runtime dependencies, and never touches the
network.

## Features

- **Chain and loop detection.** Every rule is followed to its final destination. Chains are
  flattened (`A → B → C` becomes `A → C`), loops are reported once and left out of the output.
- **Wildcard and regular expression rules.** `/blog/:slug`, `/docs/*` and `~^/p/(\d+)$` work next
  to exact rules, with the matching order servers use.
- **Pattern probing.** Wildcard rules are tested with a concrete URL to find rules that redirect
  into themselves, into other redirects, or that an earlier rule makes unreachable.
- **Tracer.** Give it a URL and see each hop, the rule that caused it and where it ends.
- **Coverage.** Compare the map with a list of known URLs (for example a Search Console export) and
  see which ones have no redirect, ordered by clicks.
- **Seven output formats.** Apache, Nginx, Netlify, Cloudflare Pages, Vercel, CSV and JSON.
- **Graph export.** Chains and loops as Mermaid or Graphviz DOT.
- **Spreadsheet import.** Header-based column detection, including Screaming Frog exports.
- **Messages in English and Persian**, kept apart from the analysis so other languages are easy to
  add.

## Install

```sh
npm install redirect-map        # library
npx redirect-map --help         # command line
```

## Command line

```sh
redirect-map analyze  rules.csv
redirect-map generate rules.csv --format nginx --out redirects.conf
redirect-map trace    rules.csv /blog/post-1
redirect-map coverage rules.csv search-console-pages.csv
redirect-map graph    rules.csv --format mermaid
```

`analyze` exits with status 1 when it finds errors (2 for usage problems), which makes it usable as
a check in CI. Add `--strict` to fail on warnings too. Use `-` instead of a file name to read
standard input. Run `redirect-map --help` for every option.

Example, with the file in [`examples/migration.csv`](examples/migration.csv):

```text
$ redirect-map analyze examples/migration.csv
16 rows, 12 rules in the output (3 patterns), 1 chains, 1 loops, 1 conflicts

error line 3    Redirects to itself
                /promo
                Remove the row or correct the target.
error line 10   Same source as line 9 with a different target
                Only the first row is used.
                /contact.html → /contact  |  /contact-us
error line 7    Redirect loop
                /about-us → /about → /about-us
warn  line 5    Redirect chain of 2 hops
                /blog/post-1 → /articles/post-1 → /articles/seo-guide
                Send the source straight to /articles/seo-guide. The output already does.
...
```

## Library

```js
import { analyze, generate, simulate, describeIssue } from 'redirect-map';

const report = analyze(`
/old-blog, /blog
/blog/post-1, /articles/post-1
/articles/post-1, /articles/seo-guide
`);

report.stats; // { rows: 3, output: 3, chains: 1, loops: 0, ... }
report.issues.map((issue) => describeIssue(issue, 'en').title);
// [ 'Redirect chain of 2 hops' ]

generate(report, 'nginx').text; // ready to paste into a server config
simulate(report, '/blog/post-1').final.path; // '/articles/seo-guide'
```

The package is plain ES modules. For a `<script>` tag, `npm run build:browser` produces
`dist/redirect-map.browser.js`, which exposes a global `RedirectMap`.

### API

| Function                           | Purpose                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `analyze(text, options)`           | Parse, validate and resolve a map. Returns a `Report`.             |
| `generate(report, format)`         | Render the report for a platform. Returns `{ text, notes, … }`.    |
| `simulate(report, url)`            | Trace one URL through the rules.                                   |
| `coverage(report, entries)`        | Classify known URLs as covered, chained, looping, gone or missing. |
| `parseUrlList(text)`               | Read a URL list or a Search Console style export.                  |
| `buildGraph(report)`               | Nodes and edges of every chain and loop.                           |
| `toMermaid(graph)`, `toDot(graph)` | Text renderings of that graph.                                     |
| `describeIssue(issue, locale)`     | Human readable title, detail, evidence and fix.                    |

Options for `analyze`:

| Option                | Default  | Meaning                                                           |
| --------------------- | -------- | ----------------------------------------------------------------- |
| `base`                | detected | Site the rules belong to, for example `https://example.com`.      |
| `defaultStatus`       | `301`    | Status for rows that do not give one (301, 302, 303, 307 or 308). |
| `ignoreTrailingSlash` | `true`   | Treat `/page` and `/page/` as the same URL.                       |
| `maxHops`             | `10`     | Longest chain to follow before giving up.                         |
| `maxRows`             | `50000`  | Rows read before the input is cut off.                            |

Issues are plain objects (`{ code, severity, line, params }`). The wording lives in
`src/i18n`, so the analysis can be reused with any front end.

## Writing rules

One rule per line. Blank lines and lines starting with `#` are ignored.

```text
/old-page, /new-page                 # comma, semicolon or tab separated
/old-page -> /new-page 302           # arrow, with an optional status
/old-page /new-page 308              # or plain whitespace
/removed-page, 410                   # gone for good
/blog/:slug, /articles/:slug         # one path segment
/docs/*, /help/$1                    # anything, including slashes
~^/product/(\d+)$, /p/$1             # regular expression
```

Spreadsheet exports work as well. When the first row names a source and a target column (`Address`
and `Redirect URL`, `source` and `destination`, `old` and `new`, …) the columns are located by name
and an optional `Status Code` column is used. Rows without a redirect target are skipped.

| Kind     | Written as                  | Matches                                                                                                        |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| exact    | `/page`, `/page?id=1`, URLs | That URL. A source without a query matches any query.                                                          |
| wildcard | `:name`, `*`                | `:name` is one path segment, `*` is anything. Targets use `:name`, `$1`, `$2` … or `:splat` for the first `*`. |
| regex    | `~pattern`                  | JavaScript syntax, tested against the path. Targets use `$1` and `$<name>`.                                    |

Statuses: `301`, `302`, `303`, `307`, `308` redirect; `410` answers "gone" and has no target.

### How rules are matched

1. Exact sources are looked up first, so they win over patterns.
2. Wildcard and regex rules are tried in the order they were written; the first match applies.
3. Paths are compared in their canonical percent-encoded form, so `/خدمات` and
   `/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA` are the same URL.
4. Paths are case sensitive. Hosts are not.
5. The query string is not carried over to the target.

The site is taken from `base`, otherwise from the first absolute source URL. If neither exists,
relative paths resolve against a placeholder host, which is what you want when every target is an
absolute URL on a new domain.

## What is checked

| Code               | Severity | Meaning                                                      |
| ------------------ | -------- | ------------------------------------------------------------ |
| `LOOP`             | error    | A cycle that never reaches a destination.                    |
| `CONFLICT`         | error    | The same source appears with different targets.              |
| `SELF_REDIRECT`    | error    | A rule redirects to the URL it matches.                      |
| `CHAIN`            | warning  | More than one hop; error above five.                         |
| `DUPLICATE`        | warning  | The same rule twice.                                         |
| `ROOT_BULK`        | warning  | Five or more rules send visitors to `/` (soft 404 risk).     |
| `HTTP_TARGET`      | warning  | An `http://` target on an `https` site.                      |
| `PATTERN_LOOP`     | error    | A wildcard rule that redirects into itself.                  |
| `PATTERN_CHAIN`    | warning  | A wildcard rule that lands on another redirect.              |
| `PATTERN_SHADOWED` | info     | An earlier rule probably makes this one unreachable.         |
| `PATTERN_CATCHALL` | warning  | `/*` redirects everything an earlier rule did not.           |
| `TEMP_STATUS`      | info     | 302, 303 or 307 used where a permanent move may be intended. |

Further findings cover invalid rows and URLs, unsupported status codes, spaces, fragments, rules
for other hosts and non-Latin paths. Issue codes and their wording are in [`src/i18n/en.js`](src/i18n/en.js).

Googlebot follows at most ten hops, which is why `maxHops` defaults to 10.

## Output formats

| Format        | File          | Exact | Wildcard | Regex | Query | 410 |
| ------------- | ------------- | :---: | :------: | :---: | :---: | :-: |
| `apache`      | `.htaccess`   |  yes  |   yes    |  yes  |  yes  | yes |
| `nginx`       | server config |  yes  |   yes    |  yes  |  yes  | yes |
| `netlify`     | `_redirects`  |  yes  |   yes    |  no   |  no   | no  |
| `cloudflare`  | `_redirects`  |  yes  |   yes    |  no   |  no   | no  |
| `vercel`      | `vercel.json` |  yes  |   yes    |  no   |  yes  | no  |
| `csv`, `json` | data          |  yes  |   yes    |  yes  |  yes  | yes |

Rules a format cannot express are not guessed at. They are listed in `file.notes` (and on stderr in
the CLI) with the reason.

Things worth knowing:

- **Apache** rules use `RewriteRule` and put query conditions first. Targets end in `?` so the
  incoming query string is dropped. Add the block above other rewrite rules.
- **Nginx** exact rules become two `map` blocks (`$uri` for paths, `$request_uri` for rules with a
  query) and two `if` lines. Wildcard and regex rules become `rewrite` directives; status codes
  `rewrite` cannot send (303, 307, 308, 410) use `location` blocks.
- **Netlify and Cloudflare Pages** share the `_redirects` syntax. Only a single trailing `*` is
  supported and it is written as `:splat`. The Cloudflare variant also warns about the platform
  limits (2,000 static and 100 dynamic rules). Both platforms may carry the query string over.
- **Vercel** uses `statusCode`, `has` conditions for queries and `:path*` for wildcards. Unlike
  `/blog/*`, `/blog/:path*` also matches `/blog` itself.
- Paths containing characters that the target syntax treats specially are escaped, or the rule is
  skipped with a note when no safe spelling exists.

**Verification.** The generators are covered by tests that check the syntax of what they emit.
They have not been run against live Apache, Nginx, Netlify, Cloudflare or Vercel deployments. Test
the result with `nginx -t`, `apachectl configtest` or the platform's preview before shipping it.

## Development

```sh
npm install
npm test            # node:test, no extra tooling
npm run coverage    # line coverage report
npm run lint
npm run format
```

Layout:

```text
src/
  parse.js        text and spreadsheet rows → raw rules
  url.js          base detection, URL normalisation
  pattern.js      wildcard and regex compilation, target templates
  compile.js      raw rules → validated rules
  ruleset.js      lookup semantics (exact first, then patterns in order)
  simulate.js     following redirects: hops, loops, 410
  analyze.js      the pipeline and the checks
  coverage.js     known URLs against the map
  graph.js        Mermaid and DOT export
  formats/        one generator per platform
  i18n/           message catalogues
  cli.js          command line interface
test/             one file per module
```

The analysis never builds strings meant for people. It returns issue codes with parameters, and
`describeIssue` turns them into text. A new language is one file in `src/i18n` plus an entry in
`index.js`; a test fails if a code has no message.

## Limitations

- Regular expression rules are not probed for loops, because there is no general way to produce a
  URL a regex matches. Use `simulate` to test them.
- Wildcard probing uses one sample URL per rule. It finds the common mistakes, not every possible
  interaction between patterns.
- Regular expressions use JavaScript syntax. PCRE-only features may behave differently on the
  server.
- A map is read in memory. The default limit is 50,000 rows.

## License

MIT. See [LICENSE](LICENSE).
