---
title: "PROJECT — идентичность и границы проекта"
id: "[project-slug]"
type: "PROJECT"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: []
purpose: "Определить название, миссию, scope и словарь домена"
entrypoint: "AGENTS.md -> INDEX.md -> PROJECT.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on: []
provides:
  - "project_identity"
  - "domain_vocabulary"
  - "scope_boundaries"
canonical_owner: "Все вопросы о том, что делает проект и для кого"
last_verified: "[ГГГГ-ММ-ДД]"
max_lines: 80
---

# PROJECT

Канонический источник истины об идентичности проекта.
Используется при первом знакомстве с проектом, вопросах scope и доменной терминологии.

## Contract

- when: первый запуск в проекте; вопросы scope; уточнение доменных терминов; определение границ задачи
- prereq: агент ещё не знаком с проектом или задача требует понимания контекста
- reads: только этот файл
- writes: none
- success: понятны цель, аудитория, границы и ключевые термины проекта
- on_fail: если scope неясен -> открыть `OPEN_QUESTIONS.md`; если архитектура нужна -> открыть `ARCHITECTURE.md`

## Canonical scope

- contains: название, тип, стадия, миссия, границы в scope / вне scope, словарь домена, стейкхолдеры
- excludes:
  - устройство системы -> `ARCHITECTURE.md`
  - инженерные соглашения -> `CONVENTIONS.md`
  - архитектурные решения -> `DECISIONS.md`
  - текущее состояние работы -> `.local/CURRENT.md`

## Identity

- **Название**: [Название проекта]
- **Тип**: [SaaS / CLI / API / библиотека / монорепо]
- **Стадия**: [MVP / beta / production / maintenance]
- **Репозиторий**: [URL]

## Mission

[2–3 предложения: что делает проект, для кого и почему это важно.]

## Boundaries

- **В scope**: [что проект покрывает]
- **Вне scope**: [что намеренно не делает]

## Domain vocabulary

| Термин | Значение в контексте проекта |
|--------|------------------------------|
|        |                              |

## Stakeholders

- Владелец продукта: [имя или роль]
- Основные пользователи: [кто использует]

## Failure routes

- Если scope задачи выходит за границы проекта -> уточнить у пользователя или зафиксировать в `OPEN_QUESTIONS.md`
- Если термин не определён в словаре -> не предполагать значение; добавить вопрос в `OPEN_QUESTIONS.md`
