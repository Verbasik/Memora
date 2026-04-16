# FAQ — Frequently Asked Questions

## General

### What is Memora?

Memora is a scaffolded memory-bank toolkit for AI coding agents. It provides a structured, navigable, and reusable memory architecture for long-lived projects where AI agents work across many sessions.

### Who is Memora for?

Teams and individual developers who use AI coding agents (Claude Code, Codex CLI, Qwen Code, OpenCode) on the same codebase over time and need more than ad-hoc prompting.

### Is Memora a framework or a file convention?

Both. Memora delivers a file structure (scaffold) plus a CLI (`memora init`, `memora validate`, `memora doctor`) that enforces and validates the structure.

---

## Setup

### How do I initialize a project?

```bash
memora init ./my-project
```

This copies the memory-bank scaffold into `./my-project/memory-bank/`.

### What files does `memora init` create?

See [scaffold.manifest.json](../scaffold.manifest.json) for the authoritative list. Core files include `AGENTS.md`, `memory-bank/INDEX.md`, `memory-bank/PROJECT.md`, `memory-bank/ARCHITECTURE.md`, and the `.local/` session state directory.

### Do I need to fill in all files immediately?

No. Fill only what you know. Placeholders are intentional — they signal what still needs documentation. Run `/memory-bootstrap` (via your AI agent) when ready to populate canonical files.

---

## Validation

### What does `memora validate` check?

Schema-driven checks on YAML front-matter, cross-file link integrity, session limits, and privacy/secret scans. Three profiles: `core`, `extended`, `governance`.

### What is `--scope` for?

`--scope memory` checks only `memory-bank/**`. `--scope repo-docs` checks `README.md` and `docs/**`. `--scope all` (default) combines both.

### Why does the pre-commit hook only run `--scope memory`?

To ensure that markdown drift in `README.md` or `docs/` never blocks a valid memory-bank commit. Full repo-docs validation runs in CI.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution workflow.
