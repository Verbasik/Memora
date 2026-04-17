# 03. Toolchain Requirements

## Назначение

Этот раздел содержит toolchain-specific интеграцию для:

- Claude Code
- Codex CLI
- Qwen Code
- OpenCode

Файл служит навигационной точкой между общим runtime contract и конкретными provider-specific examples.

## Порядок чтения

1. Сначала прочитать [02_RUNTIME_CORE_REQUIREMENTS.md](./02_RUNTIME_CORE_REQUIREMENTS.md)
2. Затем открыть соответствующий toolchain block:
   - [03A_CLAUDE_AND_CODEX.md](./03A_CLAUDE_AND_CODEX.md)
   - [03B_QWEN_AND_OPENCODE.md](./03B_QWEN_AND_OPENCODE.md)

## Правило чтения

- Если интеграция делается под Claude или Codex — достаточно файла `03A`.
- Если интеграция делается под Qwen или OpenCode — использовать [03B_QWEN_AND_OPENCODE.md](./03B_QWEN_AND_OPENCODE.md).
- Для быстрой оценки зрелости реализации сверяться с [90_FR_COVERAGE.md](./90_FR_COVERAGE.md).
