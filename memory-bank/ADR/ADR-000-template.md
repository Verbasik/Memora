---
title: "ADR-NNN — [Заголовок решения]"
id: "adr-[NNN]-[slug]"
type: "ADR"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: []
purpose: "Зафиксировать архитектурное решение с полным контекстом, альтернативами и последствиями"
entrypoint: "AGENTS.md -> INDEX.md -> DECISIONS.md -> ADR/ADR-NNN.md"
authority: "controlled"
status: "[proposed|accepted|superseded|deprecated]"
reads: []
writes: []
depends_on:
  - "CONSTITUTION.md"
  - "DECISIONS.md"
provides:
  - "decision_context"
  - "alternatives_considered"
  - "tradeoffs"
date: "[ГГГГ-ММ-ДД]"
last_verified: "[ГГГГ-ММ-ДД]"
superseded_by: ""
---

# ADR-NNN: [Заголовок]

## Contract

- when: при записи нетривиального архитектурного решения; при замене существующего ADR
- prereq: решение принято или близко к принятию; проверено на соответствие `CONSTITUTION.md`
- reads: `CONSTITUTION.md`, `DECISIONS.md`, связанные `AREAS/*.md`
- writes: этот файл; строка в `DECISIONS.md`
- success: решение зафиксировано с контекстом, альтернативами и tradeoffs; ссылка добавлена в реестр
- on_fail: если конфликт с `CONSTITUTION.md` -> пометить `CONSTITUTION_CONFLICT`; не финализировать

## Context

[Какие силы действуют? Какие ограничения существуют? Почему решение было необходимо?]

## Decision

[Что мы решили? Конкретно и однозначно.]

## Alternatives

| Альтернатива | Почему отклонена |
|--------------|------------------|
|              |                  |

## Tradeoffs

- **Выигрываем**: [что улучшается или упрощается]
- **Теряем**: [что усложняется или ограничивается]

## Consequences

- **Положительные**: [долгосрочные преимущества]
- **Отрицательные**: [технический долг, риски, ограничения]

## Constitution compliance

<!-- Укажи, какие принципы из CONSTITUTION.md это решение поддерживает или затрагивает.
     Если решение конфликтует с принципом — ОБЯЗАТЕЛЬНО обоснуй почему нарушение допустимо
     и зафиксируй факт одобрения человеком. -->

- Соответствует принципу: [название]
- Потенциальный конфликт: [если есть — описание и обоснование исключения]
