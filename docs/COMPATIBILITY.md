# 🔗 Compatibility Matrix

**Purpose:** Document supported provider versions, adapter-layer capabilities, and known version-specific limitations.
**Audience:** Maintainers, integrators, QA reviewers.
**Read when:** You need to know which provider version supports which Memora feature, or when troubleshooting a version-specific issue.
**Last updated:** 2026-04-16

**See also:** [Toolchains](./TOOLCHAINS.md) · [Hooks](./HOOKS.md) · [Security](./SECURITY.md)

---

## 📖 Table of Contents

- [Version support policy](#-version-support-policy)
- [Claude Code](#-claude-code)
- [Codex CLI](#-codex-cli)
- [Qwen Code](#-qwen-code)
- [OpenCode](#-opencode)
- [Feature matrix summary](#-feature-matrix-summary)
- [Upgrade guidance](#-upgrade-guidance)
- [Navigation](#-navigation)

---

## 📋 Version support policy

Memora declares compatibility at the **adapter layer** — the files in `.claude/`, `.codex/`, `.qwen/`, `.opencode/`. Native platform capabilities evolve independently.

A provider version is considered **supported** when:

- the adapter config format is accepted by the provider without errors,
- core memory workflows can be invoked,
- advisory hooks fire at session end.

A provider version is **unsupported** when any of the above breaks. Check provider release notes after major upgrades.

---

## 🔵 Claude Code

| Attribute | Value |
|---|---|
| Minimum tested version | Claude Code CLI 1.x (2025+) |
| Config format | `.claude/settings.json` (JSON) |
| Hook mechanism | `hooks.Stop` array |
| Hook status | Stable |
| Guardrail enforcement | Hard (`permissions.deny` + `.claudeignore`) |
| Workflow surface | `.claude/skills/*/SKILL.md` + `.claude/agents/*.md` |

### Version-specific notes

- `permissions.deny` and `hooks.Stop` are stable features present since the initial public release of Claude Code.
- The `memory-explorer` workflow uses the sub-agent surface (`.claude/agents/`), which requires Claude Code to support the `tools:` and `model:` frontmatter fields.

---

## ⚙️ Codex CLI

| Attribute | Value |
|---|---|
| Minimum required version | `v0.114.0` (March 2026) |
| Config format | `.codex/config.toml` (TOML) |
| Hook mechanism | `[hooks.Stop]` single command via `run-stop-hooks.sh` |
| Hook status | **Experimental** — added in v0.114.0 |
| Guardrail enforcement | Advisory only (no native deny/ignore config) |
| Workflow surface | `.agents/skills/*/SKILL.md` (discovery path) |

### Version-specific notes

- **Hook support requires v0.114.0+.** Earlier versions ignore `[hooks.Stop]` silently. Verify with `codex --help | grep hook`.
- Hook format may change in future Codex releases. After a Codex upgrade, confirm `[hooks.Stop]` syntax in the current docs.
- Fallback: if hooks stop working, uncomment the `[notify]` block in `.codex/config.toml` as a temporary advisory mechanism.
- The `.agents/skills/` discovery path is the Codex-native location; `.codex/skills/` is the Memora-canonical source. Both are included in scaffold via symlinks.

---

## 🟠 Qwen Code

| Attribute | Value |
|---|---|
| Minimum tested version | Qwen Code 1.x with `settings.json` v3 support |
| Config format | `.qwen/settings.json` (JSON, `$version: 3`) |
| Hook mechanism | `hooks.Stop` array (same structure as Claude Code) |
| Hook status | Stable |
| Guardrail enforcement | Partial (`.qwen/settings.qwenignore`) |
| Workflow surface | `.qwen/agents/*.md` and `.qwen/commands/*.md` (dual surface) |

### Version-specific notes

- `$version: 3` in `settings.json` must be respected; older Qwen versions may not support the `hooks` key.
- Qwen maintains a **dual surface** (`.qwen/agents/` and `.qwen/commands/`). Both must remain in sync — drift between them is not automatically detected by the parity test suite.
- `.qwen/settings.qwenignore` provides partial guardrail enforcement for file exclusion.

---

## 🟣 OpenCode

| Attribute | Value |
|---|---|
| Minimum tested version | OpenCode with ES module plugin support |
| Config format | `.opencode/plugins/*.js` (ES modules) + `package.json` |
| Hook mechanism | Event subscriptions (`session.idle`, `tool.execute.after`) |
| Hook status | Stable (plugin API) |
| Guardrail enforcement | Advisory only (no native deny/ignore config) |
| Workflow surface | `.opencode/commands/*.md` |

### Version-specific notes

- Plugins require `"type": "module"` in `.opencode/plugins/package.json`. CommonJS syntax will not work.
- Hook path resolution uses `execFileSync("git", ["rev-parse", "--show-toplevel"])` to handle subdirectory invocations. If OpenCode changes `ctx.cwd` semantics, this may need revisiting.
- The event model (`session.idle`, `tool.execute.after`) must remain available in the OpenCode plugin API. If OpenCode changes its event bus, the plugin subscriptions need updating.

---

## 🌐 Feature matrix summary

| Feature | Claude Code | Codex CLI | Qwen Code | OpenCode |
|---|:---:|:---:|:---:|:---:|
| Core workflows (9) | ✅ | ✅ | ✅ | ✅ |
| Advisory hooks | ✅ | ✅ ¹ | ✅ | ✅ |
| Config-driven hooks | ✅ | ✅ ¹ | ✅ | — ² |
| Event-driven hooks | — | — | — | ✅ |
| Hard guardrails | ✅ | — | ⚠️ ³ | — |
| Dual workflow surface | — | — | ✅ ⁴ | — |

> ¹ Requires Codex CLI v0.114.0+. Experimental.
> ² OpenCode uses JS plugin subscriptions, not a config file field.
> ³ Partial enforcement via `.qwen/settings.qwenignore` only.
> ⁴ `.qwen/agents/` and `.qwen/commands/` must remain in sync manually.

---

## 🔄 Upgrade guidance

### After upgrading Claude Code

Verify `.claude/settings.json` permissions and hooks format is still accepted. Claude Code generally maintains backwards compatibility in settings format.

### After upgrading Codex CLI

1. Run `codex --help | grep hook` — confirm `[hooks.Stop]` format.
2. If hooks format changed, update `.codex/config.toml` accordingly.
3. Run `node test/parity.js` to confirm hook config file still exists.

### After upgrading Qwen Code

Verify `$version: 3` in `.qwen/settings.json` is still the current schema version. Check if `hooks.Stop` syntax has changed.

### After upgrading OpenCode

1. Confirm `session.idle` and `tool.execute.after` events are still in the plugin API.
2. Confirm `ctx.cwd` is still the correct way to access the working directory.
3. Confirm `"type": "module"` is still required for plugins.

---

## 🧭 Navigation

| Link | Destination |
|---|---|
| ← Back | [TOOLCHAINS.md](./TOOLCHAINS.md) |
| → See also | [HOOKS.md](./HOOKS.md) · [SECURITY.md](./SECURITY.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
