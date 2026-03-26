---
title: "AGENTS — точка входа для ИИ-агентов"
purpose: "Задать bootstrap-порядок, правила работы и обязательные действия после завершения задачи"
entrypoint: "AGENTS.md -> memory-bank/INDEX.md"
authority: "controlled"
reads:
  - "memory-bank/INDEX.md"
  - "memory-bank/CONSTITUTION.md"
  - "memory-bank/.local/CURRENT.md"
  - "memory-bank/.local/HANDOFF.md"
writes:
  - "memory-bank/.local/CURRENT.md"
  - "memory-bank/.local/HANDOFF.md"
  - "memory-bank/DECISIONS.md"
  - "memory-bank/ADR/*.md"
  - "memory-bank/PATTERNS/*.md"
routing_policy: "Read minimal relevant context only"
ownership_model: "Один факт -> один файл-владелец"
security_policy: "Никогда не записывать секреты, токены, API-ключи, пароли или PII"
---

# AGENTS

## Project bootstrap
- name: `[Название проекта]`
- summary: `[однострочное описание]`
- stack: `[язык, фреймворк, БД]`
- stage: `[MVP | beta | production]`

## Entry contract
- when: в начале новой сессии; при получении новой задачи; при входе в поддиректорию с локальным `AGENTS.md`
- prereq: агент ещё не загружал весь memory-bank
- reads: сначала `memory-bank/INDEX.md`, затем только релевантные файлы
- writes: none
- success: выбран минимальный набор контекста; определены ограничения и рабочий маршрут
- on_fail: если задача неясна -> fallback к `CONSTITUTION.md`, `PROJECT.md`, `.local/CURRENT.md`, `.local/HANDOFF.md`

## Validation contract
- tests: `[команда тестов]`
- lint: `[команда линтера]`
- typecheck: `[команда typecheck]`
- before_commit: `[минимальный набор проверок]`

## Operating rules
- Все решения и изменения должны соответствовать `memory-bank/CONSTITUTION.md`.
- Нарушение конституционных правил допускается только с явным обоснованием и одобрением человека.
- Не загружай весь memory-bank без необходимости; используй маршрутизацию из `INDEX.md`.
- Один факт хранится в одном каноническом файле; ссылайся, а не дублируй.
- При ссылке на секрет используй имя переменной окружения, например `$DATABASE_URL`, а не значение.
- После значимого прогресса обновляй `memory-bank/.local/CURRENT.md`.
- Устойчивые решения записывай в `memory-bank/DECISIONS.md` и при необходимости в `ADR/`.
- Переиспользуемые инженерные техники фиксируй в `PATTERNS/`.
- Если работа ведётся внутри поддиректории, проверь ближайший локальный `AGENTS.md`.
- При конфликте между локальным и корневым `AGENTS.md` приоритет у более локального, если это не нарушает `CONSTITUTION.md`.

## Completion contract
- when: задача завершена; сессия прерывается; работа передаётся следующему агенту
- prereq: выполнены основные изменения или достигнута логическая точка остановки
- writes:
  - `memory-bank/.local/CURRENT.md`
  - `memory-bank/.local/HANDOFF.md`
  - `memory-bank/DECISIONS.md`
  - `memory-bank/ADR/*.md`
  - `memory-bank/PATTERNS/*.md`
- success:
  - обновлён статус, активные файлы и следующие шаги в `CURRENT.md`
  - подготовлен короткий briefing в `HANDOFF.md`
  - устойчивые решения промотированы в `DECISIONS.md` и `ADR/`
  - новые паттерны сохранены в `PATTERNS/`
  - запущены обязательные проверки
- on_fail:
  - если проверки не пройдены -> зафиксировать это в `CURRENT.md` и `HANDOFF.md`
  - если решение неустойчиво -> не промотировать в канонические файлы
  - если найден conflict с `CONSTITUTION.md` -> остановить промоцию и вынести на review

## Memory-bank map
- `INDEX.md` -> что читать и в каком порядке
- `CONSTITUTION.md` -> ненарушимые принципы проекта
- `PROJECT.md` -> идентичность проекта, границы, словарь
- `ARCHITECTURE.md` -> компоненты, потоки данных, зависимости
- `CONVENTIONS.md` -> стиль кода, naming, workflow
- `TESTING.md` -> тесты, CI, quality gates
- `DECISIONS.md` -> реестр решений
- `OPEN_QUESTIONS.md` -> нерешённые вопросы
- `CHANGELOG.md` -> значимые изменения
- `ADR/` -> полные записи архитектурных решений
- `PATTERNS/` -> переиспользуемые инженерные паттерны
- `AREAS/` -> знания по подсистемам
- `.local/CURRENT.md` -> текущее состояние работы
- `.local/HANDOFF.md` -> передача контекста следующей сессии
- `.local/SESSIONS/` -> журналы сессий
- `ARCHIVE/` -> устаревшие сессии