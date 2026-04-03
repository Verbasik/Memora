---
title: "ARCHITECTURE — архитектура системы"
id: "[project-slug]-architecture"
type: "ARCHITECTURE"
version: "0.1.0"
status: "active"
pii_risk: "none"
ttl: null
tags: []
purpose: "Фиксировать верхнеуровневую структуру системы, границы модулей, потоки данных и внешние зависимости"
entrypoint: "AGENTS.md -> INDEX.md -> ARCHITECTURE.md"
authority: "controlled"
scope: "Архитектурные решения, карта компонентов, публичные границы, интеграции"
canonical_owner: "Все вопросы об устройстве системы и связях между модулями"
reads: []
writes: []
depends_on:
  - "PROJECT.md"
  - "DECISIONS.md"
provides:
  - "component_map"
  - "module_boundaries"
  - "data_flows"
  - "integration_points"
last_verified: "[ГГГГ-ММ-ДД]"
max_lines: 120
---

# ARCHITECTURE

Канонический источник истины об устройстве системы.
Используется для архитектурных задач, изменения границ модулей и добавления новых сервисов.

## Contract
- when: архитектурные задачи; изменение модулей; добавление сервисов; анализ потоков данных; интеграции
- prereq: понятна цель задачи и её связь с системой
- reads: при необходимости `PROJECT.md`, `DECISIONS.md`, `ADR/`, `AREAS/<имя>.md`
- writes: none
- success: определены релевантные компоненты, их связи, границы и точки изменения
- on_fail: если структуры недостаточно -> открыть `AREAS/<имя>.md`; если причина решения неясна -> открыть `DECISIONS.md` и `ADR/`

## Canonical scope
- contains:
  - верхнеуровневую схему системы
  - список модулей и их ответственности
  - потоки данных между компонентами
  - внешние зависимости и интеграции
  - публичные и внутренние границы модулей
- excludes:
  - бизнес-цели проекта -> `PROJECT.md`
  - coding style и naming -> `CONVENTIONS.md`
  - тестовые стратегии -> `TESTING.md`
  - исторические причины выбора -> `DECISIONS.md` и `ADR/`
  - текущее состояние работы -> `.local/CURRENT.md`

## System overview
[2–4 предложения: что это за система и как она работает на верхнем уровне.]

## Component map
```text
[ASCII-диаграмма основных компонентов и их связей]
````

## Modules

| Module   | Responsibility | Public entrypoint     | Depends on | Verified |
| -------- | -------------- | --------------------- | ---------- | -------- |
| [module] | [что делает]   | [API/handler/service] | [deps]     | [date]   |

## Data flows

### Flow: [название потока]

* trigger: [что инициирует поток]
* input: [какие данные приходят]
* path: [request -> processing -> storage -> response]
* output: [что возвращается или публикуется]
* failure_mode: [что происходит при ошибке]

## External dependencies

| Dependency | Purpose       | Version   | Integration point | Notes         |
| ---------- | ------------- | --------- | ----------------- | ------------- |
| [name]     | [зачем нужна] | [version] | [where used]      | [особенности] |

## Infrastructure

* hosting: [где запускается]
* database: [тип и расположение]
* messaging: [очереди / брокеры / none]
* storage: [blob / file / CDN / none]
* deployment: [docker / k8s / vm / serverless]
* observability: [logs / metrics / tracing]

## Module boundaries

### Public APIs

* [module/interface]: [что доступно извне]

### Internal contracts

* [module/interface]: [что считается внутренним и не должно использоваться напрямую]

### Invariants

* [архитектурный инвариант 1]
* [архитектурный инвариант 2]

## Change policy

* Новые модули добавляются только с явной ответственностью и точкой входа.
* Если меняется публичная граница, обнови связанные `AREAS/`, `DECISIONS.md` и при необходимости `ADR/`.
* Если модуль нарушает существующие инварианты, изменение требует human review.
* Неподтверждённые архитектурные предположения не фиксируются как канонические.

## Failure routes

* Если модуль не удаётся классифицировать -> уточнить через `PROJECT.md` или `AREAS/<имя>.md`
* Если поток данных не подтверждён -> пометить как open question
* Если архитектурное решение спорное -> зафиксировать в `DECISIONS.md` и вынести в `ADR/`
