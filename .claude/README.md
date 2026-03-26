# Claude Code — подключение памяти

Эта инструкция описывает, как подключить и использовать memory bank проекта в Claude Code (CLI/консольный режим и IDE-плагины).

## Обзор

- Канонические инструкции: `CLAUDE.md` → `@AGENTS.md`.
- Маршрутизация контекста: `memory-bank/INDEX.md`.
- Skills: `.claude/skills/*/SKILL.md` (update-memory, memory-audit, memory-consolidate, memory-gc, memory-explorer).
- Политики безопасности: `.claude/settings.json` + `.claudeignore` + `.claude/rules/*`.

## Требования

- Установлен Claude Code (CLI/расширение IDE).
- Репозиторий содержит `AGENTS.md`, `CLAUDE.md`, `memory-bank/` (как в этом шаблоне).

## Настройка

1) Проверьте `CLAUDE.md` — он должен ссылаться на `@AGENTS.md` и `@memory-bank/INDEX.md`.
2) Проверьте deny-политику:
   - `.claude/settings.json` содержит `permissions.deny` для секретов/PII.
   - `.claudeignore` исключает `.env`, `*.key`, `*.pem`, `**/credentials/` и т.п.
3) Path-scoped правила активируются из `.claude/rules/`:
   - `memory-bank.md` — лимиты строк, ISO-датировка, владение фактами.
   - `security.md` — запрет чтения/записи секретов.

## Как агент читает память

1) Откройте репозиторий в Claude Code.
2) Агент читает `CLAUDE.md`, затем — `@AGENTS.md`.
3) Дальше агент загружает минимальный контекст через `memory-bank/INDEX.md` (только нужные файлы).

## Skills (операции с памятью)

Файлы-скрипты со списоком шагов:

- Обновление: `.claude/skills/update-memory/SKILL.md`
- Аудит: `.claude/skills/memory-audit/SKILL.md`
- Консолидация: `.claude/skills/memory-consolidate/SKILL.md`
- Очистка: `.claude/skills/memory-gc/SKILL.md`
- Поиск: `.claude/agents/memory-explorer.md`

Запускайте соответствующий SKILL и следуйте шагам (или автоматизируйте через задачи IDE/CLI, если поддерживается вашей установкой).

## Верификация установки

- Откройте `AGENTS.md` в сессии Claude и попросите агента перечислить разделы — он должен видеть канон.
- Попросите агента «Открой INDEX и скажи, какие файлы нужны для правки архитектуры» — ожидается ссылка на `ARCHITECTURE.md`.

## Триггеры обслуживания памяти

- После завершения задачи: выполните `update-memory`.
- Еженедельно: `memory-consolidate` + `memory-audit`.
- Ежемесячно: `memory-gc`.

## Безопасность

- Никогда не добавляйте секреты в memory bank. Используйте имена переменных окружения (`$DATABASE_URL`).
- Любые совпадения секрет-паттернов — блокировать и устранять.

## Troubleshooting

- Агент игнорирует `AGENTS.md`: убедитесь, что старт из `CLAUDE.md` указывает `@AGENTS.md`.
- Слишком много контекста: следуйте INDEX и избегайте загрузки всех файлов.
- Права доступа: проверьте `permissions.deny` и `.claudeignore`.

