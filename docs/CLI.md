# ⌨️ CLI Reference

**Purpose:** Document the Memora CLI commands, flags, and usage patterns.  
**Audience:** Users, maintainers, contributors.  
**Read when:** You want the canonical reference for `memora init`, `memora validate`, and `memora doctor`.  
**Last updated:** 2026-04-03

**See also:** [Getting Started](./GETTING_STARTED.md) · [Validation](./VALIDATION.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Command summary](#-command-summary)
- [`memora init`](#-memora-init)
- [`memora validate`](#-memora-validate)
- [`memora doctor`](#-memora-doctor)
- [Output modes](#-output-modes)
- [Typical command sequences](#-typical-command-sequences)
- [Best practices](#-best-practices)
- [Related repository pieces](#-related-repository-pieces)
- [Navigation](#-navigation)

---

## 🎯 Overview

Memora currently includes three core commands:

- `memora init`
- `memora validate`
- `memora doctor`

These three commands provide the practical base of the toolkit:

- **init** gives you the scaffold,
- **validate** gives you schema, integrity, and hygiene checks.
- **doctor** checks that the installed scaffold is operationally healthy.

---

## 📋 Command summary

| Command | Purpose |
|---|---|
| `memora init [target-dir]` | Copy the Memora scaffold into a target directory |
| `memora validate [target-dir]` | Validate front matter for markdown files inside `memory-bank/` |
| `memora doctor [target-dir]` | Check scaffold parity, hooks, adapters, links, and placeholders |

---

## 📦 `memora init`

Initialize Memora into the current directory:

```bash
memora init
```

Initialize into another directory:

```bash
memora init ./my-project
```

### Supported flags

| Flag | Meaning |
|---|---|
| `--force` | Overwrite existing files |
| `--no-init` | Copy files only, skip `init.sh` |
| `--include-assets` | Also copy `assets/` when present |
| `--include-services` | Also copy `services/_template/` when present |

### What `memora init` does

`memora init` copies the Memora scaffold into the target location using `scaffold.manifest.json` as the source of truth for copied files. After copying, it runs `init.sh` unless disabled with `--no-init`.

The default scaffold includes:

- the core memory-bank,
- adapter directories,
- local `bin/` and `lib/` helpers,
- `.githooks/`,
- `.github/workflows/`,
- `schemas/`,
- `scaffold.manifest.json`.

Repository authoring docs in `docs/` stay in the Memora source repository and are not copied into the target project.

### Typical usage

```bash
memora init .
memora init ./my-project
memora init ./my-project --force
memora init ./my-project --no-init
```

### When to use it

Use `memora init` when:

- starting with a new repository,
- adding Memora to an existing repository,
- resetting a local test setup,
- preparing a demo or evaluation environment.

---

## ✅ `memora validate`

Validate the current project:

```bash
memora validate
```

Validate another directory:

```bash
memora validate ./my-project
```

### Validate flags

- `--scope memory|repo-docs|all`: Choose which surface to validate (default: `all`).
- `--profile core|extended|governance`: Choose how strict and comprehensive validation should be.
- `--strict`: Promote recommended-field warnings to errors.
- `--format text|json`: Choose human-readable or machine-readable output.
- `--watch`: Re-run validation when tracked `.md` files change. Watched paths are scope-aware: `memory` watches `memory-bank/`; `repo-docs` watches `docs/` and `README.md`; `all` watches both.

### Validation scopes

The `--scope` flag separates two independent validation surfaces:

| Scope | What it checks |
|-------|---------------|
| `memory` | `memory-bank/**` — schema, frontmatter, session limits, secret/privacy scans, internal link integrity, ADR/INDEX integrity |
| `repo-docs` | `README.md` and `docs/**` — internal link integrity of repository documentation |
| `all` | Both `memory` and `repo-docs` combined (default) |

Use `--scope memory` when you only care about memory-bank correctness — for example, in pre-commit hooks or focused authoring loops. Use `--scope repo-docs` to audit documentation links without touching memory validation. Note: `--scope repo-docs` does not require `memory-bank/` to be present and can run in any directory with `README.md` or `docs/`.

### What it validates

`memora validate` covers schema, integrity, and hygiene across both surfaces:

- schema-driven front matter validation using the JSON Schemas in `schemas/`,
- cross-file integrity checks inside `memory-bank/` (ADR, INDEX routing, internal links),
- repository documentation link integrity (`README.md`, `docs/**`),
- operational constraints: `max_lines`, stale verification windows, session bloat,
- secret-like pattern detection and privacy tag checks.

Profiles control enforcement depth:

- `core`: base schema checks plus essential integrity and hygiene warnings,
- `extended`: adds placeholder drift and deeper cross-file checks,
- `governance`: promotes governance-oriented warnings into blocking errors.

### Validate usage

```bash
# Default: validate all surfaces
memora validate

# Memory surface only (pre-commit friendly)
memora validate --scope memory

# Repo-docs surface only
memora validate --scope repo-docs

# Full surface with strict mode
memora validate --scope all --strict

memora validate --profile extended
memora validate --profile governance
memora validate --format json
memora validate --watch
```

### When to run validate

Use `memora validate`:

- immediately after initialization,
- while editing memory-bank files,
- before commits,
- in CI,
- when reviewing memory quality or repository hygiene.

---

## 🏥 `memora doctor`

Inspect the current project:

```bash
memora doctor
```

Inspect another directory:

```bash
memora doctor ./my-project
```

### Doctor flags

- `--format text|json`: Choose human-readable or machine-readable output.

### What it checks

`memora doctor` verifies the operational health of an installed scaffold:

- expected manifest-driven scaffold entries are present,
- `memory-bank/` exists and critical files are in place,
- `.githooks/pre-commit` exists, is executable, and is activated via `core.hooksPath`,
- the GitHub Actions workflow file is present,
- adapter files for Claude, Codex, Qwen, and OpenCode exist,
- hook paths resolve to real scripts,
- Qwen entry files resolve correctly,
- `.claude/settings.json` does not contain obvious host-specific absolute paths,
- internal markdown links are not broken,
- critical files do not still contain obvious template placeholders.

### Doctor usage

```bash
memora doctor
memora doctor --format json
memora doctor ./my-project --format json
```

### When to run doctor

Use `memora doctor`:

- immediately after installation,
- after moving or copying a project,
- after toolchain adapter edits,
- before declaring a setup production-ready.

---

## 📊 Output modes

### Default text output

Best for local interactive use.

### JSON output

Useful for CI, automation, and machine-readable reporting.

```bash
memora validate --format json
memora validate --profile governance --format json
memora doctor --format json
```

### Watch mode

Useful while authoring files. Watched paths are scope-aware:

```bash
# Watch memory-bank/ only
memora validate --scope memory --watch

# Watch docs/ and README.md only
memora validate --scope repo-docs --watch

# Watch all surfaces (default)
memora validate --watch
```

If recursive watching fails with `EMFILE: too many open files` (macOS), Memora falls back to top-level watching and suggests `ulimit -n 4096`.

---

## 🔄 Typical command sequences

### New project setup

```bash
memora init ./my-project
cd ./my-project
memora validate
memora doctor
```

### Editing loop

```bash
memora validate --watch
```

### Pre-commit check

```bash
# Pre-commit runs only memory scope — docs drift never blocks a memory commit
memora validate --scope memory
```

### CI-style check

```bash
# Blocking: memory surface
memora validate --scope memory --profile core --format json

# Blocking: repo-docs surface
memora validate --scope repo-docs --profile core --format json

# Advisory: full surface, extended profile
memora validate --scope all --profile extended --format json
memora validate --scope all --profile governance --format json
memora doctor --format json
```

---

## 💡 Best practices

- Run `memora validate` immediately after initialization.
- Use `core` for day-to-day authoring, `extended` for team-wide review, and `governance` for policy-heavy environments.
- Run `memora doctor` immediately after initialization or migration.
- Use `--watch` when editing multiple memory files.
- Use `--strict` regularly even if your main flow starts with default validation.
- Treat validation as part of the normal authoring loop, not only as a final gate.

---

## 📦 Related repository pieces

The CLI works best together with:

- `scaffold.manifest.json`
- `.githooks/pre-commit`
- `.github/workflows/`
- `memory-bank/`
- `schemas/`

For the complete quality picture, see [Validation](./VALIDATION.md).

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [GETTING_STARTED.md](./GETTING_STARTED.md) |
| Next → | [MEMORY_MODEL.md](./MEMORY_MODEL.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
