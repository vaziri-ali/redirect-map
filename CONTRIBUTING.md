# Contributing

Bug reports with a small rule file that reproduces the problem are the most useful kind.

## Setup

```sh
npm install
npm test
npm run lint
npm run format:check
```

All three must pass before a pull request is merged; CI runs them on Node.js 20 and 22.

## Guidelines

- Keep the analysis free of presentation. Report an issue code and parameters, and add the wording
  to every file in `src/i18n`.
- A new output format needs a generator in `src/formats`, an entry in `FORMATS`, tests for the
  syntax it emits, and a line in the README table that says what it cannot express.
- Add a test with the change. Bug fixes should include a test that fails without the fix.
- Update `CHANGELOG.md` under an "Unreleased" heading.
