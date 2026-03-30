# Qwen Code — подключение памяти

Инструкция по подключению memory bank в Qwen Code (консольный/IDE-агент).

## Обзор

- Канон: `AGENTS.md` (указывается в `.qwen/settings.json`).
- Маршрутизация: `memory-bank/INDEX.md`.
- Skills: `.qwen/agents/*` (описания процедур для update-memory, memory-audit, memory-consolidate, memory-gc, memory-explorer).
- Файл игнора: `.qwen/settings.qwenignore`.

## Требования

- Установлен Qwen Code.
- Репозиторий с `AGENTS.md` и `memory-bank/`.

## Настройка

1) Проверьте `.qwen/settings.json`:

```json
{
  "context": {
    "fileName": ["AGENTS.md"]
  }
}
```

2) Проверьте `.qwen/settings.qwenignore` — исключает секреты и лишние файлы.

## Как агент читает память

1) Агент загружает `AGENTS.md` согласно `settings.json`.
2) По `INDEX.md` выбирает минимальный набор файлов из `memory-bank/`.

## Skills (операции с памятью)

Смотрите файлы-агенты в `.qwen/agents/`:

- `update-memory.md`
- `memory-audit.md`
- `memory-consolidate.md`
- `memory-gc.md`
- `memory-explorer.md`

Следуйте описанным шагам или интегрируйте вызовы в ваш рабочий процесс.

## Верификация установки

- Попросите агента: «Прочитай AGENTS.md и открой INDEX» — должен перечислить, какие файлы читать для вашей задачи.
- Проверьте, что игнор правил не мешает чтению `memory-bank/`.

## Триггеры обслуживания памяти

- После завершения задач: `update-memory`.
- Периодически: `memory-audit` и `memory-consolidate`.
- Рефлексия: `memory-reflect` (синтез инсайтов из ≥ 2 сессий).
- Регулярно: `memory-gc` (очистка и архивирование).

## Hooks

При завершении сессии (`Stop`) автоматически запускается `check-reflect-trigger.sh`. Если накопилось ≥ 3 непомеченных сессий, агент получает advisory-уведомление. Конфигурация — в `.qwen/settings.json` → `hooks.Stop`. Порог настраивается через `REFLECT_THRESHOLD`.

## Безопасность

- Не хранить секреты/PII. Использовать имена переменных окружения.
- При обнаружении секретов — удалить/заменить и проверить игнор-листы.

## Troubleshooting

- `AGENTS.md` не подхватывается: проверьте `settings.json` (секция `context.fileName`).
- Слишком много контекста: загрузка должна идти через `INDEX.md` (минимальный набор).
