---
title: "PATTERN — Observation Typing"
id: "pattern-observation-typing"
type: "PATTERN"
version: "0.1.0"
pii_risk: "none"
ttl: null
tags: ["classification", "observations", "knowledge-management"]
purpose: "Двумерная типизация наблюдений для классификации и маршрутизации знаний"
entrypoint: "AGENTS.md -> INDEX.md -> PATTERNS/observation-typing.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "CONVENTIONS.md"
  - "INDEX.md"
provides:
  - "observation_type_vocabulary"
  - "observation_concept_vocabulary"
  - "type_to_owner_routing"
last_verified: "2026-03-23"
max_lines: 100
---

# Observation Typing

Двумерная матрица для классификации наблюдений: **Type** (что произошло) x **Concept** (какое знание).

## Contract

- when: создание FACTS/*.md; промоция в consolidate/reflect; классификация наблюдений в EPISODES
- prereq: известен контекст наблюдения
- reads: этот файл
- writes: none
- success: наблюдение однозначно типизировано; маршрут промоции определён
- on_fail: если тип неоднозначен -> `discovery`; если concept неясен -> `what-changed`

## Observation Types

Одно наблюдение = ровно ОДИН тип.

| Type | Описание | Маршрут по умолчанию |
|------|----------|---------------------|
| `bugfix` | Исправление ошибки | FACTS/, EPISODES/ |
| `feature` | Новая функциональность | ARCHITECTURE.md, AREAS/ |
| `refactor` | Реструктуризация без изменения поведения | PATTERNS/, CONVENTIONS.md |
| `discovery` | Обнаруженный факт о системе | FACTS/, OPEN_QUESTIONS.md |
| `decision` | Принятое архитектурное решение | DECISIONS.md, ADR/ |
| `incident` | Инцидент, сбой, неожиданное поведение | EPISODES/, OPEN_QUESTIONS.md |

## Observation Concepts

Одно наблюдение = 2–5 концептов из списка.

| Concept | Описание |
|---------|----------|
| `how-it-works` | Механизм, логика, алгоритм |
| `why-it-exists` | Причина, обоснование, мотивация |
| `what-changed` | Конкретные изменения (файлы, API, конфиг) |
| `problem-solution` | Проблема и её решение |
| `gotcha` | Неочевидная ловушка, подводный камень |
| `pattern` | Повторяемая техника, подход |
| `trade-off` | Компромисс, плюсы vs минусы |

## Использование

### В FACTS/_template.md (frontmatter)

```yaml
observation_type: "discovery"
concepts: ["how-it-works", "gotcha"]
```

### В EPISODES/_template.md (таблица Observations)

```markdown
| # | Наблюдение | Type | Concepts | Для промоции |
|---|-----------|------|----------|-------------|
| 1 | [текст] | discovery | how-it-works, gotcha | FACTS/[slug].md |
```

### В consolidate (маршрутизация)

При промоции используй колонку «Маршрут по умолчанию» как подсказку для выбора канонического файла-владельца.

## Pitfalls

- Type и Concepts — **разные измерения**. Type не должен дублироваться в concepts.
- Не создавай кастомные типы/концепты. Используй только предустановленные.
- Если наблюдение не подходит ни под один тип — используй `discovery` как fallback.
