---
title: "AREAS/[subsystem] — знания о подсистеме [название]"
id: "area-[subsystem-slug]"
type: "AREA"
version: "0.1.0"
pii_risk: "none"
ttl: null
tags: []
purpose: "Фиксировать локальный контекст подсистемы: ключевые файлы, паттерны, подводные камни"
entrypoint: "AGENTS.md -> INDEX.md -> ARCHITECTURE.md -> AREAS/[subsystem].md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "ARCHITECTURE.md"
  - "DECISIONS.md"
provides:
  - "subsystem_context"
  - "key_files"
  - "known_pitfalls"
canonical_owner: "Локальный контекст конкретной подсистемы"
last_verified: "[ГГГГ-ММ-ДД]"
max_lines: 150
---

# [Название подсистемы]

Локальный контекст подсистемы. Загружай только при работе с этой конкретной областью.

## Contract

- when: работа с кодом или фичами этой подсистемы; добавление нового модуля в область
- prereq: задача относится к этой подсистеме; `ARCHITECTURE.md` уже прочитан
- reads: этот файл; при необходимости `PATTERNS/*.md` и связанные `ADR/`
- writes: none
- success: понятны ключевые файлы, паттерны и подводные камни подсистемы
- on_fail: если информации недостаточно -> fallback к `ARCHITECTURE.md`; добавить вопрос в `OPEN_QUESTIONS.md`

## Canonical scope

- contains: обзор подсистемы, ключевые файлы, используемые паттерны, подводные камни, связанные решения
- excludes:
  - верхнеуровневая архитектура -> `ARCHITECTURE.md`
  - общие engineering-правила -> `CONVENTIONS.md`
  - описание паттернов -> `PATTERNS/`

## Overview

<!-- 2–3 предложения: что делает подсистема и где живёт в кодовой базе.
     Укажи корневую директорию и основные точки входа. -->

## Key files

<!-- Только файлы, которые ЧАЩЕ ВСЕГО редактируются или являются точками входа.
     Не перечисляй всё — только критичное. -->

| Файл | Назначение |
|------|-----------|
|      |           |

## Patterns used

<!-- Ссылки на файлы в PATTERNS/. Если паттерна ещё нет — пометь ⚡ для создания. -->

## Pitfalls

<!-- 2–3 вещи, которые легко сломать. Основывайся на реальных проблемах. -->

## Related decisions

<!-- Номера ADR, связанных с этой подсистемой. -->

## Failure routes

- Если поведение подсистемы расходится с `ARCHITECTURE.md` -> пометить как drift; добавить в `OPEN_QUESTIONS.md`
- Если решение затрагивает публичную границу -> обновить `ARCHITECTURE.md` и создать ADR
