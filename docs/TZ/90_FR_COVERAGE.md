# 90. FR Coverage

## Назначение

Этот файл отвечает на два вопроса:

1. **Достаточно ли официальных примеров, чтобы начать разработку**
2. **Что уже реально реализовано в репозитории**

Статусы:

- `Полное` — пример и event contract описаны достаточно для старта реализации.
- `Частичное` — provider contract ясен, но часть реализации остаётся Memora-specific adaptation.
- `Не требуется` — требование внутреннее, а не provider-specific.

Статусы реализации:

- `Реализовано`
- `Частично`
- `Не начато`
- `Архитектурный пробел`

## Общие FR

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-001 | Shared runtime bridge layer | Не требуется | Реализовано | `lib/runtime/bridge/index.js`, `test/runtime/bridge.test.js` |
| FR-002 | Session bootstrap orchestration | Не требуется | Реализовано | Claude: `SessionStart` hook + `bootstrapSession()`; Codex/Qwen/OpenCode — следующие этапы |
| FR-003 | Turn lifecycle orchestration | Не требуется | Частично | Claude: `UserPromptSubmit` hook + `prepareTurn()` реализован; Codex/Qwen/OpenCode — следующие этапы |
| FR-004 | Canonical write gate | Не требуется | Частично | Claude: `PreToolUse`/`PostToolUse` write gate реализован; Codex/Qwen/OpenCode — следующие этапы |
| FR-005 | Graceful fallback | Не требуется | Частично | в shared bridge есть graceful degradation tests |
| FR-006 | Toolchain source tagging | Не требуется | Частично | Claude: `source=claude` в bootstrap и recall; остальные toolchains — следующие этапы |
| FR-007 | Finalize strategy split between checkpoint and true close | Не требуется | Частично | Claude: `SessionEnd` (true close) vs `Stop` (checkpoint) разделены; Codex/Qwen/OpenCode — следующие этапы |

## Claude Code

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-101 | Native bootstrap через `SessionStart` | Полное | Реализовано | `.claude/hooks/session-start.js`, `lib/runtime/bridge/claude.js`, `test/runtime/claude-session-start.test.js` |
| FR-102 | Pre-turn recall через `UserPromptSubmit` | Полное | Реализовано | `.claude/hooks/user-prompt-submit.js`, `handleUserPromptSubmit()`, `test/runtime/claude-user-prompt-submit.test.js` |
| FR-103 | Finalization через `SessionEnd` | Полное | Реализовано | `.claude/hooks/session-end.js`, `handleSessionEnd()` с try/finally, `test/runtime/claude-session-end.test.js` |
| FR-104 | Write interception через `PreToolUse` / `PostToolUse` | Полное | Реализовано | `.claude/hooks/pre-tool-use.js`, `.claude/hooks/post-tool-use.js`, `CANONICAL_MEMORY_RE`, `test/runtime/claude-write-gate.test.js` |

## Codex CLI

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-201 | Native bootstrap через `SessionStart` | Полное | Реализовано² | `lib/runtime/bridge/codex.js`, `.codex/hooks/session-start.js`, `test/runtime/codex-session-start.test.js`; output: plain text (исправлено с `additional_context` snake_case) |
| FR-202 | Pre-turn recall через `UserPromptSubmit` | Полное | Реализовано | `.codex/hooks/user-prompt-submit.js`, `handleUserPromptSubmit()`, plain stdout |
| FR-203 | `PreToolUse` / `PostToolUse` не универсальны | Частичное | Реализовано | `.codex/hooks/pre-tool-use.js` (Bash guard, exit 2), `writeCanonicalFile()` explicit helper |
| FR-204 | `Stop` как checkpoint, не true close | Полное | Реализовано | `lib/runtime/bridge/codex.js` → `handleStop()`, `.codex/hooks/stop-checkpoint.js`, `run-stop-hooks.sh` |
| FR-205 | Optional hard-close strategy | Частичное | Архитектурный пробел | у provider нет native `SessionEnd`, решение остаётся за Memora |

