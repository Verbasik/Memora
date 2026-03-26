---
title: "TESTING — стратегия тестирования и валидации"
id: "[project-slug]-testing"
type: "TESTING"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: []
purpose: "Фиксировать команды запуска, структуру тестов и quality gates"
entrypoint: "AGENTS.md -> INDEX.md -> TESTING.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "PROJECT.md"
  - "CONVENTIONS.md"
provides:
  - "test_commands"
  - "quality_gates"
  - "ci_pipeline"
canonical_owner: "Все вопросы о тестировании, CI и проверках перед коммитом"
last_verified: "[ГГГГ-ММ-ДД]"
max_lines: 60
---

# TESTING

Канонический источник истины о тестировании и валидации.
Используется при запуске тестов, написании новых и настройке CI.

## Contract

- when: запуск тестов; написание новых тестов; настройка CI; проверка перед коммитом
- prereq: задача затрагивает поведение кода или его валидацию
- reads: только этот файл
- writes: none
- success: понятны команды, расположение тестов и обязательные проверки
- on_fail: если команды устарели -> пометить; добавить в `OPEN_QUESTIONS.md`

## Canonical scope

- contains: команды запуска, структура тестов, покрытие, CI pipeline, тяжёлые тесты
- excludes:
  - стиль написания тестового кода -> `CONVENTIONS.md`
  - архитектурные решения по тестируемости -> `DECISIONS.md`

## Commands

```bash
[все тесты]             # полный набор
[unit-тесты]            # быстрые, без внешних зависимостей
[интеграционные тесты]  # нужен Docker / внешние сервисы
[линтер]                # стиль кода
[typecheck]             # проверка типов
[формат]                # форматирование
```

## Before commit

Обязательно: [список обязательных проверок].

## Test structure

- Unit: [расположение, паттерн имён, напр. `*.test.ts` рядом с source]
- Integration: [расположение, требования setup/teardown]
- E2E: [расположение, пререквизиты]

## Coverage

- Цель: [процент] — инструмент: [команда]

## Heavy tests

- [Тесты, требующие Docker, внешних сервисов или >30с]
- Когда запускать: [только CI / перед релизом / вручную]

## CI pipeline

- На PR: [что запускается]
- На merge в main: [что запускается]

## Failure routes

- Если тест не проходит в CI -> не мержить; зафиксировать причину в `CURRENT.md`
- Если тестового фреймворка нет -> добавить вопрос в `OPEN_QUESTIONS.md`
- Если команды устарели -> верифицировать, обновить дату `last_verified`
