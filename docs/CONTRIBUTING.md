# Contributing to Memora

Thank you for your interest in contributing to Memora!

## Reporting Bugs

Open an issue at [github.com/your-org/memora/issues](https://github.com/your-org/memora/issues) with:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behaviour
- Node.js version and OS

## Requesting Features

Open an issue with the `enhancement` label. Describe:

- The use case you want to address
- Why it fits Memora's scope (structured memory for AI coding agents)
- Any alternatives you considered

## Development Setup

```bash
git clone <repo-url>
cd memora
npm install   # no runtime dependencies; dev-only
npm link      # make `memora` available globally
npm test      # run smoke tests
```

### Running Validation

```bash
node bin/memora.js validate --scope all --profile core
node bin/memora.js doctor
```

## Commit Conventions

Memora uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <short description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

## Code Review

- All changes go through a pull request.
- One approval required from a maintainer.
- CI must pass: `npm test`, `validate --scope memory`, `validate --scope repo-docs`.

## Branching

- `main` — stable releases
- `develop` — integration branch
- `feat/*`, `fix/*`, `docs/*` — topic branches off `develop`

## Scaffold Changes

When modifying `scaffold.manifest.json` or files under `memory-bank/`:

- Verify that source-repo intentional placeholders are covered by the source policy in `package.json` (`memora.repoRole`).
- Do **not** add source-only content to files that are copied to target projects.

## License

By contributing, you agree that your contribution will be licensed under the MIT License.
