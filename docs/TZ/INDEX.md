# TЗ Runtime Bridge Integration

## Назначение

Этот каталог является **канонической коммитируемой версией** технического задания по интеграции runtime layer Memora с CLI toolchains:

- Claude Code
- Codex CLI
- Qwen Code
- OpenCode

Документ намеренно разделён на несколько файлов, чтобы:

- убрать зависимость от одного перегруженного монолита;
- дать следующему агенту короткую иерархию чтения;
- отделить контекст и scope от требований, примеров и карты покрытия.

## Порядок чтения

1. [01_CONTEXT_AND_SCOPE.md](./01_CONTEXT_AND_SCOPE.md)
2. [02_RUNTIME_CORE_REQUIREMENTS.md](./02_RUNTIME_CORE_REQUIREMENTS.md)
3. [03_TOOLCHAIN_REQUIREMENTS.md](./03_TOOLCHAIN_REQUIREMENTS.md)
4. [04_QUALITY_DATA_INTEGRATIONS.md](./04_QUALITY_DATA_INTEGRATIONS.md)
5. [05_DELIVERY_TRACEABILITY.md](./05_DELIVERY_TRACEABILITY.md)
6. [90_FR_COVERAGE.md](./90_FR_COVERAGE.md)

## Структура

| Файл | Назначение | Статус |
|---|---|---|
| [01_CONTEXT_AND_SCOPE.md](./01_CONTEXT_AND_SCOPE.md) | Executive summary, основание, цели, scope, роли, use cases | Готово |
| [02_RUNTIME_CORE_REQUIREMENTS.md](./02_RUNTIME_CORE_REQUIREMENTS.md) | Общие функциональные требования shared bridge layer | Готово |
| [03_TOOLCHAIN_REQUIREMENTS.md](./03_TOOLCHAIN_REQUIREMENTS.md) | Навигация по provider-specific integration sections | Готово |
| [03A_CLAUDE_AND_CODEX.md](./03A_CLAUDE_AND_CODEX.md) | Claude Code и Codex CLI: event mapping, FR, provider examples | Готово |
| [03B_QWEN_AND_OPENCODE.md](./03B_QWEN_AND_OPENCODE.md) | Qwen Code и OpenCode: event mapping, FR, provider examples | Готово |
| [04_QUALITY_DATA_INTEGRATIONS.md](./04_QUALITY_DATA_INTEGRATIONS.md) | NFR, данные, интеграции, ограничения | Готово |
| [05_DELIVERY_TRACEABILITY.md](./05_DELIVERY_TRACEABILITY.md) | Риски, приемка, этапы, трассируемость, итоговая оценка | Готово |
| [90_FR_COVERAGE.md](./90_FR_COVERAGE.md) | Карта покрытия FR-ID: примеры, код, пробелы | Готово |

## Правила миграции

- При переносе разделов из рабочего черновика нельзя менять смысл требований без явной пометки.
- Если в источнике есть **Fact / Assumption / Recommendation**, это разграничение сохраняется.
- Примеры из официальных provider sources должны оставаться рядом с соответствующими требованиями.
- Карта покрытия в [90_FR_COVERAGE.md](./90_FR_COVERAGE.md) обновляется после каждого значимого патча.

## Текущий статус (2026-04-17)

### Завершено
- Общий shared bridge layer (`lib/runtime/bridge/index.js`) — FR-001.
- Claude Code bridge полностью реализован (FR-101–FR-104):
  - `SessionStart` bootstrap → `lib/runtime/bridge/claude.js`
  - `UserPromptSubmit` pre-turn recall → `.claude/hooks/user-prompt-submit.js`
  - `PreToolUse`/`PostToolUse` write gate → `.claude/hooks/pre-tool-use.js`, `post-tool-use.js`
  - `SessionEnd` finalization → `.claude/hooks/session-end.js`

### Следующие этапы
- Codex CLI: SessionStart, UserPromptSubmit, Stop-checkpoint, write helper (FR-201–FR-204).
- Qwen Code: полный hook set (FR-301–FR-304).
- OpenCode: plugin bridge (FR-401–FR-404).
