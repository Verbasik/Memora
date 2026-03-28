<div align="center">

# 🧠 Memora

**Scaffolded memory-bank toolkit for AI coding agents**

<p>
  <strong>Structured project memory</strong> ·
  <strong>Progressive context loading</strong> ·
  <strong>Deterministic maintenance hooks</strong>
</p>

### Supported AI Toolchains

Claude Code · Codex CLI · Qwen Code · OpenCode

</div>

---

## Why Memora?

**Memora** helps teams turn long-lived project context into a **structured, navigable, and reusable memory-bank** for AI coding agents.

Instead of relying on one large prompt or an ever-growing context window, Memora gives your repository a clear memory architecture:

- a stable entry point for agents,
- a routing layer for minimal relevant context,
- canonical knowledge files for architecture, decisions, conventions, and testing,
- isolated session state for ongoing work,
- maintenance hooks that keep memory workflows visible and predictable.

Memora is especially useful when AI agents work on the same codebase across many sessions and need more than ad-hoc prompting.

---

## What Memora Provides Today

Memora already provides a practical foundation for structured project memory:

- working CLI commands for project initialization and front-matter validation: `memora init` and `memora validate`,
- a ready-to-use memory-bank scaffold with core files such as `PROJECT.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`, `CHANGELOG.md`, and `.local/` session state,
- built-in validation workflow for front-matter quality, including strict mode, JSON output, and watch mode,
- pre-commit validation for `memory-bank/*.md` files,
- GitHub Actions CI for core validation, extended validation, and markdown linting,
- deterministic advisory hooks for reflection, consolidation, and cleanup reminders,
- toolchain adapters for Claude Code, Codex CLI, Qwen Code, and OpenCode.

In short, Memora already gives you a strong base for **project memory structure, validation, and repeatable agent workflows**.

---

## Core Strengths

### 1. Clear memory architecture

Memora gives repositories a predictable memory layout instead of unstructured notes:

- `AGENTS.md` as the entry point,
- `memory-bank/INDEX.md` as the routing table,
- stable knowledge files for project identity, architecture, decisions, policies, and patterns,
- `.local/` for active session context and handoff.

### 2. Minimal relevant context

Memora is designed around reading only what is needed. The routing layer in `INDEX.md` maps tasks to the right files and keeps agents away from unnecessary context.

### 3. Operational predictability

The project includes deterministic advisory hooks and explicit lifecycle docs. This makes memory maintenance more visible and less dependent on agent improvisation.

### 4. Validation-first workflow

Memora supports local validation, strict mode, JSON reports, live watch mode, pre-commit checks, and CI validation. This is a major strength for teams that want memory files to stay clean and consistent.

### 5. Cross-tool compatibility

The same memory-bank structure can be used with multiple AI toolchains through project-specific adapter files and hook integrations.

---

## How Memora Works

At a high level, Memora organizes memory like this:

```text
Agent starts
    ↓
Reads: AGENTS.md
    ↓
Checks: memory-bank/INDEX.md
    ↓
Loads: Only relevant files
    ↓
Works on the task
    ↓
Updates: CURRENT.md and HANDOFF.md
    ↓
Uses hooks and maintenance workflows as needed
```

This structure gives you three practical benefits:

- less context noise,
- better continuity across sessions,
- cleaner separation between stable knowledge and ongoing work.

---

## Quick Start

### Prerequisites

- Node.js `>=16`
- `bash` (macOS/Linux; Windows via Git Bash or WSL)

### 1) Install the CLI

```bash
npm install -g ./memora-cli-X.X.X.tgz
# or for development
npm link
```

### 2) Initialize a project memory-bank

```bash
memora init ./my-project
cd ./my-project
```

### 3) Validate front matter

```bash
memora validate
memora validate --strict
memora validate --format json
memora validate --watch
```

### 4) Fill the core project files

Start with:

- `memory-bank/PROJECT.md`
- `memory-bank/ARCHITECTURE.md`
- `memory-bank/CONVENTIONS.md`
- `memory-bank/TESTING.md`

### 5) Connect your preferred AI toolchain

Memora includes adapter files for Claude Code, Codex CLI, Qwen Code, and OpenCode.

For a step-by-step guide, see [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md).

---

## Documentation

### Start here

- [Documentation Index](./docs/INDEX.md) — complete map of the documentation set
- [Getting Started](./docs/GETTING_STARTED.md) — first successful setup
- [CLI Reference](./docs/CLI.md) — commands, flags, and examples

### Architecture and workflows

- [Memory Model](./docs/MEMORY_MODEL.md) — layered memory architecture
- [Workflows](./docs/WORKFLOWS.md) — session-start, update, audit, consolidate, reflect, cleanup
- [Toolchains](./docs/TOOLCHAINS.md) — Claude Code, Codex CLI, Qwen Code, OpenCode
- [Hooks](./docs/HOOKS.md) — deterministic advisory maintenance hooks

### Quality, patterns, and security

- [Validation](./docs/VALIDATION.md) — front-matter validation, pre-commit, CI, schemas
- [Patterns](./docs/PATTERNS.md) — reusable memory and workflow patterns
- [Security](./docs/SECURITY.md) — memory hygiene, privacy zones, safe operating practices
- [Manifesto](./docs/MANIFESTO.md) — protocol and design philosophy behind Memora

---

## Compatibility Snapshot

| Area | Claude Code | Codex CLI | Qwen Code | OpenCode |
|---|:---:|:---:|:---:|:---:|
| Adapter files present | ✅ | ✅ | ✅ | ✅ |
| Hook integration present | ✅ | ✅ | ✅ | ✅ |
| Workflow docs present | ✅ | ✅ | ✅ | ✅ |
| Shared memory-bank model | ✅ | ✅ | ✅ | ✅ |

Memora’s core advantage here is consistency: **one memory-bank architecture, multiple integrations**.

---

## Roadmap

Memora already has a solid foundation in structure, validation, hooks, and adapters. The roadmap continues to build on these strengths:

- richer schema-driven validation,
- stronger memory quality automation,
- more starter packs and templates,
- broader adapter polish,
- improved observability and maintenance tooling.

---

## License

MIT — Use freely. See [LICENSE](./LICENSE) for details.

---

<div align="center">

**Memora** — Structured memory for long-lived AI coding work

</div>
