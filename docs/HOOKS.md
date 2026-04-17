# 🔔 Hooks

**Purpose:** Explain the deterministic advisory hook system included in Memora.  
**Audience:** Maintainers, toolchain integrators, advanced users.  
**Read when:** You want to configure or understand reflection, consolidation, and cleanup reminders.  
**Last updated:** 2026-04-17

**See also:** [Toolchains](./TOOLCHAINS.md) · [Workflows](./WORKFLOWS.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Why hooks matter](#-why-hooks-matter)
- [Hook model](#-hook-model)
- [Two types of hooks](#-two-types-of-hooks)
- [Runtime lifecycle hooks](#-runtime-lifecycle-hooks)
- [Advisory hooks](#-advisory-hooks)
- [Thresholds](#-thresholds)
- [Why the hooks are advisory](#-why-the-hooks-are-advisory)
- [Per-toolchain integration](#-per-toolchain-integration)
- [Activation and verification](#-activation-and-verification)
- [Manual testing](#-manual-testing)
- [Operational value](#-operational-value)
- [Best practices](#-best-practices)
- [Troubleshooting checklist](#-troubleshooting-checklist)
- [Navigation](#-navigation)

---

## 🎯 Why hooks matter

AI-agent workflows can accumulate session state quickly. Memora’s hook system makes memory maintenance visible through **deterministic advisory reminders**.

That matters because it gives you:

- predictable maintenance signals,
- less reliance on agent improvisation,
- reusable operational behavior across toolchains.

The hook layer is one of Memora’s strongest practical features today.

---

## 🏗️ Hook model

At a high level:

```text
Agent session ends
→ Stop-style event fires
→ hook script checks memory-bank session state
→ threshold is evaluated
→ advisory reminder is shown if maintenance is due
```

The important property is this:

- the hooks are **deterministic**,
- the hooks are **non-blocking**,
- the hooks are **advisory**.

This gives operational visibility without forcing intrusive automation.

---

## 🔀 Two types of hooks

Memora's hook system has grown to include two distinct categories:

### Advisory hooks

Maintenance reminders that fire on the **Stop event** at the end of a session. They check thresholds (session count, file size) and print a non-blocking reminder if maintenance is due. Implemented for all four toolchains.

### Runtime lifecycle hooks

Session management hooks that connect native toolchain lifecycle events to the runtime bridge (`lib/runtime/bridge/`). They handle session bootstrap, per-turn recall injection, write gating, write auditing, and session finalization. Fully implemented for Claude Code and Codex CLI; planned for Qwen Code and OpenCode.

---

## 🔄 Runtime lifecycle hooks

### Overview

Runtime lifecycle hooks wire into the toolchain's own event system — not just the terminal Stop event — to give Memora structured control over every phase of an agent session. Each hook delegates to the shared runtime bridge in `lib/runtime/bridge/`, keeping provider-specific code thin.

### Event coverage

| Event | Claude Code | Codex CLI | Qwen Code | OpenCode |
|---|---|---|---|---|
| `SessionStart` | bootstrap ✅ | bootstrap ✅ | planned (FR-301) | planned (FR-401) |
| `UserPromptSubmit` | recall ✅ | recall ✅ (staged) | planned (FR-302) | planned (FR-402) |
| `PreToolUse` | write gate ✅ | Bash guard ✅ | planned (FR-303) | planned (FR-403) |
| `PostToolUse` | write audit ✅ | — | planned | planned |
| `SessionEnd` | finalize ✅ | — (FR-205) | planned (FR-304) | planned (FR-404) |
| `Stop` | — | checkpoint ✅ | — | — |

### Event descriptions

**`SessionStart`** — fires when the toolchain opens a new session. The hook runs `onSessionStart` from the runtime bridge: it takes a memory-bank snapshot, opens the transcript, and injects startup context.

**`UserPromptSubmit`** — fires before each user turn is processed. The hook runs pre-turn recall: it reads relevant memory-bank context and makes it available to the model for the upcoming turn.

**`PreToolUse`** — fires before a tool call executes. The hook acts as a write gate: it inspects the tool name and arguments, and blocks writes to canonical memory files if the call does not meet policy. Exit code `2` causes the toolchain to block the tool call.

**`PostToolUse`** — fires after a tool call completes successfully. The hook records the write in the audit log so the session transcript reflects what changed in the memory bank.

**`SessionEnd`** — fires when the toolchain closes the session. The hook runs `onSessionEnd` and `shutdownAll` from the runtime bridge: it finalizes the transcript and flushes session state.

**`Stop`** (Codex only) — Codex CLI has no native `SessionEnd` event. The Stop hook is used as a turn-level checkpoint instead: it syncs the transcript and runs the advisory hooks. This is not a full session finalization (see FR-205).

### File locations

- **Claude Code:** `.claude/hooks/` — `session-start.js`, `user-prompt-submit.js`, `pre-tool-use.js`, `post-tool-use.js`, `session-end.js`
- **Codex CLI:** `.codex/hooks/` — `session-start.js`, `user-prompt-submit.js`, `pre-tool-use.js`, `stop-checkpoint.js` + `run-stop-hooks.sh`; wired via `.codex/hooks.json`

### Codex UserPromptSubmit staging

Codex CLI always echoes hook stdout to the terminal. Injecting full recall context on stdout would produce a wall-of-text on every turn. To avoid this, the Codex `user-prompt-submit.js` hook uses a **staging approach**: the full recall context is written to `memory-bank/.local/ACTIVE_RECALL.md`, and only a brief one-liner is printed to stdout (e.g. `[recall] context staged → .local/ACTIVE_RECALL.md`). The model reads the staged file directly.

### FR-205 — Codex SessionEnd gap

Codex CLI does not expose a native `SessionEnd` event. Until this is resolved upstream, the Stop hook acts as a best-effort checkpoint (transcript sync + advisory hooks) but does not run full session finalization (`shutdownAll`). Tracked as FR-205.

---

## 📋 Advisory hooks

Memora includes three shell hooks:

### `check-reflect-trigger.sh`
Used to remind when enough unreflected sessions have accumulated.

### `check-consolidate-trigger.sh`
Used to remind when enough unconsolidated session material exists.

### `check-gc-trigger.sh`
Used to remind when session files have grown large enough to justify cleanup.

### `run-stop-hooks.sh`
A wrapper script used in environments that support only one stop hook command.

---

## ⚙️ Thresholds

The default thresholds are:

| Variable | Meaning | Default |
|---|---|---:|
| `REFLECT_THRESHOLD` | sessions without reflection | 3 |
| `CONSOLIDATE_THRESHOLD` | sessions without consolidation | 5 |
| `GC_THRESHOLD` | total files in `SESSIONS/` | 20 |

These defaults make the maintenance flow visible without becoming noisy.

---

## 🔵 Why the hooks are advisory

Memora uses an advisory model on purpose.

That gives you several benefits:

- maintenance reminders remain visible,
- the workflow stays non-blocking,
- teams retain control over timing,
- behavior remains easier to understand and debug.

This design is especially useful in AI-agent environments where predictability matters.

---

## 🔌 Per-toolchain integration

### Advisory hooks wiring

All four providers run the same shell scripts in `memory-bank/scripts/`. What differs is the wiring mechanism and how the script path is resolved.

#### Claude Code

- **Config:** `.claude/settings.json` — `hooks.Stop` array with three separate commands.
- **Path resolution:** `$(git rev-parse --show-toplevel)` in each command string — works from any directory.

#### Codex CLI

- **Config:** `.codex/config.toml` — single `[hooks.Stop]` entry calling `run-stop-hooks.sh`.
- **Path resolution:** `$(git rev-parse --show-toplevel)` in the command string.
- **⚠️ Note:** Hook support is experimental (Codex CLI v0.114.0+). A wrapper script is used because Codex supports only one stop hook entry. Hook format may change in future Codex releases.

#### Qwen Code

- **Config:** `.qwen/settings.json` — `hooks.Stop` array, same structure as Claude Code.
- **Path resolution:** `$(git rev-parse --show-toplevel)` in each command string — works from any directory.

#### OpenCode

- **Config:** `.opencode/plugins/` — three ES module plugins (`reflect-trigger.js`, `consolidate-trigger.js`, `gc-trigger.js`).
- **Mechanism:** Subscribes to `session.idle` and `tool.execute.after` events — event-driven, unlike the config-driven Stop hooks of the other providers.
- **Path resolution:** `execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd })` resolves the repo root before invoking the script, so hooks work correctly from any subdirectory.

### Runtime lifecycle hooks wiring

Runtime lifecycle hooks are implemented only for Claude Code and Codex CLI at present.

- **Claude Code:** Five JS hook scripts in `.claude/hooks/`, registered in `.claude/settings.json` under their respective event keys (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SessionEnd`). Each script is a thin adapter that imports and calls the runtime bridge.
- **Codex CLI:** Four JS hook scripts in `.codex/hooks/`, registered in `.codex/hooks.json`. Uses a staging pattern for `UserPromptSubmit` (see [Codex UserPromptSubmit staging](#codex-userpromptsubmit-staging)) and a Stop checkpoint instead of SessionEnd (see [FR-205](#fr-205--codex-sessionend-gap)).
- **Qwen Code / OpenCode:** Runtime lifecycle hooks are planned (FR-301–FR-304 / FR-401–FR-404). Not yet implemented.

For full adapter details, see [Toolchains](./TOOLCHAINS.md).

---

## ⚠️ Known provider differences

| Area | Claude Code | Codex CLI | Qwen Code | OpenCode |
|---|---|---|---|---|
| Advisory hook mechanism | Stop array (JSON) | Single Stop command (TOML) | Stop array (JSON) | Event plugins (JS) |
| Path resolution | `git rev-parse` in command | `git rev-parse` in command | `git rev-parse` in command | `execFileSync git rev-parse` |
| Advisory hook support status | Stable | Experimental ¹ | Stable | Stable |
| Runtime lifecycle hooks | Full (5 events) ✅ | Partial (Stop checkpoint, FR-205) ✅ | Planned (FR-301–304) | Planned (FR-401–404) |
| `SessionEnd` support | Native ✅ | Not available (FR-205) | Planned | Planned |
| Recall injection | Direct (stdout suppressed) | Staged to `ACTIVE_RECALL.md` | Planned | Planned |

> ¹ Codex hook support added in v0.114.0 (March 2026). Verify format after Codex upgrades.

## ✅ Activation and verification

When `memora init` or package `postinstall` runs inside a git repository, `init.sh` activates `.githooks/` through `git config core.hooksPath .githooks`.

After installation, verify the setup with:

```bash
memora doctor
```

This checks that the pre-commit hook exists, is executable, and is wired into git.

---

## 🧪 Manual testing

You can run the scripts directly.

### Reflection check

```bash
bash memory-bank/scripts/check-reflect-trigger.sh
```

### Consolidation check

```bash
bash memory-bank/scripts/check-consolidate-trigger.sh
```

### Cleanup check

```bash
bash memory-bank/scripts/check-gc-trigger.sh
```

### All stop hooks

```bash
bash memory-bank/scripts/run-stop-hooks.sh
```

This makes the hook system easy to verify locally.

---

## 💡 Operational value

The hook system adds real value because it:

- reinforces healthy memory maintenance,
- works across multiple toolchains,
- stays simple to inspect,
- stays easy to test,
- remains independent from a single vendor-specific environment.

It turns memory maintenance into a visible operational rhythm rather than an afterthought.

---

## 💼 Best practices

- Keep the hook scripts in the repository as part of normal project setup.
- Keep `.githooks/` activated through `core.hooksPath=.githooks`.
- Use the default thresholds first before tuning them.
- Test hook output directly at least once per environment.
- Keep hook behavior advisory and predictable.
- Pair hooks with the workflows in [Workflows](./WORKFLOWS.md).

---

## 🔍 Troubleshooting checklist

If you do not see reminders when expected:

- confirm the session files exist,
- run the scripts directly from the repository root,
- verify the relevant toolchain adapter is active,
- confirm the thresholds are not set too high,
- check that the expected stop event is actually firing.

---

## 📚 Related reading

- [Toolchains](./TOOLCHAINS.md)
- [Workflows](./WORKFLOWS.md)
- [Security](./SECURITY.md)

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [VALIDATION.md](./VALIDATION.md) |
| Next → | [TOOLCHAINS.md](./TOOLCHAINS.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
