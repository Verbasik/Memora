# 🚀 Getting Started

**Purpose:** Help you get Memora running in a project quickly.  
**Audience:** First-time users and evaluators.  
**Read when:** You want a practical setup path with the fewest decisions.  
**Last updated:** 2026-04-03

**See also:** [INDEX.md](./INDEX.md) · [CLI Reference](./CLI.md) · [Toolchains](./TOOLCHAINS.md) · [Workflows](./WORKFLOWS.md)

---

## 📖 Table of Contents

- [What you will get](#-what-you-will-get)
- [Prerequisites](#-prerequisites)
- [1. Install Memora](#-1-install-memora)
- [2. Initialize a project memory-bank](#-2-initialize-a-project-memory-bank)
- [3. Validate the scaffold](#-3-validate-the-scaffold)
- [4. Fill the core project files](#-4-fill-the-core-project-files)
- [5. Review the entry points](#-5-review-the-entry-points)
- [6. Connect your preferred toolchain](#-6-connect-your-preferred-toolchain)
- [7. Recommended first workflow](#-7-recommended-first-workflow)
- [8. Recommended daily workflow](#-8-recommended-daily-workflow)
- [Common first-success checklist](#-common-first-success-checklist)
- [Next reading](#-next-reading)

---

## ✨ What you will get

After completing this guide, you will have:

- a Memora memory-bank scaffold inside your project,
- core memory files ready to fill,
- front-matter validation working locally,
- an operational health check through `memora doctor`,
- a clear path to connect your preferred AI toolchain.

---

## 📋 Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | >= 16 | [Download](https://nodejs.org/) |
| **bash** | latest | macOS/Linux native; Windows: Git Bash or WSL |
| **npm** | 6+ | Bundled with Node.js |

---

## 📦 1. Install Memora

### Local development install

```bash
npm link
```

### Package install

```bash
npm install -g ./memora-cli-X.X.X.tgz
```

This makes the `memora` CLI available in your shell.

---

## 🎯 2. Initialize a project memory-bank

From your repository root:

```bash
memora init .
```

Or create a new target directory:

```bash
memora init ./my-project
cd ./my-project
```

**What you get:**

| Component | Purpose |
|-----------|---------|
| `AGENTS.md` | Agent entry contract and integration points |
| `CLAUDE.md` | Claude Code-specific configuration |
| `memory-bank/` | Core knowledge and session files |
| `schemas/` | JSON schemas for validation |
| `bin/`, `lib/` | Helper scripts and utilities |
| `.githooks/`, `.github/workflows/` | Pre-commit checks and CI/CD |
| `.claude/`, `.codex/`, `.qwen/`, `.opencode/` | Toolchain-specific adapters |
| `memory-bank/.local/` | Generated session state and handoff |
| `memory-bank/scripts/` | Helper scripts for workflows |

**Note:** Memora source docs in `docs/` remain in the Memora repository and are NOT copied into your target project.

---

## ✅ 3. Validate the scaffold

Run:

```bash
memora validate
```

This checks the front matter of `memory-bank/*.md` files and confirms that the scaffold is structurally sound.

You can also use:

```bash
memora validate --strict
memora validate --profile extended
memora validate --format json
memora validate --watch
memora doctor
```

---

## 📝 4. Fill the core project files first

Start with the canonical project files:

- `memory-bank/PROJECT.md`
- `memory-bank/ARCHITECTURE.md`
- `memory-bank/CONVENTIONS.md`
- `memory-bank/TESTING.md`

These files give the agent the minimum stable context it needs to work consistently.

### Recommended order

1. `PROJECT.md` — what this project is and why it exists
2. `ARCHITECTURE.md` — system shape, modules, flows, boundaries
3. `CONVENTIONS.md` — how code is written and organized
4. `TESTING.md` — validation commands and quality expectations

---

## 🔍 5. Review the entry points

Memora’s main entry points are:

- `AGENTS.md` — agent entry contract
- `memory-bank/INDEX.md` — routing table for minimal relevant context
- `memory-bank/LIFECYCLE.md` — lifecycle and maintenance model

These files are the best way to understand how a toolchain or agent should enter and navigate the memory-bank.

---

## 🔌 6. Connect your preferred toolchain

Memora already includes toolchain-specific adapters.

### Claude Code
Review:

- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/skills/`

### Codex CLI
Review:

- `.codex/config.toml`
- `.codex/skills/`

### Qwen Code
Review:

- `.qwen/settings.json`
- `.qwen/agents/`

### OpenCode
Review:

- `.opencode/plugins/`
- `.opencode/commands/`

For details, see [Toolchains](./TOOLCHAINS.md).

---

## 🎬 7. Recommended first workflow

Once the scaffold is in place:

1. Read `AGENTS.md`
2. Read `memory-bank/INDEX.md`
3. Fill the core files
4. Run `memora validate`
5. Run `memora doctor`
6. Start using the included memory workflows through your selected toolchain

A good first session looks like this:

```text
Initialize memory-bank
→ validate files
→ fill PROJECT / ARCHITECTURE / TESTING / CONVENTIONS
→ connect toolchain
→ begin workflow with AGENTS.md + INDEX.md
```

---

## ⚙️ 8. Recommended daily workflow

For everyday work:

```text
Read AGENTS.md
→ route through memory-bank/INDEX.md
→ load only relevant files
→ work on the task
→ update CURRENT.md and HANDOFF.md
→ use hooks and maintenance workflows as needed
```

During editing:

```bash
memora validate --watch
```

Before commit:

```bash
memora validate
memora validate --profile extended
```

---

## ✓ Common first-success checklist

Use this checklist to confirm your setup is healthy:

- [ ] `memora init` completed successfully
- [ ] `memory-bank/` exists
- [ ] `memora validate` passes
- [ ] `memora doctor` reports no errors
- [ ] core project files are filled with real content
- [ ] `AGENTS.md` and `memory-bank/INDEX.md` were reviewed
- [ ] chosen toolchain adapter files were checked

---

## 📚 Next reading

After this guide, continue with:

| Next Step | Purpose |
|-----------|---------|
| [CLI Reference](./CLI.md) | Learn all CLI commands and flags |
| [Memory Model](./MEMORY_MODEL.md) | Understand the 4-layer memory architecture |
| [Validation](./VALIDATION.md) | Set up quality gates and profiles |
| [Workflows](./WORKFLOWS.md) | Explore the 8 memory workflows |
| [Toolchains](./TOOLCHAINS.md) | Configure your AI agent integration |

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [INDEX.md](./INDEX.md) |
| Next → | [CLI.md](./CLI.md) |

**Other sections:** [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
