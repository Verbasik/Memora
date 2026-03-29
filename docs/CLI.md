# CLI Reference

**Purpose:** document the Memora CLI commands, flags, and usage patterns.  
**Audience:** users, maintainers, contributors.  
**Read when:** you want the canonical reference for `memora init`, `memora validate`, and `memora doctor`.  
**See also:** [Getting Started](./GETTING_STARTED.md), [Validation](./VALIDATION.md)

---

## Overview

Memora currently includes three core commands:

- `memora init`
- `memora validate`
- `memora doctor`

These three commands provide the practical base of the toolkit:

- **init** gives you the scaffold,
- **validate** gives you structural confidence.
- **doctor** checks that the installed scaffold is operationally healthy.

---

## Command summary

| Command | Purpose |
|---|---|
| `memora init [target-dir]` | Copy the Memora scaffold into a target directory |
| `memora validate [target-dir]` | Validate front matter for markdown files inside `memory-bank/` |
| `memora doctor [target-dir]` | Check scaffold parity, hooks, adapters, links, and placeholders |

---

## `memora init`

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

## `memora validate`

Validate the current project:

```bash
memora validate
```

Validate another directory:

```bash
memora validate ./my-project
```

### Validate flags

- `--strict`: Promote recommended-field warnings to errors.
- `--format text|json`: Choose human-readable or machine-readable output.
- `--watch`: Re-run validation when memory-bank markdown files change.

### What it validates

The current validator checks front matter in `memory-bank/*.md` files, including:

- required fields,
- selected allowed values,
- recommended fields in strict mode,
- structured reporting for local and CI use.

### Validate usage

```bash
memora validate
memora validate --strict
memora validate --format json
memora validate --watch
```

### When to run validate

Use `memora validate`:

- immediately after initialization,
- while editing memory-bank files,
- before commits,
- in CI,
- when reviewing memory quality.

---

## `memora doctor`

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

## Output modes

### Default text output

Best for local interactive use.

### JSON output

Useful for CI, automation, and machine-readable reporting.

```bash
memora validate --format json
memora doctor --format json
```

### Watch mode

Useful while authoring memory-bank files:

```bash
memora validate --watch
```

This gives a fast local feedback loop and keeps markdown structure visible during editing.

---

## Typical command sequences

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
memora validate
```

### CI-style check

```bash
memora validate --strict --format json
memora doctor --format json
```

---

## Best practices

- Run `memora validate` immediately after initialization.
- Run `memora doctor` immediately after initialization or migration.
- Use `--watch` when editing multiple memory files.
- Use `--strict` regularly even if your main flow starts with default validation.
- Treat validation as part of the normal authoring loop, not only as a final gate.

---

## Related repository pieces

The CLI works best together with:

- `scaffold.manifest.json`
- `.githooks/pre-commit`
- `.github/workflows/`
- `memory-bank/`
- `schemas/`

For the complete quality picture, see [Validation](./VALIDATION.md).

---

**Last updated:** 2026-03-28
