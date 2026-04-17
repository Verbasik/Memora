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
| FR-002 | Session bootstrap orchestration | Не требуется | Частично | общий bootstrap есть, но toolchain wiring покрыт не для всех |
| FR-003 | Turn lifecycle orchestration | Не требуется | Частично | `prepareTurn()` реализован, native hook wiring ещё не везде |
| FR-004 | Canonical write gate | Не требуется | Не начато | runtime API существует, adapter interception почти не подключён |
| FR-005 | Graceful fallback | Не требуется | Частично | в shared bridge есть graceful degradation tests |
| FR-006 | Toolchain source tagging | Не требуется | Частично | shared bridge принимает `toolchain`, но не все adapters это используют |
| FR-007 | Finalize strategy split between checkpoint and true close | Не требуется | Не начато | пока зафиксировано только в ТЗ |

## Claude Code

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-101 | Native bootstrap через `SessionStart` | Полное | Реализовано | `.claude/hooks/session-start.js`, `lib/runtime/bridge/claude.js`, `test/runtime/claude-session-start.test.js` |
| FR-102 | Pre-turn recall через `UserPromptSubmit` | Полное | Не начато | в ТЗ есть пример, в коде wiring ещё не добавлен |
| FR-103 | Finalization через `SessionEnd` | Полное | Не начато | в ТЗ есть пример, в `.claude/settings.json` пока нет |
| FR-104 | Write interception через `PreToolUse` / `PostToolUse` | Полное | Не начато | в ТЗ есть примеры для screening и post-write sync |

## Codex CLI

| ID | Кратко | Покрытие официальными примерами | Статус реализации | Основание |
|---|---|---|---|---|
| FR-201 | Native bootstrap через `SessionStart` | Полное | Не начато | source-backed example есть, адаптер в коде ещё не добавлен |
| FR-202 | Pre-turn recall через `UserPromptSubmit` | Полное | Не начато | plain-stdout example зафиксирован в ТЗ |
| FR-203 | `PreToolUse` / `PostToolUse` не универсальны | Частичное | Не начато | provider shape ясен, но Memora explicit helper остаётся собственной адаптацией |
| FR-204 | `Stop` как checkpoint, не true close | Полное | Не начато | source-backed example есть, wiring нет |
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

- **Разработку можно начинать сразу** по Claude Code, Qwen Code и OpenCode.
- **Codex CLI тоже можно начинать**, если принять, что `Stop` — это checkpoint, а не полноценный `SessionEnd`.
- Единственный незакрытый архитектурный вопрос, который остаётся сверх provider examples: **FR-205 / hard-close semantics для Codex CLI**.

