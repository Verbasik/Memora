# Getting Started

**Purpose:** help you get Memora running in a project quickly.  
**Audience:** first-time users and evaluators.  
**Read when:** you want a practical setup path with the fewest decisions.  
**See also:** [CLI Reference](./CLI.md), [Toolchains](./TOOLCHAINS.md), [Workflows](./WORKFLOWS.md)

---

## What you will get

After completing this guide, you will have:

- a Memora memory-bank scaffold inside your project,
- core memory files ready to fill,
- front-matter validation working locally,
- a clear path to connect your preferred AI toolchain.

---

## Prerequisites

You need:

- Node.js `>=16`
- `bash` (macOS/Linux; on Windows use Git Bash or WSL)

---

## 1. Install Memora

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

## 2. Initialize a project memory-bank

From your repository root:

```bash
memora init .
```

Or create a new target directory:

```bash
memora init ./my-project
cd ./my-project
```

What this gives you:

- `AGENTS.md`
- `CLAUDE.md`
- `memory-bank/`
- `schemas/`
- toolchain adapter directories such as `.claude/`, `.codex/`, `.qwen/`, `.opencode/`
- generated session-state files in `memory-bank/.local/`
- helper scripts in `memory-bank/scripts/`

---

## 3. Validate the scaffold

Run:

```bash
memora validate
```

This checks the front matter of `memory-bank/*.md` files and confirms that the scaffold is structurally sound.

You can also use:

```bash
memora validate --strict
memora validate --format json
memora validate --watch
```

---

## 4. Fill the core project files first

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

## 5. Review the entry points

Memora’s main entry points are:

- `AGENTS.md` — agent entry contract
- `memory-bank/INDEX.md` — routing table for minimal relevant context
- `memory-bank/LIFECYCLE.md` — lifecycle and maintenance model

These files are the best way to understand how a toolchain or agent should enter and navigate the memory-bank.

---

## 6. Connect your preferred toolchain

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

## 7. Recommended first workflow

Once the scaffold is in place:

1. Read `AGENTS.md`
2. Read `memory-bank/INDEX.md`
3. Fill the core files
4. Run `memora validate`
5. Start using the included memory workflows through your selected toolchain

A good first session looks like this:

```text
Initialize memory-bank
→ validate files
→ fill PROJECT / ARCHITECTURE / TESTING / CONVENTIONS
→ connect toolchain
→ begin workflow with AGENTS.md + INDEX.md
```

---

## 8. Recommended daily workflow

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
```

---

## Common first-success checklist

Use this checklist to confirm your setup is healthy:

- [ ] `memora init` completed successfully
- [ ] `memory-bank/` exists
- [ ] `memora validate` passes
- [ ] core project files are filled with real content
- [ ] `AGENTS.md` and `memory-bank/INDEX.md` were reviewed
- [ ] chosen toolchain adapter files were checked

---

## Next reading

After this guide, continue with:

- [CLI Reference](./CLI.md)
- [Memory Model](./MEMORY_MODEL.md)
- [Validation](./VALIDATION.md)
- [Toolchains](./TOOLCHAINS.md)

---

**Last updated:** 2026-03-28
