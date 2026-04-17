<div align="center">

# 🧠 Memora

**Scaffolded memory-bank toolkit for AI coding agents**

<p>
  <strong>Structured project memory</strong> ·
  <strong>Progressive context loading</strong> ·
  <strong>Runtime bridge integration</strong>
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
- a runtime bridge that automatically wires each agent's lifecycle events to session recall, transcript capture, and memory screening.

Memora is especially useful when AI agents work on the same codebase across many sessions and need more than ad-hoc prompting.

---

## ✨ What Memora Provides Today

Memora delivers a **production-ready foundation** for structured project memory with a fully-integrated runtime layer:

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
| 🔒 **Runtime Security Layer** | Programmatic screening of memory writes and context file injection against prompt injection, exfiltration, and invisible Unicode attacks |
| 💾 **Transcript Recall Layer** | Persistent turn-by-turn transcript store with cross-session search and fenced recall blocks injected automatically at each turn |
| ⚙️ **Provider Lifecycle Layer** | `MemoryProvider` base class + `ProviderRegistry` orchestrator with failure isolation, fan-out hooks, and built-in `LocalMemoryProvider` |
| 🌉 **Runtime Bridge Integration** | Native lifecycle hooks for Claude Code (complete) and Codex CLI (complete) — session bootstrap, pre-turn recall, write gate, finalization wired automatically |

**Bottom line:** Memora gives you **structure, validation, repeatable workflows, runtime security, and automatic session recall** out of the box.

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
- Toolchain-specific adapters (`.claude/`, `.codex/`, `.qwen/`, `.opencode/`)
- Unified workflow across teams

### 6. 🔒 Runtime Security Layer

**Programmatic protection for prompt-adjacent memory**:

- Security screening before every memory write — blocks prompt injection, role hijack, exfiltration payloads, invisible Unicode
- Context file screening (`AGENTS.md`, `CLAUDE.md`, etc.) before injection — returns safe placeholder on block
- Frozen session snapshot — memory context captured once at start, immune to mid-session drift
- Fenced recall blocks — recalled content wrapped in canonical `<memory_context>` tags with sanitization

See [Runtime Layer](./docs/RUNTIME.md) for full API reference.

### 7. 🌉 Runtime Bridge Integration

**Automatic lifecycle wiring for each toolchain**:

- **Session bootstrap** — on `SessionStart`, Memora initialises the runtime, reads frozen context files, opens a transcript session
- **Pre-turn recall** — on `UserPromptSubmit`, relevant past sessions are retrieved and injected as background context before the model responds
- **Write gate** — on `PreToolUse`/`PostToolUse`, every canonical memory write is screened and observed by the runtime
- **Finalization** — on `SessionEnd`, the runtime flushes transcript state and shuts down providers cleanly

All bridge logic lives in a shared `lib/runtime/bridge/` module; each toolchain adapter is a thin hook that delegates to it.

---

## 🔄 How Memora Works

Memora follows a **simple, repeatable workflow**:

```
┌─────────────────────────────────────────────────────┐
│ 1. Agent starts session                             │
│    └─> SessionStart hook fires                      │
│    └─> Runtime bootstrap: frozen snapshot, session  │
│        opened, startup context injected             │
├─────────────────────────────────────────────────────┤
│ 2. User sends prompt                                │
│    └─> UserPromptSubmit hook fires                  │
│    └─> Transcript recall: relevant past sessions    │
│        injected as background context               │
├─────────────────────────────────────────────────────┤
│ 3. Agent works on task                              │
│    └─> PreToolUse/PostToolUse: canonical writes     │
│        are screened and observed                    │
├─────────────────────────────────────────────────────┤
│ 4. Update memory                                    │
│    └─> Updates: CURRENT.md, HANDOFF.md              │
│    └─> Advisory hooks run (reflect, consolidate)    │
├─────────────────────────────────────────────────────┤
│ 5. Session ends                                     │
│    └─> SessionEnd / Stop hook fires                 │
│    └─> Transcript flushed, providers shut down      │
└─────────────────────────────────────────────────────┘
```

### Three Practical Benefits

✅ **Less context noise** — Load only what you need  
✅ **Better session continuity** — Recall from past sessions, not just handoff files  
✅ **Clean separation** — Canonical memory vs. runtime transcript recall

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

- 🔵 **Claude Code** — Full runtime bridge integration (session recall, write gate, finalization)
- ⚙️ **Codex CLI** — Runtime bridge integration (session recall, Bash guard, Stop checkpoint)
- 🟠 **Qwen Code** — Adapter and advisory hooks (runtime bridge coming next)
- 🟣 **OpenCode** — Adapter and plugin triggers (runtime bridge planned)

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
| **Runtime Layer** | [Runtime](./docs/RUNTIME.md) — Security screening, frozen snapshots, fenced recall |
| **Design** | [Manifesto](./docs/MANIFESTO.md) — Philosophy & protocols behind Memora |

---

## 🌐 Compatibility Snapshot

### Adapter & workflow support

