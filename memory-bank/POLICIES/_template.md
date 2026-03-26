---
title: "POLICIES/[slug] — [название политики]"
id: "policy-[slug]"
type: "POLICY"
version: "1.0.0"
authority: "controlled"
status: "active"
owner: "[роль или команда]"
scope: "[на что распространяется — файлы, данные, агенты, процессы]"
created_at: "[ГГГГ-ММ-ДД]"
pii_risk: "none"
ttl: null
tags: []
last_verified: "[ГГГГ-ММ-ДД]"
---

# Policy: [Название]

Политика управления, безопасности или конфиденциальности.
Загружай когда задача затрагивает хранение данных, PII, доступ или governance.

## Contract

- when: задача связана с хранением данных, PII, доступом, security или governance
- prereq: политика принята и проверена на соответствие `CONSTITUTION.md`
- reads: этот файл; при необходимости `CONSTITUTION.md`
- writes: при обновлении политики (требует human review для controlled/immutable)
- success: понятны правила и их область применения; нет конфликта с CONSTITUTION.md
- on_fail: если политика конфликтует с `CONSTITUTION.md` -> пометить `CONSTITUTION_CONFLICT`

## Canonical scope

- contains: правила, область применения, исключения, sanctions
- excludes:
  - принципы уровня CONSTITUTION -> `CONSTITUTION.md`
  - архитектурные решения -> `DECISIONS.md`

## Purpose

<!-- Зачем эта политика существует. 1–2 предложения. -->

[Цель политики]

## Scope

<!-- На что распространяется: типы данных, файлы, агенты, процессы, системы. -->

- **Применяется к**: [что покрывает]
- **Не применяется к**: [исключения]

## Rules

<!-- Конкретные правила. Каждое — отдельный пункт. -->

1. [Правило 1]
2. [Правило 2]
3. [Правило 3]

## Violations

<!-- Что происходит при нарушении. -->

- [действие при нарушении]

## Review schedule

- Периодичность проверки: [ежеквартально / ежегодно / при изменении законодательства]
- Следующий review: [ГГГГ-ММ-ДД]

## Constitution compliance

- Соответствует принципу: [название из CONSTITUTION.md]

## Failure routes

- Нарушение политики -> `CONSTITUTION_CONFLICT` -> human review
- Политика устарела -> пометить `status: deprecated` -> создать новую версию
