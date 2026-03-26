---
title: "CONVENTIONS — инженерные соглашения проекта"
id: "[project-slug]-conventions"
type: "CONVENTIONS"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: []
purpose: "Фиксировать правила написания кода, именования и workflow, не очевидные из конфигов"
entrypoint: "AGENTS.md -> INDEX.md -> CONVENTIONS.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "PROJECT.md"
provides:
  - "code_style"
  - "naming_conventions"
  - "git_workflow"
  - "error_handling_patterns"
canonical_owner: "Все вопросы о стиле кода, именовании и workflow"
last_verified: "[ГГГГ-ММ-ДД]"
max_lines: 100
---

# CONVENTIONS

Канонический источник истины об инженерных соглашениях проекта.
Содержит только правила, НЕ очевидные из конфигов линтера/форматтера.

## Contract

- when: написание или ревью кода; создание нового модуля; настройка инструментов
- prereq: задача предполагает создание или изменение кода
- reads: только этот файл; при необходимости `ARCHITECTURE.md` для контекста модуля
- writes: none
- success: понятны правила именования, стиль, workflow и неочевидные паттерны проекта
- on_fail: если соглашение отсутствует -> зафиксировать в `OPEN_QUESTIONS.md`; не изобретать самостоятельно

## Canonical scope

- contains: структура файлов, стиль кода, naming-конвенции, git workflow, обработка ошибок
- excludes:
  - тестовая стратегия -> `TESTING.md`
  - архитектурные решения -> `DECISIONS.md`
  - бизнес-цели и scope -> `PROJECT.md`
  - конфиги линтера/форматтера (они самодокументированы)

## File organization

- Исходный код: [где живёт, структура директорий]
- Тесты: [где живут, стратегия зеркалирования]
- Именование файлов: [kebab-case / camelCase / snake_case]

## Code style

- Язык: [язык и версия]
- Форматтер: [инструмент] — конфиг: [путь]
- Линтер: [инструмент] — конфиг: [путь]

### Non-obvious rules

- Privacy zones: `<private>` (удалить), `<sensitive>` (pii_risk: high), `<ephemeral>` (только Session). Детали: `PATTERNS/privacy-control.md`.
- [Правила, которые линтер не ловит, но важны в проекте]

## Naming

| Что | Конвенция | Пример |
|-----|-----------|--------|
| Переменные/функции | | |
| Классы/типы | | |
| Константы | | |
| Таблицы/колонки БД | | |

## Git workflow

- Ветки: [паттерн, напр. feat/xxx, fix/xxx]
- Коммиты: [конвенция, напр. Conventional Commits]
- PR: [обязательные ревью, CI-проверки]

## Error handling

- Паттерн: [Result types / исключения / коды ошибок]
- Логирование: [конвенция, уровни, формат]

## Failure routes

- Если конвенция конфликтует с `CONSTITUTION.md` -> приоритет у конституции; зафиксировать в `DECISIONS.md`
- Если конвенция устарела -> пометить для ревью; добавить в `OPEN_QUESTIONS.md`
- Если нужна новая конвенция -> предложить и зафиксировать в `DECISIONS.md` до применения
