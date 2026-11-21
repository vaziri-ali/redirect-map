# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0]

### Added

- Redirect map analysis: chains, loops, duplicates, conflicts and self redirects.
- Exact, wildcard (`:name`, `*`) and regular expression rules.
- Probing of wildcard rules for loops, chains and shadowing.
- URL tracer, coverage check against a list of known URLs, graph export.
- Output for Apache, Nginx, Netlify, Cloudflare Pages, Vercel, CSV and JSON.
- Import of free-form rows and spreadsheet exports with named columns.
- Command line interface with `analyze`, `generate`, `trace`, `coverage` and `graph`.
- English and Persian messages.