## Qwen Code

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-301 | Native bootstrap через `SessionStart` | Полное | Реализовано | `lib/runtime/bridge/qwen.js` → `handleSessionStart()`; `.qwen/hooks/session-start.js`; зарегистрирован в `.qwen/settings.json` |
| FR-302 | Pre-turn recall через `UserPromptSubmit` | Полное | Реализовано | `lib/runtime/bridge/qwen.js` → `handleUserPromptSubmit()`; `.qwen/hooks/user-prompt-submit.js`; зарегистрирован в `.qwen/settings.json` |
| FR-303 | Finalization через `SessionEnd` | Полное | Реализовано | `lib/runtime/bridge/qwen.js` → `handleSessionEnd()` с `onSessionEnd()` + `shutdownAll()`; `.qwen/hooks/session-end.js`; true close в отличие от Codex |
| FR-304 | Write interception через `PreToolUse` / `PostToolUse` | Полное | Реализовано | `lib/runtime/bridge/qwen.js` → `handlePreToolUse()` + `handlePostToolUse()`; `.qwen/hooks/pre-tool-use.js`, `.qwen/hooks/post-tool-use.js`; matcher: `Write\|Edit\|MultiEdit` |

## OpenCode

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-401 | Native plugin bridge | Полное | Не начато | examples для `session.created`, `tool.execute.before`, `session.deleted` есть |
| FR-402 | Pre-turn recall через `chat.message` | Полное | Не начато | example есть, system-transform отделён отдельно |
| FR-403 | True close через `session.deleted` | Полное | Не начато | example есть, `session.idle` исключён как finalizer |
| FR-404 | `session.status` primary, `session.idle` legacy | Полное | Не начато | examples для `session.status` и legacy `session.idle` есть |

## Вывод

### Статус по состоянию на 2026-04-17 (обновлено после feat/qwen-hook-entrypoints)

**Claude Code — полностью завершён (FR-101–FR-104):**
- `SessionStart` bootstrap ✅
- `UserPromptSubmit` pre-turn recall ✅
- `PreToolUse`/`PostToolUse` write gate ✅
- `SessionEnd` finalization ✅

**Codex CLI — реализован, требует live-верификации после исправления конфига (FR-201–FR-204):**

> ² Корневая причина отсутствия hooks в live-тестировании 2026-04-17: hooks объявлялись
> в `[hooks.*]` внутри `config.toml`, тогда как официальные docs OpenAI Codex требуют
> отдельный файл `hooks.json`. Исправлено: создан `.codex/hooks.json` с корректным форматом.
> Дополнительно исправлен output format `SessionStart`: `{ additional_context }` (snake_case)
> заменён на plain text согласно актуальным docs.
> Источники: https://developers.openai.com/codex/hooks,
>             https://developers.openai.com/codex/config-reference

- `SessionStart` bootstrap ✅ (output: plain text)
- `UserPromptSubmit` pre-turn recall ✅ (plain text)
- `PreToolUse` Bash guard + `writeCanonicalFile` ✅
- `Stop` checkpoint ✅

**Qwen Code — полностью завершён (FR-301–FR-304):**
- `SessionStart` bootstrap ✅ (JSON hookSpecificOutput)
- `UserPromptSubmit` pre-turn recall ✅
- `PreToolUse` write gate ✅ (явный permissionDecision: allow/deny)
- `PostToolUse` canonical write observer ✅
- `SessionEnd` true finalization ✅ (onSessionEnd + shutdownAll — нет пробела FR-205)
- `test/runtime/qwen-bridge.test.js` ✅ (33 кейса)

**Следующие в очереди:**
- OpenCode: FR-401–FR-404

**Открытые архитектурные вопросы:**
- FR-205: hard-close semantics для Codex CLI (нет native `SessionEnd`)
- Pending: live-верификация hooks после применения `hooks.json`

