# Codex CLI — подключение памяти

Инструкция по подключению memory bank в Codex CLI (консольный агент).

## Обзор

- Канон: `AGENTS.md` (нативно читается Codex CLI).
- Маршрутизация: `memory-bank/INDEX.md`.
- Skills: `.agents/skills/*/SKILL.md` (discovery path для Codex CLI, в исходном репозитории связаны с `.codex/skills/`).
- Конфиг проекта: `.codex/config.toml` (sandbox, fallbacks).

## Требования

- Установлен Codex CLI и разрешён доступ к проектным настройкам (`codex --trust-project`).
- Репозиторий с `AGENTS.md` и `memory-bank/`.

## Настройка

1) Запустите в корне: `codex --trust-project` — активирует `.codex/config.toml`.
2) Проверьте sandbox: в `config.toml` задано `sandbox = "workspace-write"`.
3) Fallback (на случай специфики конфигураций): `project_doc_fallback_filenames = ["CLAUDE.md"]` — пригодится, если Codex ищет альтернативный вход.
4) Убедитесь, что `.gitignore` исключает `memory-bank/.local/`.

## Как агент читает память

1) Агент открывает `AGENTS.md`.
2) Ссылается на `memory-bank/INDEX.md` и загружает только релевантные файлы.

## Skills (операции с памятью)

Codex CLI обнаруживает скиллы в `.agents/skills/` (не `.codex/skills/`).
В исходном репозитории Memora `.agents/skills/<name>` связаны с `.codex/skills/<name>/`, а сгенерированный scaffold разворачивает обе поверхности из общего manifest без дополнительных ручных действий.

Вызов: `$memory-bootstrap`, `$update-memory` и т.д. Или неявно — Codex подберёт нужный скилл по описанию задачи.

Доступные скиллы:

- `memory-bootstrap` — первичная инициализация
- `memory-restore` — восстановление контекста
- `update-memory` — обновление в конце работы
- `memory-audit` — аудит целостности
- `memory-consolidate` — консолидация сессий
- `memory-reflect` — синтез инсайтов
- `memory-gc` — очистка и архивация
- `memory-clarify` — анализ пробелов
- `memory-explorer` — глубокий поиск по памяти

## Верификация установки

- Команда поиска: `rg -n "Верифицировано:" memory-bank` — убедитесь, что даты расставлены.
- Быстрая проверка секретов: см. раздел "Сканирование безопасности" в `.codex/skills/memory-audit/SKILL.md`.

## Триггеры обслуживания памяти

- После завершения задачи — `update-memory`.
- Раз в неделю — `memory-consolidate` и `memory-audit`.
- Рефлексия — `memory-reflect` (синтез инсайтов из ≥ 2 сессий).
- Раз в месяц — `memory-gc`.

## Hooks

При завершении сессии (`Stop`) автоматически запускается `check-reflect-trigger.sh`. Если накопилось ≥ 3 непомеченных сессий, агент получает advisory-уведомление. Конфигурация — в `.codex/config.toml` → `[hooks.Stop]`. Порог настраивается через `REFLECT_THRESHOLD`.

## Безопасность

> **⚠️ Ограничение:** Codex CLI не поддерживает нативный deny/ignore-конфиг, эквивалентный `permissions.deny` в Claude Code. Защита от чтения/записи секретных файлов здесь **advisory-only** (на уровне инструкций агенту), а не hard-enforced на уровне платформы.

### Компенсирующие меры

Поскольку нативного enforcement нет, используйте следующие компенсирующие контроли:

- **`.gitignore`** — исключите `.env`, `*.key`, `*.pem`, `*.p12` из репозитория; Codex уважает gitignore при чтении файлов.
- **`memory-bank/POLICIES/`** — задокументируйте правила работы с секретами в политиках проекта.
- **`AGENTS.md`** — правила секретного-hygiene в точке входа агента.
- **Sandbox mode** — `sandbox = "workspace-write"` в `.codex/config.toml` ограничивает запись за пределами рабочей директории.
- **Code review** — валидируйте коммиты в memory-bank на отсутствие секретов вручную или через git pre-commit hook.

### Базовые правила

- Не хранить секреты, токены, пароли и PII в `memory-bank/`.
- Ссылаться на секреты по имени переменной окружения (`$DATABASE_URL`), не по значению.
- При обнаружении секрета в файлах памяти — немедленно удалить и ротировать значение.

Подробнее: `docs/SECURITY.md` в репозитории Memora.

## Troubleshooting

- Агент загружает слишком много: сверяйтесь с `INDEX.md`, избегайте полного чтения `memory-bank/`.
- Навигация не работает: убедитесь, что `AGENTS.md` в корне, а `.codex/config.toml` активирован через `--trust-project`.