| Component | Claude Code | Codex CLI | Qwen Code | OpenCode |
|-----------|:-----------:|:---------:|:---------:|:--------:|
| Adapter files | ✅ | ✅ | ✅ | ✅ |
| Workflow docs (skills/commands) | ✅ | ✅ | ✅ | ✅ |
| Advisory hooks | ✅ | ✅ | ✅ | ✅ |
| Shared memory-bank | ✅ | ✅ | ✅ | ✅ |

### Runtime bridge integration

| Bridge capability | Claude Code | Codex CLI | Qwen Code | OpenCode |
|-------------------|:-----------:|:---------:|:---------:|:--------:|
| Session bootstrap (`SessionStart`) | ✅ | ✅ | 🔜 | 🔜 |
| Pre-turn recall (`UserPromptSubmit`) | ✅ | ✅ | 🔜 | 🔜 |
| Canonical write gate (`PreToolUse`) | ✅ | ✅ | 🔜 | 🔜 |
| Session finalization (`SessionEnd`) | ✅ | ⚠️ ¹ | 🔜 | 🔜 |
| Transcript capture (turn-scoped) | ✅ | ✅ | 🔜 | 🔜 |

> ¹ Codex CLI has no native `SessionEnd` — `Stop` is used as a turn-level checkpoint. Hard-close semantics remain an architectural gap (FR-205).  
> 🔜 Planned in next implementation phase (FR-301–FR-304 for Qwen, FR-401–FR-404 for OpenCode).

**Key advantage:** **One unified memory-bank architecture and shared bridge layer across all toolchains** — no reimplementation needed per provider.

---

## 🗺️ Roadmap

Memora is **actively developed**. The roadmap builds on our solid foundation:

### Recently Shipped

- ✅ **Runtime Bridge — Claude Code complete (FR-101–FR-104)** — Native lifecycle hooks: `SessionStart` bootstrap, `UserPromptSubmit` pre-turn recall, `PreToolUse`/`PostToolUse` write gate, `SessionEnd` finalization. Verified in live sessions with 395-message transcript recall.
- ✅ **Runtime Bridge — Codex CLI complete (FR-201–FR-204)** — `SessionStart` bootstrap, `UserPromptSubmit` with staged context injection (suppresses terminal wall-of-text), `PreToolUse` Bash guard, `Stop` checkpoint. Hooks delivered via `.codex/hooks.json`.
- ✅ **Shared bridge layer (FR-001)** — `lib/runtime/bridge/index.js` — common `bootstrapSession()` / `prepareTurn()` orchestration used by all toolchain adapters.
- ✅ **Turn-scoped transcript capture (T-102/T-203)** — `UserPromptSubmit` records user prompts; `Stop` syncs assistant messages; `SessionEnd` closes sessions. Recall pipeline now populated on every turn.
- ✅ **Provider Lifecycle Layer complete (Phase 3)** — `MemoryProvider` base class + `ProviderRegistry` orchestrator (failure isolation, fan-out hooks) + `LocalMemoryProvider` built-in (wraps TranscriptStore) + public API (`getProviderRegistry`, `onTurnStart`, `onSessionEnd`, `onPreCompress`, `onMemoryWrite`, `onDelegation`) + 135 tests (FR-014, FR-015)
- ✅ **Transcript Recall Layer complete (Phase 2)** — full pipeline: `TranscriptStore` (JSONL, atomic writes) → `recall.js` (format + truncate + fenced block) → `lib/runtime/index.js` public API (`openTranscriptSession`, `appendTranscriptMessage`, `recallTranscripts`) → 28 integration tests (FR-002, FR-006, FR-007, FR-009, FR-010, FR-011, FR-016)
- ✅ **Runtime security layer (Phase 1)** — `lib/runtime/`: security screening, frozen snapshots, fenced recall blocks (134 tests)
- ✅ **Compatibility matrix** — Full feature matrix across all four toolchains ([docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md))
- ✅ **Guardrail baseline** — Canonical secret-protection baseline for all providers ([docs/SECURITY.md](./docs/SECURITY.md))

### Current Focus (Q2 2026)

- 🛠️ **Runtime Bridge — Qwen Code (FR-301–FR-304)** — `lib/runtime/bridge/qwen.js` + native hooks: `SessionStart`, `UserPromptSubmit`, `PreToolUse`/`PostToolUse`, `SessionEnd`
- 🛠️ **Runtime Bridge — OpenCode (FR-401–FR-404)** — `MemoraRuntimePlugin` in `.opencode/plugins/`: `session.created`, `chat.message`, `tool.execute.before/after`, `session.deleted`

### Coming Soon

- 🔧 **Codex hard-close semantics (FR-205)** — architectural gap: no native `SessionEnd` in Codex, strategy TBD
- 📊 **Observability tooling** — Better audit trails and diagnostics
- 🔌 **External provider backends** — Optional Honcho / Hindsight provider plugins

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

**Memora** — _Structured memory for long-lived AI coding work_

[⭐ Star us on GitHub](https://github.com/your-org/memora) · [📖 Read the docs](./docs/INDEX.md) · [💬 Join discussions](https://github.com/your-org/memora/discussions)

</div>
