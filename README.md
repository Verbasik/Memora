<div align="center">

# 🧠 Memora

**Scaffolded memory-bank toolkit for AI coding agents**

<p>
  <strong>Structured project memory</strong> ·
  <strong>Progressive context loading</strong> ·
  <strong>Deterministic maintenance hooks</strong>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status: Stable](https://img.shields.io/badge/Status-Stable-green.svg)](./CHANGELOG.md)
[![Docs](https://img.shields.io/badge/Docs-Available-blue.svg)](./docs/INDEX.md)
[![Node.js >= 16](https://img.shields.io/badge/Node.js-%3E%3D%2016-brightgreen.svg)](https://nodejs.org/)

### Supported AI Toolchains

**Claude Code** · **Codex CLI** · **Qwen Code** · **OpenCode**

</div>

---

## 📖 Table of Contents

- [Why Memora?](#why-memora)
- [What Memora Provides Today](#what-memora-provides-today)
- [Core Strengths](#core-strengths)
- [How Memora Works](#how-memora-works)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Next Steps](#next-steps)
- [Documentation](#documentation)
- [Compatibility](#compatibility-snapshot)
- [Roadmap](#roadmap)
- [Support & Contributing](#support--contributing)
- [License](#license)

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

## ✨ What Memora Provides Today

Memora delivers a **production-ready foundation** for structured project memory:

### Core Features

| Feature | Description |
|---------|-------------|
| 📋 **Scaffold Delivery** | Deterministic setup via `scaffold.manifest.json` |
| 🛠️ **CLI Commands** | `memora init`, `memora validate`, `memora doctor` |
| 📚 **Memory-Bank Template** | Core files: PROJECT.md, ARCHITECTURE.md, CONVENTIONS.md, TESTING.md, DECISIONS.md, OPEN_QUESTIONS.md, CHANGELOG.md, and `.local/` session state |
| ✔️ **Schema-Driven Validation** | Front-matter validation, cross-file integrity checks, strict mode, JSON output, watch mode |
| 🔍 **Validation Profiles** | `core`, `extended`, `governance` — choose your level |
| 🚫 **Pre-Commit Hooks** | Automatic validation for `memory-bank/*.md` files |
| 🤖 **GitHub Actions CI** | Core validation, extended validation, markdown linting |
| 🔔 **Advisory Hooks** | Deterministic reminders for reflection, consolidation, cleanup |
| 🔌 **Multi-Toolchain Support** | Native adapters for Claude Code, Codex CLI, Qwen Code, OpenCode |

**Bottom line:** Memora gives you **structure, validation, and repeatable workflows** out of the box.

---

## 💪 Core Strengths

### 1. 🏗️ Clear Memory Architecture

Memora enforces a **predictable, navigable memory structure**:

- **Entry point:** `AGENTS.md`
- **Routing table:** `memory-bank/INDEX.md` (minimal relevant context)
- **Stable knowledge:** PROJECT.md, ARCHITECTURE.md, DECISIONS.md, CONVENTIONS.md, TESTING.md
- **Active session:** `.local/CURRENT.md` and `.local/HANDOFF.md`

Instead of scattered notes, you get a canonical knowledge model.

### 2. 🎯 Minimal Relevant Context

Memora loads **only what agents need**:

- Routing layer in `INDEX.md` maps tasks to specific files
- Progressive context loading prevents information overload
- Less noise = faster decisions, better focus

### 3. 🔄 Operational Predictability

Deterministic workflows for **reproducible agent behavior**:

- Shared scaffold manifest (`scaffold.manifest.json`)
- Explicit lifecycle docs (`LIFECYCLE.md`)
- Advisory hooks for reflection, consolidation, cleanup
- Installation and maintenance become visible, not improvised

### 4. ✅ Validation-First Workflow

**Production-grade quality gates**:

- Local validation with multiple profiles (`core`, `extended`, `governance`)
- Strict mode for teams
- JSON output for CI integration
- Watch mode for live feedback
- Pre-commit hooks + GitHub Actions CI
- `memora doctor` for health diagnostics

### 5. 🔗 Cross-Tool Compatibility

**One memory-bank, multiple AI agents**:

- Same structure works with Claude Code, Codex CLI, Qwen Code, OpenCode
- Toolchain-specific adapters (`.claude/`, `.agents/`, `.qwen/`, `.opencode/`)
- Unified workflow across teams

---

## 🔄 How Memora Works

Memora follows a **simple, repeatable workflow**:

```
┌─────────────────────────────────────────────────────┐
│ 1. Agent starts session                             │
│    └─> Reads: AGENTS.md (entry point)              │
├─────────────────────────────────────────────────────┤
│ 2. Load context                                     │
│    └─> Checks: memory-bank/INDEX.md (routing)      │
│    └─> Reads: Only relevant files (via routing)    │
├─────────────────────────────────────────────────────┤
│ 3. Work on task                                     │
│    └─> Solves problem, writes code, creates docs   │
├─────────────────────────────────────────────────────┤
│ 4. Update memory                                    │
│    └─> Updates: CURRENT.md, HANDOFF.md            │
│    └─> Runs: Advisory hooks (reflect, consolidate) │
└─────────────────────────────────────────────────────┘
```

### Three Practical Benefits

✅ **Less context noise** — Load only what you need
✅ **Better session continuity** — Handoff files bridge gaps
✅ **Clean separation** — Stable knowledge vs. active work

---

## Getting Started

### Prerequisites

Before installing Memora, ensure you have:

| Requirement | Version | Download |
|---|---|---|
| **Node.js** | >= 16 | [nodejs.org](https://nodejs.org/) |
| **bash** | latest | macOS/Linux (Windows: Git Bash or WSL) |
| **npm** | 6+ | Bundled with Node.js |

### Installation

**Option 1: From package**

```bash
npm install -g ./memora-cli-X.X.X.tgz
```

**Option 2: Development mode**

```bash
git clone <repo-url>
cd memora
npm link
```

**Verify installation:**

```bash
memora --version
memora --help
```

### Quick Start

#### 1️⃣ Initialize a project memory-bank

```bash
memora init ./my-project
cd ./my-project
```

This creates a scaffolded `memory-bank/` directory with all core files.

#### 2️⃣ Validate your memory bank

```bash
# Basic validation (all surfaces)
memora validate

# Memory surface only — fast, pre-commit friendly
memora validate --scope memory

# Repo-docs surface only — README and docs/ link integrity
memora validate --scope repo-docs

# Strict mode (recommended for teams)
memora validate --strict

# Check specific profile
memora validate --profile extended
memora validate --profile governance

# Watch mode (live validation)
memora validate --watch

# Health check
memora doctor
```

#### 3️⃣ Fill the core project files

Start with these files (in order):

1. **`memory-bank/PROJECT.md`** — Define project identity and scope
2. **`memory-bank/ARCHITECTURE.md`** — Document system design
3. **`memory-bank/CONVENTIONS.md`** — Establish code/workflow rules
4. **`memory-bank/TESTING.md`** — Define testing strategy

See [Project.md template](./memory-bank/PROJECT.md) for detailed guidance.

#### 4️⃣ Connect your AI toolchain

Memora supports multiple AI coding agents. Choose your toolchain:

- 🔵 **Claude Code** — Native integration via `.claude/` adapter
- ⚙️ **Codex CLI** — Standalone CLI mode
- 🟠 **Qwen Code** — Alibaba Qwen integration
- 🟣 **OpenCode** — OpenAI Code integration

Adapters and hooks are automatically copied by `memora init` from `scaffold.manifest.json`.

**For detailed setup**, see [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)

### Next Steps

Once your memory-bank is initialized:

- 📚 Read the [Memory Model](./docs/MEMORY_MODEL.md) to understand the architecture
- 🔧 Explore [CLI Reference](./docs/CLI.md) for all available commands
- 🎯 Check [Workflows](./docs/WORKFLOWS.md) for session patterns
- ✅ Run `memora doctor` for health diagnostics

---

## 📚 Documentation

### 🚀 Quick Links

| Guide | Purpose |
|-------|---------|
| [Documentation Index](./docs/INDEX.md) | Complete reference map |
| [Getting Started](./docs/GETTING_STARTED.md) | First-time setup walkthrough |
| [CLI Reference](./docs/CLI.md) | Commands, flags, examples |
| [FAQ](./docs/FAQ.md) | Common questions answered |

### 🏛️ Core Concepts

| Topic | Guide |
|-------|-------|
| **Memory Model** | [Memory Model](./docs/MEMORY_MODEL.md) — Layered architecture, scope, routing |
| **Workflows** | [Workflows](./docs/WORKFLOWS.md) — Session patterns, consolidation, reflection |
| **Toolchains** | [Toolchains](./docs/TOOLCHAINS.md) — Claude Code, Codex, Qwen, OpenCode |
| **Hooks** | [Hooks](./docs/HOOKS.md) — Advisory reminders, automation |

### ✅ Quality & Operations

| Topic | Guide |
|-------|-------|
| **Validation** | [Validation](./docs/VALIDATION.md) — Schemas, strict mode, CI integration |
| **Patterns** | [Patterns](./docs/PATTERNS.md) — Reusable techniques and templates |
| **Security** | [Security](./docs/SECURITY.md) — Privacy zones, PII handling, safe practices |
| **Design** | [Manifesto](./docs/MANIFESTO.md) — Philosophy & protocols behind Memora |

---

## 🌐 Compatibility Snapshot

Memora works seamlessly across **all major AI coding agents**:

| Component | Claude Code | Codex CLI | Qwen Code | OpenCode |
|-----------|:-----------:|:---------:|:---------:|:--------:|
| Adapter files | ✅ | ✅ | ✅ | ✅ |
| Hook integration | ✅ | ✅ | ✅ | ✅ |
| Workflow docs | ✅ | ✅ | ✅ | ✅ |
| Shared memory-bank | ✅ | ✅ | ✅ | ✅ |

**Key advantage:** **One unified memory-bank architecture works across all toolchains** — no reimplementation needed.

---

## 🗺️ Roadmap

Memora is **actively developed**. The roadmap builds on our solid foundation:

### Current Focus (Q2 2026)

- 🔍 **Rich schema-driven validation** — Stricter, faster validation rules
- 🛠️ **Install diagnostics** — Better `memora doctor` output
- 🤖 **Memory automation** — Smart consolidation and cleanup helpers
- 📦 **Starter templates** — Industry-specific memory-bank packs

### Coming Soon

- 🔧 **Adapter enhancements** — Deeper integration for each toolchain
- 📊 **Observability tooling** — Better audit trails and diagnostics
- 🚀 **Performance improvements** — Faster validation and scaffold delivery

**See [CHANGELOG](./CHANGELOG.md) for recent updates and [DECISIONS](./memory-bank/DECISIONS.md) for architectural context.**

---

## Support & Contributing

### 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](./docs/CONTRIBUTING.md) for:

- How to report bugs and request features
- Development setup and testing
- Code review process
- Commit conventions

**Quick links:**
- [Issues](https://github.com/your-org/memora/issues) — Bug reports & feature requests
- [Discussions](https://github.com/your-org/memora/discussions) — Questions & ideas
- [Pull Requests](https://github.com/your-org/memora/pulls) — Code contributions

### 💬 Get Help

- 📖 **[Documentation](./docs/INDEX.md)** — Complete guides and references
- ❓ **[FAQ](./docs/FAQ.md)** — Common questions answered
- 🐛 **[Issues](https://github.com/your-org/memora/issues)** — Found a bug? Report it here
- 💡 **[Discussions](https://github.com/your-org/memora/discussions)** — Ideas and questions

### 🎯 Project Health

- **Status:** Actively maintained
- **Latest release:** See [CHANGELOG](./CHANGELOG.md)
- **Node.js support:** 16+
- **License:** MIT

---

## License

MIT License — Use freely in personal and commercial projects.

See [LICENSE](./LICENSE) file for full details.

---

<div align="center">

**Memora** — *Structured memory for long-lived AI coding work*

[⭐ Star us on GitHub](https://github.com/your-org/memora) · [📖 Read the docs](./docs/INDEX.md) · [💬 Join discussions](https://github.com/your-org/memora/discussions)

</div>
