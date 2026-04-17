# 🔌 Toolchains

**Purpose:** Explain how Memora integrates with supported AI coding environments.  
**Audience:** Users choosing a toolchain, maintainers, integrators.  
**Read when:** You want to connect Memora to Claude Code, Codex CLI, Qwen Code, or OpenCode.  
**Last updated:** 2026-04-17

**See also:** [Hooks](./HOOKS.md) · [Workflows](./WORKFLOWS.md) · [Getting Started](./GETTING_STARTED.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Shared integration strategy](#-shared-integration-strategy)
- [Claude Code](#-claude-code)
- [Codex CLI](#-codex-cli)
- [Qwen Code](#-qwen-code)
- [OpenCode](#-opencode)
- [Compatibility overview](#-compatibility-overview)
- [Choosing a toolchain](#-choosing-a-toolchain)
- [Best practices](#-best-practices)
- [Navigation](#-navigation)

---

## 🎯 Overview

Memora’s memory-bank model is designed to be shared across multiple AI coding toolchains.

That gives the project an important strength:

- the memory structure stays consistent,
- the adapter layer changes by toolchain,
- workflows remain portable.

In practice, that means the same project memory can be reused across several AI environments without redesigning the whole system.

---

## 🏗️ Shared integration strategy

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

## 🔵 Claude Code

### Claude adapter assets

- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/skills/`
- `.claude/hooks/` (`session-start.js`, `user-prompt-submit.js`, `pre-tool-use.js`, `post-tool-use.js`, `session-end.js`)

### Claude capabilities

- a Claude-specific entry point,
- full runtime bridge integration (FR-101–FR-104):
  - session bootstrap on `SessionStart` (frozen snapshot, transcript session open),
  - pre-turn recall on `UserPromptSubmit` (past sessions injected as context),
  - canonical write gate on `PreToolUse`/`PostToolUse` (security screening + audit),
  - session finalization on `SessionEnd` (`onSessionEnd()` + `shutdownAll()`),
- workflow documents in the Claude skills format,
- a clean path into the shared memory-bank.

### When to choose Claude Code

Choose Claude Code when you want:

- direct project-level skill files,
- explicit hook configuration,
- a straightforward path from agent entry to memory-bank routing.

---

## ⚙️ Codex CLI

### Codex adapter assets

- `.codex/config.toml`
- `.codex/hooks.json`
- `.agents/skills/`
- `.codex/skills/`
- `.codex/hooks/` (`session-start.js`, `user-prompt-submit.js`, `pre-tool-use.js`, `stop-checkpoint.js`)

### Codex capabilities

- Codex-specific project configuration,
- a resolved `.agents/skills/` discovery path for Codex CLI,
- runtime bridge integration (FR-201–FR-204):
  - session bootstrap on `SessionStart`,
  - pre-turn recall on `UserPromptSubmit` (staged to file, brief reference on stdout),
  - Bash command guard on `PreToolUse` (exit 2 blocks canonical memory writes),
  - `Stop` checkpoint after each turn (not true `SessionEnd` — FR-205 architectural gap),
- workflow documents adapted to the Codex layer.

### When to choose Codex CLI

Choose Codex CLI when you want:

- a lightweight terminal-centric workflow,
- project-scoped configuration,
- compatibility with Memora’s shared memory-bank model.

---

## 🟠 Qwen Code

### Qwen adapter assets

- `.qwen/settings.json`
- `.qwen/agents/`

### Qwen capabilities

- Qwen-specific settings for project context,
- a single canonical entry file: `AGENTS.md`,
- hook integration (advisory Stop hooks only — runtime bridge hooks FR-301–FR-304 are planned but not yet implemented),
- workflow files adapted to the Qwen agent layer.

### When to choose Qwen Code

Choose Qwen Code when you want:

- a Claude-like project setup pattern,
- dedicated agent files,
- compatibility with the shared memory-bank architecture.

---

## 🟣 OpenCode

### 🟣 OpenCode adapter assets

- `.opencode/plugins/`
- `.opencode/commands/`

### 🟣 OpenCode capabilities

- plugin-based hook integration (3 trigger plugins; runtime bridge plugin FR-401–FR-404 is planned but not yet implemented),
- command-style workflow files,
- a modular adapter surface around the same shared memory-bank.

### When to choose OpenCode

Choose OpenCode when you want:

- plugin-based operational integration,
- event-driven hook behavior,
- command-oriented workflow organization.

---

## 🌐 Compatibility overview

| Area | Claude Code | Codex CLI | Qwen Code | OpenCode |
|---|:---:|:---:|:---:|:---:|
| Adapter files included | ✅ | ✅ | ✅ | ✅ |
| Core workflow files (9) | ✅ | ✅ | ✅ | ✅ |
| Hook integration | ✅ | ✅ ¹ | ✅ | ✅ ² |
| Hard guardrail enforcement | ✅ | ⚠️ ³ | ⚠️ ⁴ | ⚠️ ³ |
| Shared memory-bank model | ✅ | ✅ | ✅ | ✅ |
| Runtime bridge hooks | ✅ | ✅ ⁵ | 🔜 | 🔜 |

**Legend:** ✅ supported · ⚠️ advisory-only or partial · 🔜 planned (see notes below)

> ¹ **Codex:** Hook support is experimental (added in Codex CLI v0.114.0). A single `[hooks.Stop]` entry is supported via a wrapper script. Hook format may change in future Codex releases.
>
> ² **OpenCode:** Hooks are implemented as ES module plugins subscribing to `session.idle` and `tool.execute.after` events — a different mechanism than the config-driven Stop hooks used by Claude Code and Qwen Code.
>
> ³ **Codex / OpenCode:** No native deny/ignore enforcement configuration. Secret and PII protection is advisory-only, provided through workflow guidance and `memory-bank/POLICIES/`. See [Security](./SECURITY.md) for compensating controls.
>
> ⁴ **Qwen:** Partial enforcement via `.qwen/settings.qwenignore`. No deny-list equivalent to Claude Code’s `permissions.deny`.
>
> ⁵ **Codex CLI runtime bridge complete** (SessionStart, UserPromptSubmit, PreToolUse, Stop checkpoint). FR-205: no native SessionEnd — Stop is checkpoint only.

The architecture is shared, the adapters are toolchain-specific. Parity is verified at the adapter layer; native enforcement capabilities differ between providers.

---

## ⚠️ Provider-specific limitations

### Codex CLI — experimental hook support

Codex hook integration was added in v0.114.0 (March 2026) and is marked experimental. The TOML hook format may change. If hooks stop working after a Codex upgrade, check `codex --help | grep hook` for the current format.

### OpenCode — advisory-only guardrails

OpenCode does not expose a deny/ignore configuration equivalent to Claude Code’s `permissions.deny`. All guardrail protection for OpenCode is advisory: workflows and `AGENTS.md` instruct the agent on secret handling, but the toolchain does not enforce it at the platform level.

### Qwen Code — dual workflow surface

Qwen maintains two mirrored surfaces (`.qwen/agents/` and `.qwen/commands/`). Both must stay in sync. Drift between them is not caught by the adapter layer alone.

### Claude Code — memory-explorer as sub-agent

Claude Code implements `memory-explorer` as a sub-agent (`.claude/agents/`) rather than a skill (`.claude/skills/`). The behavioral output is equivalent; the invocation surface differs from other providers.

---

## 🎯 Choosing a toolchain

A practical way to choose:

### Choose Claude Code if
you want a direct project-skill setup with clear entry-point files and full runtime bridge integration (session bootstrap, pre-turn recall, write gate, session finalization).

### Choose Codex CLI if
you prefer a compact CLI-centric environment with runtime bridge hooks (SessionStart, UserPromptSubmit, PreToolUse, Stop checkpoint) and can accept the FR-205 architectural gap (no native SessionEnd).

### Choose Qwen Code if
you want a settings-and-agents pattern similar to Claude-style project integration.

### Choose OpenCode if
you want a plugin-driven and command-oriented integration surface.

---

## 💡 Best practices

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

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [HOOKS.md](./HOOKS.md) |
| Next → | [PATTERNS.md](./PATTERNS.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
