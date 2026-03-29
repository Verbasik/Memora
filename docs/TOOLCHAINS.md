# Toolchains

**Purpose:** explain how Memora integrates with supported AI coding environments.  
**Audience:** users choosing a toolchain, maintainers, integrators.  
**Read when:** you want to connect Memora to Claude Code, Codex CLI, Qwen Code, or OpenCode.  
**See also:** [Hooks](./HOOKS.md), [Workflows](./WORKFLOWS.md), [Getting Started](./GETTING_STARTED.md)

---

## Overview

Memora’s memory-bank model is designed to be shared across multiple AI coding toolchains.

That gives the project an important strength:

- the memory structure stays consistent,
- the adapter layer changes by toolchain,
- workflows remain portable.

In practice, that means the same project memory can be reused across several AI environments without redesigning the whole system.

---

## Shared integration strategy

All supported toolchains connect to the same core assets:

- `AGENTS.md`
- `memory-bank/INDEX.md`
- `memory-bank/LIFECYCLE.md`
- `memory-bank/`
- `memory-bank/scripts/`

What changes per environment is the **adapter layer**:

- config files,
- hooks wiring,
- skills / commands / agent files,
- plugin or integration points.

---

## Claude Code

### Included adapter assets

- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/skills/`

### What this gives you

- a Claude-specific entry point,
- hook integration,
- workflow documents in the Claude skills format,
- a clean path into the shared memory-bank.

### When to choose Claude Code

Choose Claude Code when you want:

- direct project-level skill files,
- explicit hook configuration,
- a straightforward path from agent entry to memory-bank routing.

---

## Codex CLI

### Included adapter assets

- `.codex/config.toml`
- `.agents/skills/`
- `.codex/skills/`

### What this gives you

- Codex-specific project configuration,
- a resolved `.agents/skills/` discovery path for Codex CLI,
- stop-hook integration via wrapper script,
- workflow documents adapted to the Codex layer.

### When to choose Codex CLI

Choose Codex CLI when you want:

- a lightweight terminal-centric workflow,
- project-scoped configuration,
- compatibility with Memora’s shared memory-bank model.

---

## Qwen Code

### Included adapter assets

- `.qwen/settings.json`
- `.qwen/agents/`

### What this gives you

- Qwen-specific settings for project context,
- a single canonical entry file: `AGENTS.md`,
- hook integration,
- workflow files adapted to the Qwen agent layer.

### When to choose Qwen Code

Choose Qwen Code when you want:

- a Claude-like project setup pattern,
- dedicated agent files,
- compatibility with the shared memory-bank architecture.

---

## OpenCode

### Included adapter assets

- `.opencode/plugins/`
- `.opencode/commands/`

### What this gives you

- plugin-based hook integration,
- command-style workflow files,
- a modular adapter surface around the same shared memory-bank.

### When to choose OpenCode

Choose OpenCode when you want:

- plugin-based operational integration,
- event-driven hook behavior,
- command-oriented workflow organization.

---

## Compatibility overview

| Area | Claude Code | Codex CLI | Qwen Code | OpenCode |
|---|:---:|:---:|:---:|:---:|
| Adapter files included | ✅ | ✅ | ✅ | ✅ |
| Hook integration available | ✅ | ✅ | ✅ | ✅ |
| Workflow files included | ✅ | ✅ | ✅ | ✅ |
| Shared memory-bank model | ✅ | ✅ | ✅ | ✅ |

This is one of Memora’s strongest product properties today: **the architecture is shared, the adapters are toolchain-specific**.

---

## Choosing a toolchain

A practical way to choose:

### Choose Claude Code if
you want a direct project-skill setup with clear entry-point files.

### Choose Codex CLI if
you prefer a compact CLI-centric environment.

### Choose Qwen Code if
you want a settings-and-agents pattern similar to Claude-style project integration.

### Choose OpenCode if
you want a plugin-driven and command-oriented integration surface.

---

## Best practices

- Treat the memory-bank itself as the stable center of the system.
- Treat toolchain files as adapters around that center.
- Keep `AGENTS.md` and `memory-bank/INDEX.md` as canonical entry and routing surfaces.
- Reuse the same core memory structure across environments when possible.

---

## Related reading

- [Hooks](./HOOKS.md)
- [Workflows](./WORKFLOWS.md)
- [Memory Model](./MEMORY_MODEL.md)

---

**Last updated:** 2026-03-28
