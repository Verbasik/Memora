# OpenCode — подключение памяти

Инструкция по подключению memory bank в OpenCode (консольный агент).

## Обзор

- Канон: `AGENTS.md` (нативно поддерживается OpenCode).
- Маршрутизация: `memory-bank/INDEX.md`.
- Команды: `.opencode/commands/*` (update-memory, memory-audit, memory-consolidate, memory-gc, memory-explorer).

## Требования

- Установлен OpenCode CLI/инструмент.
- Репозиторий с `AGENTS.md` и `memory-bank/`.

## Настройка

1) Убедитесь, что агент стартует из корня репозитория — там лежит `AGENTS.md`.
2) Проверьте наличие команд в `.opencode/commands/` и их соответствие вашему workflow.

## Как агент читает память

1) Открывает `AGENTS.md` (канон).
2) Загружает минимальный набор файлов через `memory-bank/INDEX.md`.

## Команды (операции с памятью)

- `.opencode/commands/update-memory.md`
- `.opencode/commands/memory-audit.md`
- `.opencode/commands/memory-consolidate.md`
- `.opencode/commands/memory-gc.md`
- `.opencode/commands/memory-explorer.md`

Интегрируйте эти процедуры в ваши shell-команды/скрипты или запускайте вручную по описанию.

## Верификация установки

- Попросите агента перечислить разделы `AGENTS.md` → ожидание: видит структуру memory bank.
- Попросите определить, что читать для «архитектурной задачи» → ожидание: `ARCHITECTURE.md`.

## Триггеры обслуживания памяти

- По завершению задач — update-memory.
- Периодический аудит — memory-audit.
- Консолидация знаний — memory-consolidate.
- Рефлексия — memory-reflect (синтез инсайтов из ≥ 2 сессий).
- Очистка и архивирование — memory-gc.

## Hooks (плагин)

Плагины `.opencode/plugins/reflect-trigger.js`, `.opencode/plugins/consolidate-trigger.js` и `.opencode/plugins/gc-trigger.js` подписаны на события OpenCode и запускают соответствующие shell-проверки. Пороговые значения настраиваются через `REFLECT_THRESHOLD`, `CONSOLIDATE_THRESHOLD` и `GC_THRESHOLD`.

## Безопасность

> **⚠️ Ограничение:** OpenCode не поддерживает нативный deny/ignore-конфиг, эквивалентный `permissions.deny` в Claude Code. Защита от чтения/записи секретных файлов здесь **advisory-only** (на уровне инструкций агенту), а не hard-enforced на уровне платформы.

### Компенсирующие меры

Поскольку нативного enforcement нет, используйте следующие компенсирующие контроли:

- **`.gitignore`** — исключите `.env`, `*.key`, `*.pem`, `*.p12` из репозитория; это ограничит доступность файлов при стандартном чтении.
- **`memory-bank/POLICIES/`** — задокументируйте правила работы с секретами в политиках проекта.
- **`AGENTS.md`** — правила секретного hygiene в точке входа агента.
- **Code review** — валидируйте коммиты в memory-bank на отсутствие секретов вручную или через git pre-commit hook.

### Базовые правила

- Не хранить секреты, токены, пароли и PII в `memory-bank/`.
- Ссылаться на секреты по имени переменной окружения (`$DATABASE_URL`), не по значению.
- При обнаружении секрета в файлах памяти — немедленно удалить и ротировать значение.
- Проверять дубликаты и устаревшие факты согласно политикам.

Подробнее: `docs/SECURITY.md` в репозитории Memora.

## Troubleshooting

- Агент читает слишком много: всегда идите через `INDEX.md`.
- Нет команд: проверьте, что файлы в `.opencode/commands/` на месте и согласуйте их с вашим инструментом.
