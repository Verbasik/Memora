# Changelog

All notable changes to Memora are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `--scope` flag for `memora validate` (`memory` | `repo-docs` | `all`)
- Source-repo policy: intentional placeholder allowlist for scaffold-source repos
- Deduplication of repeated link-error messages in `validate` and `doctor`
- Minimal stubs for `docs/FAQ.md` and `docs/CONTRIBUTING.md`

### Changed
- `pre-commit` hook now runs `validate --scope memory` only
- CI jobs split into separate blocking steps per scope

### Fixed
- Broken internal links in `README.md` (`CHANGELOG.md`, `docs/FAQ.md`, `docs/CONTRIBUTING.md`)

---

## [0.1.0] — Initial release

### Added
- `memora init` — scaffold a memory-bank into any project directory
- `memora validate` — schema-driven validation with `core`, `extended`, `governance` profiles
- `memora doctor` — health diagnostics for memory-bank structure
- Multi-toolchain adapters: Claude Code, Codex CLI, Qwen Code, OpenCode
- Pre-commit hook + GitHub Actions CI workflow
- Advisory hooks: reflect, consolidate, gc
