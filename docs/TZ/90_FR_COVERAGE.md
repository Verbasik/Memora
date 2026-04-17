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
| FR-201 | Native bootstrap через `SessionStart` | Полное | Код готов, CLI не вызывает¹ | `lib/runtime/bridge/codex.js`, `.codex/hooks/session-start.js`, `test/runtime/codex-session-start.test.js`; JS-хук работает вручную, но Codex CLI v0.121.0 его не вызывает |
| FR-202 | Pre-turn recall через `UserPromptSubmit` | Полное | Код готов, CLI не вызывает¹ | `.codex/hooks/user-prompt-submit.js`, `handleUserPromptSubmit()`, plain stdout; JS-хук работает вручную, но Codex CLI v0.121.0 его не вызывает |
| FR-203 | `PreToolUse` / `PostToolUse` не универсальны | Частичное | Код готов, CLI не вызывает¹ | `.codex/hooks/pre-tool-use.js` (Bash guard, exit 2), `writeCanonicalFile()` explicit helper; JS-хук работает вручную, но Codex CLI v0.121.0 его не вызывает |
| FR-204 | `Stop` как checkpoint, не true close | Полное | Код готов, CLI не вызывает¹ | `lib/runtime/bridge/codex.js` → `handleStop()`, `.codex/hooks/stop-checkpoint.js`, `run-stop-hooks.sh`; JS-хук работает вручную, но Codex CLI v0.121.0 его не вызывает |
| FR-205 | Optional hard-close strategy | Частичное | Архитектурный пробел | у provider нет native `SessionEnd`, решение остаётся за Memora |

## Qwen Code

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-301 | Native bootstrap через `SessionStart` | Полное | Не начато | пример и event contract есть |
| FR-302 | Pre-turn recall через `UserPromptSubmit` | Полное | Не начато | пример и `hookSpecificOutput.additionalContext` есть |
| FR-303 | Finalization через `SessionEnd` | Полное | Не начато | пример и lifecycle event есть |
| FR-304 | Write interception через `PreToolUse` / `PostToolUse` | Полное | Не начато | примеры `PreToolUse`, `PostToolUse`, `PostToolUseFailure` есть |

## OpenCode

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-401 | Native plugin bridge | Полное | Не начато | examples для `session.created`, `tool.execute.before`, `session.deleted` есть |
| FR-402 | Pre-turn recall через `chat.message` | Полное | Не начато | example есть, system-transform отделён отдельно |
| FR-403 | True close через `session.deleted` | Полное | Не начато | example есть, `session.idle` исключён как finalizer |
| FR-404 | `session.status` primary, `session.idle` legacy | Полное | Не начато | examples для `session.status` и legacy `session.idle` есть |

## Вывод

### Статус по состоянию на 2026-04-17 (обновлено после FR-204)

**Claude Code — полностью завершён (FR-101–FR-104):**
- `SessionStart` bootstrap ✅
- `UserPromptSubmit` pre-turn recall ✅
- `PreToolUse`/`PostToolUse` write gate ✅
- `SessionEnd` finalization ✅

**Codex CLI — код реализован, runtime не верифицирован (FR-201–FR-204):**

> ¹ Верифицировано тестированием 2026-04-17: Codex CLI v0.121.0 не вызывает hooks
> ни из project `.codex/config.toml`, ни из global `~/.codex/config.toml` —
> ни в `codex exec` (non-interactive), ни в интерактивном TUI.
> Функциональность `codex_hooks` помечена как `under development`.
> Все JS-хуки корректно работают при ручном вызове через `sh -c`.
> Ожидаем обновления Codex CLI с рабочей поддержкой hooks.

- `SessionStart` bootstrap: код ✅ / CLI вызов ❌
- `UserPromptSubmit` pre-turn recall: код ✅ / CLI вызов ❌
- `PreToolUse` Bash guard + `writeCanonicalFile`: код ✅ / CLI вызов ❌
- `Stop` checkpoint: код ✅ / CLI вызов ❌

**Следующие в очереди:**
- Qwen Code: FR-301–FR-304
- OpenCode: FR-401–FR-404

**Открытые архитектурные вопросы:**
- FR-205: hard-close semantics для Codex CLI (нет native `SessionEnd`)
- FR-206: ожидание рабочей поддержки `codex_hooks` в Codex CLI (отслеживать при обновлениях)

